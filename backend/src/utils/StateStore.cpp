#include "utils/StateStore.hpp"

#include "utils/Json.hpp"
#include "utils/Log.hpp"
#include <yyjson.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <filesystem>
#include <format>
#include <system_error>

namespace tt::storage
{

std::string serialize_label_list(std::vector<std::string> const &labels)
{
    tt::json::MutableDocument doc;
    if (!doc.is_valid())
    {
        return {};
    }
    auto *native = doc.doc();
    auto *root = yyjson_mut_arr(native);
    doc.set_root(root);
    for (auto const &label : labels)
    {
        yyjson_mut_arr_add_str(native, root, label.c_str());
    }
    return doc.write("[]");
}

std::vector<std::string> deserialize_label_list(std::string const &payload)
{
    std::vector<std::string> result;
    if (payload.empty())
    {
        return result;
    }
    auto doc = tt::json::Document::parse(payload);
    if (!doc.is_valid())
    {
        return result;
    }
    auto *root = doc.root();
    if (root == nullptr || !yyjson_is_arr(root))
    {
        return result;
    }
    size_t idx, limit;
    yyjson_val *entry = nullptr;
    yyjson_arr_foreach(root, idx, limit, entry)
    {
        if (yyjson_is_str(entry))
        {
            result.emplace_back(yyjson_get_str(entry));
        }
    }
    return result;
}

namespace
{

constexpr int kDatabaseBusyTimeoutMs = 5000;
constexpr char const *kRecoverySuffix = "_old";
constexpr std::array<std::string_view, 3> kPersistentTables = {
    {"settings", "torrents", "speed_history"}};

std::optional<std::vector<std::uint8_t>> copy_column_blob(sqlite3_stmt *stmt,
                                                          int index)
{
    auto size = sqlite3_column_bytes(stmt, index);
    if (size <= 0)
    {
        return std::vector<std::uint8_t>{};
    }
    auto data = sqlite3_column_blob(stmt, index);
    if (data == nullptr)
    {
        return std::vector<std::uint8_t>{};
    }
    return std::vector<std::uint8_t>(
        reinterpret_cast<std::uint8_t const *>(data),
        reinterpret_cast<std::uint8_t const *>(data) +
            static_cast<std::size_t>(size));
}

} // namespace

Database::Database(std::filesystem::path path) : path_(std::move(path))
{
    if (path_.empty())
    {
        return;
    }
    auto parent = path_.parent_path();
    if (!parent.empty())
    {
        std::filesystem::create_directories(parent);
    }
    int rc = sqlite3_open_v2(path_.string().c_str(), &db_,
                             SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE |
                                 SQLITE_OPEN_FULLMUTEX,
                             nullptr);
    if (rc != SQLITE_OK)
    {
        TT_LOG_INFO("failed to open sqlite database {}: {}", path.string(),
                    sqlite3_errstr(rc));
        sqlite3_close(db_);
        db_ = nullptr;
        return;
    }
    char *err_msg = nullptr;
    rc = sqlite3_exec(db_, "PRAGMA journal_mode=WAL;", nullptr, nullptr,
                      &err_msg);
    if (rc != SQLITE_OK)
    {
        if (err_msg != nullptr)
        {
            TT_LOG_INFO("failed to enable WAL journal mode: {}", err_msg);
            sqlite3_free(err_msg);
        }
    }
    else if (err_msg != nullptr)
    {
        sqlite3_free(err_msg);
    }
    sqlite3_busy_timeout(db_, kDatabaseBusyTimeoutMs);
    if (!ensure_schema())
    {
        sqlite3_close(db_);
        db_ = nullptr;
    }
}

Database::~Database()
{
    for (auto &entry : stmt_cache_)
    {
        if (entry.second != nullptr)
        {
            sqlite3_finalize(entry.second);
        }
    }
    stmt_cache_.clear();
    if (db_)
    {
        sqlite3_close(db_);
        db_ = nullptr;
    }
}

bool Database::ensure_schema()
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *kSchemaVersionSql =
        "CREATE TABLE IF NOT EXISTS schema_version ("
        "id INTEGER PRIMARY KEY CHECK(id = 1),"
        "version INTEGER NOT NULL);";
    if (!execute(kSchemaVersionSql))
    {
        return false;
    }
    return run_migrations();
}

bool Database::execute(std::string const &sql) const
{
    if (!db_)
    {
        return false;
    }
    char *err_msg = nullptr;
    int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &err_msg);
    if (rc != SQLITE_OK)
    {
        if (err_msg != nullptr)
        {
            TT_LOG_INFO("sqlite error: {}", err_msg);
            sqlite3_free(err_msg);
        }
        return false;
    }
    return true;
}

bool Database::run_migrations()
{
    if (!ensure_schema_version_row())
    {
        return false;
    }
    auto current = schema_version().value_or(0);
    struct Migration
    {
        int version;
        bool (Database::*apply)() const;
    };
    static constexpr Migration kMigrations[] = {
        {1, &Database::apply_migration_v1},
    };
    for (auto const &migration : kMigrations)
    {
        if (current >= migration.version)
        {
            continue;
        }
        if (!(this->*migration.apply)())
        {
            TT_LOG_INFO("schema migration v{} failed, attempting recovery",
                        migration.version);
            if (!recover_schema_from_existing())
            {
                TT_LOG_INFO("schema recovery failed");
                return false;
            }
            return run_migrations();
        }
        if (!set_schema_version(migration.version))
        {
            return false;
        }
        current = migration.version;
    }
    return true;
}

bool Database::ensure_schema_version_row() const
{
    constexpr char const *sql =
        "INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);";
    return execute(sql);
}

std::optional<int> Database::schema_version() const
{
    if (!db_)
    {
        return std::nullopt;
    }
    constexpr char const *sql =
        "SELECT version FROM schema_version WHERE id = 1 LIMIT 1;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return std::nullopt;
    }
    std::optional<int> result;
    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        result = static_cast<int>(sqlite3_column_int(stmt, 0));
    }
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return result;
}

bool Database::set_schema_version(int version) const
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql =
        "INSERT OR REPLACE INTO schema_version (id, version) VALUES (1, ?);";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_int(stmt, 1, version);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

bool Database::apply_migration_v1() const
{
    constexpr char const *kSettingsSql = "CREATE TABLE IF NOT EXISTS settings ("
                                         "key TEXT PRIMARY KEY,"
                                         "value TEXT NOT NULL);";
    constexpr char const *kTorrentsSql = "CREATE TABLE IF NOT EXISTS torrents ("
                                         "info_hash TEXT PRIMARY KEY,"
                                         "magnet_uri TEXT,"
                                         "save_path TEXT,"
                                         "resume_data BLOB,"
                                         "metainfo BLOB,"
                                         "paused INTEGER,"
                                         "labels TEXT,"
                                         "added_at INTEGER,"
                                         "rpc_id INTEGER,"
                                         "metadata_path TEXT);";
    constexpr char const *kSpeedHistorySql =
        "CREATE TABLE IF NOT EXISTS speed_history ("
        "timestamp INTEGER PRIMARY KEY,"
        "down_bytes INTEGER NOT NULL,"
        "up_bytes INTEGER NOT NULL);";
    return execute(kSettingsSql) && execute(kTorrentsSql) &&
           execute(kSpeedHistorySql);
}

sqlite3_stmt *Database::prepare_cached(std::string const &sql) const
{
    if (!db_)
    {
        return nullptr;
    }
    auto it = stmt_cache_.find(sql);
    if (it != stmt_cache_.end())
    {
        if (it->second != nullptr)
        {
            sqlite3_reset(it->second);
            sqlite3_clear_bindings(it->second);
        }
        return it->second;
    }
    sqlite3_stmt *stmt = nullptr;
    int rc = sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr);
    if (rc != SQLITE_OK)
    {
        TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
        return nullptr;
    }
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    stmt_cache_.emplace(sql, stmt);
    return stmt;
}

bool Database::begin_transaction() const
{
    return execute("BEGIN TRANSACTION;");
}

bool Database::commit_transaction() const
{
    return execute("COMMIT;");
}

bool Database::rollback_transaction() const
{
    return execute("ROLLBACK;");
}

std::optional<std::string> Database::get_setting(std::string const &key) const
{
    if (!db_)
    {
        return std::nullopt;
    }
    constexpr char const *sql =
        "SELECT value FROM settings WHERE key = ? LIMIT 1;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return std::nullopt;
    }
    sqlite3_bind_text(stmt, 1, key.c_str(), -1, SQLITE_TRANSIENT);
    std::optional<std::string> value;
    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        auto text =
            reinterpret_cast<char const *>(sqlite3_column_text(stmt, 0));
        if (text != nullptr)
        {
            value = std::string(text);
        }
    }
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return value;
}

bool Database::set_setting(std::string const &key, std::string const &value)
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql =
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_text(stmt, 1, key.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, value.c_str(), -1, SQLITE_TRANSIENT);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

bool Database::remove_setting(std::string const &key)
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql = "DELETE FROM settings WHERE key = ?;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_text(stmt, 1, key.c_str(), -1, SQLITE_TRANSIENT);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

std::vector<PersistedTorrent> Database::load_torrents() const
{
    std::vector<PersistedTorrent> result;
    if (!db_)
    {
        return result;
    }
    constexpr char const *sql =
        "SELECT info_hash, magnet_uri, save_path, resume_data, metainfo, "
        "paused,"
        "labels, added_at, rpc_id, metadata_path FROM torrents;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return result;
    }
    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        PersistedTorrent entry;
        auto *hash =
            reinterpret_cast<char const *>(sqlite3_column_text(stmt, 0));
        if (hash != nullptr)
        {
            entry.hash = hash;
        }
        if (auto *uri =
                reinterpret_cast<char const *>(sqlite3_column_text(stmt, 1));
            uri != nullptr)
        {
            entry.magnet_uri = std::string(uri);
        }
        if (auto *path =
                reinterpret_cast<char const *>(sqlite3_column_text(stmt, 2));
            path != nullptr)
        {
            entry.save_path = std::string(path);
        }
        if (auto blob = copy_column_blob(stmt, 3))
        {
            entry.resume_data = std::move(*blob);
        }
        if (auto blob = copy_column_blob(stmt, 4))
        {
            entry.metainfo = std::move(*blob);
        }
        entry.paused = sqlite3_column_int(stmt, 5) != 0;
        if (auto *labels =
                reinterpret_cast<char const *>(sqlite3_column_text(stmt, 6));
            labels != nullptr)
        {
            entry.labels = std::string(labels);
        }
        entry.added_at =
            static_cast<std::uint64_t>(sqlite3_column_int64(stmt, 7));
        entry.rpc_id = static_cast<int>(sqlite3_column_int(stmt, 8));
        if (auto *metadata =
                reinterpret_cast<char const *>(sqlite3_column_text(stmt, 9));
            metadata != nullptr)
        {
            entry.metadata_path = std::string(metadata);
        }
        if (!entry.hash.empty())
        {
            result.push_back(std::move(entry));
        }
    }
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return result;
}

bool Database::upsert_torrent(PersistedTorrent const &torrent)
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql = "INSERT OR REPLACE INTO torrents "
                                "(info_hash, magnet_uri, save_path, "
                                "resume_data, metainfo, paused, labels,"
                                "added_at, rpc_id, metadata_path) VALUES (?, "
                                "?, ?, ?, ?, ?, ?, ?, ?, ?);";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_text(stmt, 1, torrent.hash.c_str(), -1, SQLITE_TRANSIENT);
    if (torrent.magnet_uri)
    {
        sqlite3_bind_text(stmt, 2, torrent.magnet_uri->c_str(), -1,
                          SQLITE_TRANSIENT);
    }
    else
    {
        sqlite3_bind_null(stmt, 2);
    }
    if (torrent.save_path)
    {
        sqlite3_bind_text(stmt, 3, torrent.save_path->c_str(), -1,
                          SQLITE_TRANSIENT);
    }
    else
    {
        sqlite3_bind_null(stmt, 3);
    }
    if (!torrent.resume_data.empty())
    {
        sqlite3_bind_blob(stmt, 4, torrent.resume_data.data(),
                          static_cast<int>(torrent.resume_data.size()),
                          SQLITE_TRANSIENT);
    }
    else
    {
        sqlite3_bind_null(stmt, 4);
    }
    if (!torrent.metainfo.empty())
    {
        sqlite3_bind_blob(stmt, 5, torrent.metainfo.data(),
                          static_cast<int>(torrent.metainfo.size()),
                          SQLITE_TRANSIENT);
    }
    else
    {
        sqlite3_bind_null(stmt, 5);
    }
    sqlite3_bind_int(stmt, 6, torrent.paused ? 1 : 0);
    if (!torrent.labels.empty())
    {
        sqlite3_bind_text(stmt, 7, torrent.labels.c_str(), -1,
                          SQLITE_TRANSIENT);
    }
    else
    {
        sqlite3_bind_null(stmt, 7);
    }
    sqlite3_bind_int64(stmt, 8, static_cast<sqlite3_int64>(torrent.added_at));
    sqlite3_bind_int(stmt, 9, torrent.rpc_id);
    if (!torrent.metadata_path.empty())
    {
        sqlite3_bind_text(stmt, 10, torrent.metadata_path.c_str(), -1,
                          SQLITE_TRANSIENT);
    }
    else
    {
        sqlite3_bind_null(stmt, 10);
    }
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

bool Database::update_save_path(std::string const &hash,
                                std::string const &path) const
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql =
        "UPDATE torrents SET save_path = ? WHERE info_hash = ?;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_text(stmt, 1, path.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

bool Database::update_rpc_id(std::string const &hash, int rpc_id) const
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql =
        "UPDATE torrents SET rpc_id = ? WHERE info_hash = ?;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_int(stmt, 1, rpc_id);
    sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

bool Database::update_metadata(std::string const &hash, std::string const &path,
                               std::vector<std::uint8_t> const &metadata) const
{
    if (!db_)
    {
        return false;
    }
    if (!metadata.empty())
    {
        constexpr char const *sql = "UPDATE torrents SET metadata_path = ?, "
                                    "metainfo = ? WHERE info_hash = ?;";
        auto *stmt = prepare_cached(sql);
        if (stmt == nullptr)
        {
            return false;
        }
        sqlite3_bind_text(stmt, 1, path.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_blob(stmt, 2, metadata.data(),
                          static_cast<int>(metadata.size()), SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, hash.c_str(), -1, SQLITE_TRANSIENT);
        int rc = sqlite3_step(stmt);
        sqlite3_reset(stmt);
        sqlite3_clear_bindings(stmt);
        return rc == SQLITE_DONE;
    }
    constexpr char const *sql =
        "UPDATE torrents SET metadata_path = ? WHERE info_hash = ?;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_text(stmt, 1, path.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

bool Database::delete_torrent(std::string const &hash)
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql = "DELETE FROM torrents WHERE info_hash = ?;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_text(stmt, 1, hash.c_str(), -1, SQLITE_TRANSIENT);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

bool Database::update_labels(std::string const &hash,
                             std::string const &labels_json)
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql =
        "UPDATE torrents SET labels = ? WHERE info_hash = ?;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_text(stmt, 1, labels_json.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

bool Database::update_resume_data(std::string const &hash,
                                  std::vector<std::uint8_t> const &data)
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql =
        "UPDATE torrents SET resume_data = ? WHERE info_hash = ?;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    if (!data.empty())
    {
        sqlite3_bind_blob(stmt, 1, data.data(), static_cast<int>(data.size()),
                          SQLITE_TRANSIENT);
    }
    else
    {
        sqlite3_bind_null(stmt, 1);
    }
    sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

std::optional<std::vector<std::uint8_t>>
Database::resume_data(std::string const &hash) const
{
    if (!db_)
    {
        return std::nullopt;
    }
    constexpr char const *sql =
        "SELECT resume_data FROM torrents WHERE info_hash = ? LIMIT 1;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return std::nullopt;
    }
    sqlite3_bind_text(stmt, 1, hash.c_str(), -1, SQLITE_TRANSIENT);
    std::optional<std::vector<std::uint8_t>> result;
    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        result = copy_column_blob(stmt, 0);
    }
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return result;
}

bool Database::insert_speed_history(std::int64_t timestamp,
                                    std::uint64_t down_bytes,
                                    std::uint64_t up_bytes) const
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql =
        "INSERT OR REPLACE INTO speed_history (timestamp, down_bytes, up_bytes)"
        " VALUES (?, ?, ?);";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_int64(stmt, 1, static_cast<sqlite3_int64>(timestamp));
    sqlite3_bind_int64(stmt, 2, static_cast<sqlite3_int64>(down_bytes));
    sqlite3_bind_int64(stmt, 3, static_cast<sqlite3_int64>(up_bytes));
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

std::vector<SpeedHistoryEntry>
Database::query_speed_history(std::int64_t start, std::int64_t end,
                              std::int64_t step) const
{
    std::vector<SpeedHistoryEntry> result;
    if (!db_ || step <= 0 || start >= end)
    {
        return result;
    }
    constexpr char const *sql = "SELECT ((timestamp / ?) * ?) AS bucket,"
                                " SUM(down_bytes),"
                                " SUM(up_bytes),"
                                " MAX(down_bytes),"
                                " MAX(up_bytes)"
                                " FROM speed_history"
                                " WHERE timestamp >= ? AND timestamp < ?"
                                " GROUP BY bucket"
                                " ORDER BY bucket ASC;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return result;
    }
    sqlite3_bind_int64(stmt, 1, step);
    sqlite3_bind_int64(stmt, 2, step);
    sqlite3_bind_int64(stmt, 3, start);
    sqlite3_bind_int64(stmt, 4, end);
    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        SpeedHistoryEntry entry;
        entry.timestamp = sqlite3_column_int64(stmt, 0);
        auto total_down = sqlite3_column_int64(stmt, 1);
        auto total_up = sqlite3_column_int64(stmt, 2);
        auto peak_down = sqlite3_column_int64(stmt, 3);
        auto peak_up = sqlite3_column_int64(stmt, 4);
        entry.total_down =
            total_down < 0 ? 0 : static_cast<std::uint64_t>(total_down);
        entry.total_up =
            total_up < 0 ? 0 : static_cast<std::uint64_t>(total_up);
        entry.peak_down =
            peak_down < 0 ? 0 : static_cast<std::uint64_t>(peak_down);
        entry.peak_up = peak_up < 0 ? 0 : static_cast<std::uint64_t>(peak_up);
        result.push_back(entry);
    }
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return result;
}

bool Database::delete_speed_history_before(std::int64_t timestamp) const
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql =
        "DELETE FROM speed_history WHERE timestamp < ?;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_int64(stmt, 1, timestamp);
    int rc = sqlite3_step(stmt);
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return rc == SQLITE_DONE;
}

bool Database::delete_speed_history_all() const
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql = "DELETE FROM speed_history;";
    return execute(sql);
}

bool Database::table_exists(std::string const &name) const
{
    if (!db_)
    {
        return false;
    }
    constexpr char const *sql =
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1;";
    auto *stmt = prepare_cached(sql);
    if (stmt == nullptr)
    {
        return false;
    }
    sqlite3_bind_text(stmt, 1, name.c_str(), -1, SQLITE_TRANSIENT);
    bool exists = sqlite3_step(stmt) == SQLITE_ROW;
    sqlite3_reset(stmt);
    sqlite3_clear_bindings(stmt);
    return exists;
}

std::vector<std::string>
Database::columns_for_table(std::string const &table) const
{
    std::vector<std::string> result;
    if (!db_)
    {
        return result;
    }
    auto sql = std::format("PRAGMA table_info({});", table);
    sqlite3_stmt *stmt = nullptr;
    int rc = sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr);
    if (rc != SQLITE_OK)
    {
        if (stmt != nullptr)
        {
            sqlite3_finalize(stmt);
        }
        return result;
    }
    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        auto *name =
            reinterpret_cast<char const *>(sqlite3_column_text(stmt, 1));
        if (name != nullptr)
        {
            result.emplace_back(name);
        }
    }
    sqlite3_finalize(stmt);
    return result;
}

bool Database::rename_table(std::string const &old_name,
                            std::string const &new_name) const
{
    if (!table_exists(old_name))
    {
        return true;
    }
    auto sql = std::format("ALTER TABLE {} RENAME TO {};", old_name, new_name);
    return execute(sql);
}

bool Database::copy_table_data(std::string const &target,
                               std::string const &source,
                               std::vector<std::string> const &columns) const
{
    if (!db_ || columns.empty())
    {
        return true;
    }
    std::string column_list;
    column_list.reserve(columns.size() * 16);
    for (size_t i = 0; i < columns.size(); ++i)
    {
        column_list += columns[i];
        if (i + 1 < columns.size())
        {
            column_list += ", ";
        }
    }
    auto sql = std::format("INSERT OR IGNORE INTO {} ({}) SELECT {} FROM {};",
                           target, column_list, column_list, source);
    return execute(sql);
}

bool Database::drop_backup_tables(std::vector<std::string> const &tables,
                                  std::string const &suffix) const
{
    if (!db_)
    {
        return false;
    }
    bool success = true;
    for (auto const &table : tables)
    {
        auto name = table + suffix;
        if (!table_exists(name))
        {
            continue;
        }
        auto sql = std::format("DROP TABLE IF EXISTS {};", name);
        if (!execute(sql))
        {
            success = false;
            TT_LOG_INFO("failed to drop backup table {}", name);
        }
    }
    return success;
}

bool Database::recover_schema_from_existing() const
{
    if (!db_)
    {
        return false;
    }
    if (!backup_database())
    {
        return false;
    }
    if (!begin_transaction())
    {
        return false;
    }
    std::vector<std::string> tables;
    tables.reserve(kPersistentTables.size());
    for (auto const &table : kPersistentTables)
    {
        tables.emplace_back(table);
    }
    bool success = false;
    do
    {
        drop_backup_tables(tables, kRecoverySuffix);
        bool rename_failed = false;
        for (auto const &table : tables)
        {
            auto current_backup = table + kRecoverySuffix;
            if (!table_exists(table))
            {
                continue;
            }
            if (!rename_table(table, current_backup))
            {
                TT_LOG_INFO("failed to rename {} to {}", table, current_backup);
                rename_failed = true;
                break;
            }
        }
        if (rename_failed)
        {
            break;
        }
        if (!apply_migration_v1())
        {
            break;
        }
        for (auto const &table : tables)
        {
            auto source = table + kRecoverySuffix;
            if (!table_exists(source))
            {
                continue;
            }
            auto destination_columns = columns_for_table(table);
            auto source_columns = columns_for_table(source);
            std::vector<std::string> common;
            for (auto const &column : destination_columns)
            {
                if (std::find(source_columns.begin(), source_columns.end(),
                              column) != source_columns.end())
                {
                    common.push_back(column);
                }
            }
            if (common.empty())
            {
                continue;
            }
            if (!copy_table_data(table, source, common))
            {
                TT_LOG_INFO("failed to migrate data from {} to {}", source,
                            table);
            }
        }
        drop_backup_tables(tables, kRecoverySuffix);
        success = true;
    } while (false);
    if (success)
    {
        if (!commit_transaction())
        {
            success = false;
            rollback_transaction();
        }
    }
    else
    {
        rollback_transaction();
    }
    return success;
}

bool Database::backup_database() const
{
    if (path_.empty())
    {
        return false;
    }
    try
    {
        auto now = std::chrono::system_clock::now();
        auto seconds = std::chrono::duration_cast<std::chrono::seconds>(
                           now.time_since_epoch())
                           .count();
        auto parent = path_.parent_path();
        auto backup_name =
            std::format("{}-recovery-{}.db", path_.stem().string(), seconds);
        auto backup_path = parent.empty() ? std::filesystem::path(backup_name)
                                          : parent / backup_name;
        std::filesystem::copy_file(
            path_, backup_path, std::filesystem::copy_options::skip_existing);
        TT_LOG_INFO("created database backup: {}", backup_path.string());
        return true;
    }
    catch (std::filesystem::filesystem_error const &ex)
    {
        TT_LOG_INFO("database backup failed: {}", ex.what());
        return false;
    }
}

} // namespace tt::storage

#include "utils/StateStore.hpp"

#include "utils/Json.hpp"
#include "utils/Log.hpp"
#include <yyjson.h>

#include <filesystem>
#include <system_error>

namespace tt::storage {

std::string serialize_label_list(std::vector<std::string> const &labels) {
  tt::json::MutableDocument doc;
  if (!doc.is_valid()) {
    return {};
  }
  auto *native = doc.doc();
  auto *root = yyjson_mut_arr(native);
  doc.set_root(root);
  for (auto const &label : labels) {
    yyjson_mut_arr_add_str(native, root, label.c_str());
  }
  return doc.write("[]");
}

std::vector<std::string> deserialize_label_list(std::string const &payload) {
  std::vector<std::string> result;
  if (payload.empty()) {
    return result;
  }
  auto doc = tt::json::Document::parse(payload);
  if (!doc.is_valid()) {
    return result;
  }
  auto *root = doc.root();
  if (root == nullptr || !yyjson_is_arr(root)) {
    return result;
  }
  size_t idx, limit;
  yyjson_val *entry = nullptr;
  yyjson_arr_foreach(root, idx, limit, entry) {
    if (yyjson_is_str(entry)) {
      result.emplace_back(yyjson_get_str(entry));
    }
  }
  return result;
}

namespace {

constexpr int kDatabaseBusyTimeoutMs = 5000;

std::optional<std::vector<std::uint8_t>> copy_column_blob(sqlite3_stmt *stmt,
                                                           int index) {
  auto size = sqlite3_column_bytes(stmt, index);
  if (size <= 0) {
    return std::vector<std::uint8_t>{};
  }
  auto data = sqlite3_column_blob(stmt, index);
  if (data == nullptr) {
    return std::vector<std::uint8_t>{};
  }
  return std::vector<std::uint8_t>(
      reinterpret_cast<std::uint8_t const *>(data),
      reinterpret_cast<std::uint8_t const *>(data) + static_cast<std::size_t>(size));
}

} // namespace

Database::Database(std::filesystem::path path) {
  if (path.empty()) {
    return;
  }
  auto parent = path.parent_path();
  if (!parent.empty()) {
    std::filesystem::create_directories(parent);
  }
  int rc = sqlite3_open_v2(path.string().c_str(), &db_,
                           SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX,
                           nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("failed to open sqlite database {}: {}", path.string(),
                sqlite3_errstr(rc));
    sqlite3_close(db_);
    db_ = nullptr;
    return;
  }
  char *err_msg = nullptr;
  rc = sqlite3_exec(db_, "PRAGMA journal_mode=WAL;", nullptr, nullptr, &err_msg);
  if (rc != SQLITE_OK) {
    if (err_msg != nullptr) {
      TT_LOG_INFO("failed to enable WAL journal mode: {}", err_msg);
      sqlite3_free(err_msg);
    }
  } else if (err_msg != nullptr) {
    sqlite3_free(err_msg);
  }
  sqlite3_busy_timeout(db_, kDatabaseBusyTimeoutMs);
  if (!ensure_schema()) {
    sqlite3_close(db_);
    db_ = nullptr;
  }
}

Database::~Database() {
  if (db_) {
    sqlite3_close(db_);
    db_ = nullptr;
  }
}

bool Database::ensure_schema() {
  if (!db_) {
    return false;
  }
  constexpr char const *kSettingsSql =
      "CREATE TABLE IF NOT EXISTS settings ("
      "key TEXT PRIMARY KEY,"
      "value TEXT NOT NULL);";
  constexpr char const *kTorrentsSql =
      "CREATE TABLE IF NOT EXISTS torrents ("
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

bool Database::execute(std::string const &sql) const {
  if (!db_) {
    return false;
  }
  char *err_msg = nullptr;
  int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &err_msg);
  if (rc != SQLITE_OK) {
    if (err_msg != nullptr) {
      TT_LOG_INFO("sqlite error: {}", err_msg);
      sqlite3_free(err_msg);
    }
    return false;
  }
  return true;
}

bool Database::begin_transaction() const {
  return execute("BEGIN TRANSACTION;");
}

bool Database::commit_transaction() const {
  return execute("COMMIT;");
}

bool Database::rollback_transaction() const {
  return execute("ROLLBACK;");
}

std::optional<std::string> Database::get_setting(std::string const &key) const {
  if (!db_) {
    return std::nullopt;
  }
  constexpr char const *sql =
      "SELECT value FROM settings WHERE key = ? LIMIT 1;";
  sqlite3_stmt *stmt = nullptr;
  int rc =
      sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return std::nullopt;
  }
  sqlite3_bind_text(stmt, 1, key.c_str(), -1, SQLITE_TRANSIENT);
  std::optional<std::string> value;
  if (sqlite3_step(stmt) == SQLITE_ROW) {
    auto text = reinterpret_cast<char const *>(sqlite3_column_text(stmt, 0));
    if (text != nullptr) {
      value = std::string(text);
    }
  }
  sqlite3_finalize(stmt);
  return value;
}

bool Database::set_setting(std::string const &key, std::string const &value) {
  if (!db_) {
    return false;
  }
  constexpr char const *sql =
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  sqlite3_bind_text(stmt, 1, key.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, value.c_str(), -1, SQLITE_TRANSIENT);
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

bool Database::remove_setting(std::string const &key) {
  if (!db_) {
    return false;
  }
  constexpr char const *sql = "DELETE FROM settings WHERE key = ?;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  sqlite3_bind_text(stmt, 1, key.c_str(), -1, SQLITE_TRANSIENT);
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

std::vector<PersistedTorrent> Database::load_torrents() const {
  std::vector<PersistedTorrent> result;
  if (!db_) {
    return result;
  }
  constexpr char const *sql =
      "SELECT info_hash, magnet_uri, save_path, resume_data, metainfo, paused,"
      "labels, added_at, rpc_id, metadata_path FROM torrents;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return result;
  }
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    PersistedTorrent entry;
    auto *hash = reinterpret_cast<char const *>(sqlite3_column_text(stmt, 0));
    if (hash != nullptr) {
      entry.hash = hash;
    }
    if (auto *uri = reinterpret_cast<char const *>(sqlite3_column_text(stmt, 1));
        uri != nullptr) {
      entry.magnet_uri = std::string(uri);
    }
    if (auto *path = reinterpret_cast<char const *>(sqlite3_column_text(stmt, 2));
        path != nullptr) {
      entry.save_path = std::string(path);
    }
    if (auto blob = copy_column_blob(stmt, 3)) {
      entry.resume_data = std::move(*blob);
    }
    if (auto blob = copy_column_blob(stmt, 4)) {
      entry.metainfo = std::move(*blob);
    }
    entry.paused = sqlite3_column_int(stmt, 5) != 0;
    if (auto *labels = reinterpret_cast<char const *>(sqlite3_column_text(stmt, 6));
        labels != nullptr) {
      entry.labels = std::string(labels);
    }
    entry.added_at = static_cast<std::uint64_t>(sqlite3_column_int64(stmt, 7));
    entry.rpc_id = static_cast<int>(sqlite3_column_int(stmt, 8));
    if (auto *metadata =
            reinterpret_cast<char const *>(sqlite3_column_text(stmt, 9));
        metadata != nullptr) {
      entry.metadata_path = std::string(metadata);
    }
    if (!entry.hash.empty()) {
      result.push_back(std::move(entry));
    }
  }
  sqlite3_finalize(stmt);
  return result;
}

bool Database::upsert_torrent(PersistedTorrent const &torrent) {
  if (!db_) {
    return false;
  }
  constexpr char const *sql =
      "INSERT OR REPLACE INTO torrents "
      "(info_hash, magnet_uri, save_path, resume_data, metainfo, paused, labels,"
      "added_at, rpc_id, metadata_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  sqlite3_bind_text(stmt, 1, torrent.hash.c_str(), -1, SQLITE_TRANSIENT);
  if (torrent.magnet_uri) {
    sqlite3_bind_text(stmt, 2, torrent.magnet_uri->c_str(), -1, SQLITE_TRANSIENT);
  } else {
    sqlite3_bind_null(stmt, 2);
  }
  if (torrent.save_path) {
    sqlite3_bind_text(stmt, 3, torrent.save_path->c_str(), -1, SQLITE_TRANSIENT);
  } else {
    sqlite3_bind_null(stmt, 3);
  }
  if (!torrent.resume_data.empty()) {
    sqlite3_bind_blob(stmt, 4, torrent.resume_data.data(),
                      static_cast<int>(torrent.resume_data.size()), SQLITE_TRANSIENT);
  } else {
    sqlite3_bind_null(stmt, 4);
  }
  if (!torrent.metainfo.empty()) {
    sqlite3_bind_blob(stmt, 5, torrent.metainfo.data(),
                      static_cast<int>(torrent.metainfo.size()), SQLITE_TRANSIENT);
  } else {
    sqlite3_bind_null(stmt, 5);
  }
  sqlite3_bind_int(stmt, 6, torrent.paused ? 1 : 0);
  if (!torrent.labels.empty()) {
    sqlite3_bind_text(stmt, 7, torrent.labels.c_str(), -1, SQLITE_TRANSIENT);
  } else {
    sqlite3_bind_null(stmt, 7);
  }
  sqlite3_bind_int64(stmt, 8, static_cast<sqlite3_int64>(torrent.added_at));
  sqlite3_bind_int(stmt, 9, torrent.rpc_id);
  if (!torrent.metadata_path.empty()) {
    sqlite3_bind_text(stmt, 10, torrent.metadata_path.c_str(), -1,
                      SQLITE_TRANSIENT);
  } else {
    sqlite3_bind_null(stmt, 10);
  }
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

bool Database::update_save_path(std::string const &hash,
                                std::string const &path) const {
  if (!db_) {
    return false;
  }
  constexpr char const *sql =
      "UPDATE torrents SET save_path = ? WHERE info_hash = ?;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  sqlite3_bind_text(stmt, 1, path.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

bool Database::update_rpc_id(std::string const &hash, int rpc_id) const {
  if (!db_) {
    return false;
  }
  constexpr char const *sql =
      "UPDATE torrents SET rpc_id = ? WHERE info_hash = ?;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  sqlite3_bind_int(stmt, 1, rpc_id);
  sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

bool Database::update_metadata(std::string const &hash,
                               std::string const &path,
                               std::vector<std::uint8_t> const &metadata) const {
  if (!db_) {
    return false;
  }
  sqlite3_stmt *stmt = nullptr;
  int rc = SQLITE_ERROR;
  if (!metadata.empty()) {
    constexpr char const *sql =
        "UPDATE torrents SET metadata_path = ?, metainfo = ? WHERE info_hash = ?;";
    rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) {
      TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
      return false;
    }
    sqlite3_bind_text(stmt, 1, path.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_blob(stmt, 2, metadata.data(),
                      static_cast<int>(metadata.size()), SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, hash.c_str(), -1, SQLITE_TRANSIENT);
  } else {
    constexpr char const *sql =
        "UPDATE torrents SET metadata_path = ? WHERE info_hash = ?;";
    rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) {
      TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
      return false;
    }
    sqlite3_bind_text(stmt, 1, path.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
  }
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

bool Database::delete_torrent(std::string const &hash) {
  if (!db_) {
    return false;
  }
  constexpr char const *sql = "DELETE FROM torrents WHERE info_hash = ?;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  sqlite3_bind_text(stmt, 1, hash.c_str(), -1, SQLITE_TRANSIENT);
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

bool Database::update_labels(std::string const &hash,
                             std::string const &labels_json) {
  if (!db_) {
    return false;
  }
  constexpr char const *sql =
      "UPDATE torrents SET labels = ? WHERE info_hash = ?;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  sqlite3_bind_text(stmt, 1, labels_json.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

bool Database::update_resume_data(std::string const &hash,
                                  std::vector<std::uint8_t> const &data) {
  if (!db_) {
    return false;
  }
  constexpr char const *sql =
      "UPDATE torrents SET resume_data = ? WHERE info_hash = ?;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  if (!data.empty()) {
    sqlite3_bind_blob(stmt, 1, data.data(), static_cast<int>(data.size()),
                      SQLITE_TRANSIENT);
  } else {
    sqlite3_bind_null(stmt, 1);
  }
  sqlite3_bind_text(stmt, 2, hash.c_str(), -1, SQLITE_TRANSIENT);
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

std::optional<std::vector<std::uint8_t>> Database::resume_data(
    std::string const &hash) const {
  if (!db_) {
    return std::nullopt;
  }
  constexpr char const *sql =
      "SELECT resume_data FROM torrents WHERE info_hash = ? LIMIT 1;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return std::nullopt;
  }
  sqlite3_bind_text(stmt, 1, hash.c_str(), -1, SQLITE_TRANSIENT);
  std::optional<std::vector<std::uint8_t>> result;
  if (sqlite3_step(stmt) == SQLITE_ROW) {
    result = copy_column_blob(stmt, 0);
  }
  sqlite3_finalize(stmt);
  return result;
}

bool Database::insert_speed_history(std::int64_t timestamp, std::uint64_t down_bytes,
                                    std::uint64_t up_bytes) const {
  if (!db_) {
    return false;
  }
  constexpr char const *sql =
      "INSERT OR REPLACE INTO speed_history (timestamp, down_bytes, up_bytes)"
      " VALUES (?, ?, ?);";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  sqlite3_bind_int64(stmt, 1, static_cast<sqlite3_int64>(timestamp));
  sqlite3_bind_int64(stmt, 2, static_cast<sqlite3_int64>(down_bytes));
  sqlite3_bind_int64(stmt, 3, static_cast<sqlite3_int64>(up_bytes));
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

std::vector<SpeedHistoryEntry> Database::query_speed_history(std::int64_t start,
                                                             std::int64_t end,
                                                             std::int64_t step) const {
  std::vector<SpeedHistoryEntry> result;
  if (!db_ || step <= 0 || start >= end) {
    return result;
  }
  constexpr char const *sql =
      "SELECT ((timestamp / ?) * ?) AS bucket,"
      " SUM(down_bytes),"
      " SUM(up_bytes),"
      " MAX(down_bytes),"
      " MAX(up_bytes)"
      " FROM speed_history"
      " WHERE timestamp >= ? AND timestamp < ?"
      " GROUP BY bucket"
      " ORDER BY bucket ASC;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return result;
  }
  sqlite3_bind_int64(stmt, 1, step);
  sqlite3_bind_int64(stmt, 2, step);
  sqlite3_bind_int64(stmt, 3, start);
  sqlite3_bind_int64(stmt, 4, end);
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    SpeedHistoryEntry entry;
    entry.timestamp = sqlite3_column_int64(stmt, 0);
    auto total_down = sqlite3_column_int64(stmt, 1);
    auto total_up = sqlite3_column_int64(stmt, 2);
    auto peak_down = sqlite3_column_int64(stmt, 3);
    auto peak_up = sqlite3_column_int64(stmt, 4);
    entry.total_down = total_down < 0 ? 0 : static_cast<std::uint64_t>(total_down);
    entry.total_up = total_up < 0 ? 0 : static_cast<std::uint64_t>(total_up);
    entry.peak_down = peak_down < 0 ? 0 : static_cast<std::uint64_t>(peak_down);
    entry.peak_up = peak_up < 0 ? 0 : static_cast<std::uint64_t>(peak_up);
    result.push_back(entry);
  }
  sqlite3_finalize(stmt);
  return result;
}

bool Database::delete_speed_history_before(std::int64_t timestamp) const {
  if (!db_) {
    return false;
  }
  constexpr char const *sql =
      "DELETE FROM speed_history WHERE timestamp < ?;";
  sqlite3_stmt *stmt = nullptr;
  int rc = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    TT_LOG_INFO("sqlite prepare failed: {}", sqlite3_errmsg(db_));
    return false;
  }
  sqlite3_bind_int64(stmt, 1, timestamp);
  rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_DONE;
}

bool Database::delete_speed_history_all() const {
  if (!db_) {
    return false;
  }
  constexpr char const *sql = "DELETE FROM speed_history;";
  return execute(sql);
}

} // namespace tt::storage

#pragma once

#include <filesystem>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include <sqlite3.h>

namespace tt::storage {

struct PersistedTorrent {
  std::string hash;
  std::optional<std::string> magnet_uri;
  std::optional<std::string> save_path;
  std::vector<std::uint8_t> resume_data;
  std::vector<std::uint8_t> metainfo;
  bool paused = false;
  std::string labels;
  std::uint64_t added_at = 0;
  int rpc_id = 0;
  std::string metadata_path;
};

struct SpeedHistoryEntry {
  std::int64_t timestamp = 0;
  std::uint64_t total_down = 0;
  std::uint64_t total_up = 0;
  std::uint64_t peak_down = 0;
  std::uint64_t peak_up = 0;
};

std::string serialize_label_list(std::vector<std::string> const &labels);
std::vector<std::string> deserialize_label_list(std::string const &payload);

class Database {
public:
  explicit Database(std::filesystem::path path);
  ~Database();

  Database(Database const &) = delete;
  Database &operator=(Database const &) = delete;

  bool is_valid() const noexcept { return db_ != nullptr; }

  std::optional<std::string> get_setting(std::string const &key) const;
  bool set_setting(std::string const &key, std::string const &value);
  bool remove_setting(std::string const &key);
  bool begin_transaction() const;
  bool commit_transaction() const;
  bool rollback_transaction() const;

  std::vector<PersistedTorrent> load_torrents() const;
  bool upsert_torrent(PersistedTorrent const &torrent);
  bool delete_torrent(std::string const &hash);
  bool update_labels(std::string const &hash, std::string const &labels_json);
  bool update_save_path(std::string const &hash, std::string const &path) const;
  bool update_rpc_id(std::string const &hash, int rpc_id) const;
  bool update_metadata(std::string const &hash, std::string const &path,
                       std::vector<std::uint8_t> const &metadata) const;
  bool update_resume_data(std::string const &hash,
                          std::vector<std::uint8_t> const &data);
  std::optional<std::vector<std::uint8_t>> resume_data(
      std::string const &hash) const;

  bool insert_speed_history(std::int64_t timestamp, std::uint64_t down_bytes,
                            std::uint64_t up_bytes) const;
  std::vector<SpeedHistoryEntry> query_speed_history(std::int64_t start,
                                                     std::int64_t end,
                                                     std::int64_t step) const;
  bool delete_speed_history_before(std::int64_t timestamp) const;
  bool delete_speed_history_all() const;

private:
  bool ensure_schema();
  bool execute(std::string const &sql) const;

  sqlite3 *db_ = nullptr;
};

} // namespace tt::storage

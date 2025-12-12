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

  std::vector<PersistedTorrent> load_torrents() const;
  bool upsert_torrent(PersistedTorrent const &torrent);
  bool delete_torrent(std::string const &hash);
  bool update_labels(std::string const &hash, std::string const &labels_json);
  bool update_resume_data(std::string const &hash,
                          std::vector<std::uint8_t> const &data);
  std::optional<std::vector<std::uint8_t>> resume_data(
      std::string const &hash) const;

private:
  bool ensure_schema();
  bool execute(std::string const &sql) const;

  sqlite3 *db_ = nullptr;
};

} // namespace tt::storage

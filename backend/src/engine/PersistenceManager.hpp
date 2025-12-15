#pragma once

#include "engine/Core.hpp"
#include "utils/StateStore.hpp"

#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace tt::storage {
class Database;
}

namespace tt::engine {

class PersistenceManager {
public:
  explicit PersistenceManager(std::filesystem::path path);
  ~PersistenceManager();

  PersistenceManager(PersistenceManager const &) = delete;
  PersistenceManager &operator=(PersistenceManager const &) = delete;

  bool is_valid() const noexcept;

  std::vector<storage::PersistedTorrent> load_torrents() const;
  SessionStatistics load_session_statistics();
  bool persist_session_stats(SessionStatistics const &stats);
  bool persist_settings(CoreSettings const &settings);

  bool upsert_torrent(storage::PersistedTorrent const &torrent);
  bool delete_torrent(std::string const &hash);
  bool update_save_path(std::string const &hash, std::string const &path);
  bool update_rpc_id(std::string const &hash, int rpc_id);
  bool update_metadata(std::string const &hash, std::string const &path,
                       std::vector<std::uint8_t> const &metadata);
  bool update_resume_data(std::string const &hash,
                          std::vector<std::uint8_t> const &data);
  std::optional<std::vector<std::uint8_t>> resume_data(
      std::string const &hash) const;
  bool update_labels(std::string const &hash, std::string const &labels);

private:
  std::uint64_t read_uint64_setting(std::string const &key) const;

  std::unique_ptr<storage::Database> database_;
};

} // namespace tt::engine

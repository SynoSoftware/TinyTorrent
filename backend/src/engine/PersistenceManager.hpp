#pragma once

#include "engine/Core.hpp"
#include "utils/StateStore.hpp"

#include <filesystem>
#include <memory>
#include <optional>
#include <shared_mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace tt::storage
{
class Database;
}

namespace tt::engine
{

class PersistenceManager
{
  public:
    explicit PersistenceManager(std::filesystem::path path);
    ~PersistenceManager();

    PersistenceManager(PersistenceManager const &) = delete;
    PersistenceManager &operator=(PersistenceManager const &) = delete;

    bool is_valid() const noexcept;

    // Startup / Load
    // This now populates internal cache AND returns the list for TorrentManager
    std::vector<storage::PersistedTorrent> load_torrents();

    // Stats & Settings
    SessionStatistics load_session_statistics();
    bool persist_session_stats(SessionStatistics const &stats);
    bool persist_settings(CoreSettings const &settings);

    // State Management (Updates Cache + DB)
    void add_or_update_torrent(storage::PersistedTorrent torrent);
    void remove_torrent(std::string const &hash);

    void update_save_path(std::string const &hash, std::string const &path);
    void update_rpc_id(std::string const &hash, int rpc_id);
    void update_metadata(std::string const &hash, std::string const &path,
                         std::vector<std::uint8_t> const &metadata);
    void update_resume_data(std::string const &hash,
                            std::vector<std::uint8_t> const &data);
    void update_labels(std::string const &hash, std::string const &labels);

    // Read Access (Thread-safe)
    std::vector<std::string> get_labels(std::string const &hash) const;
    std::filesystem::path
    get_save_path(std::string const &hash,
                  std::filesystem::path const &default_path) const;
    std::optional<int> get_rpc_id(std::string const &hash) const;

  private:
    std::uint64_t read_uint64_setting(std::string const &key) const;

    std::unique_ptr<storage::Database> database_;

    // In-Memory State Cache
    mutable std::shared_mutex cache_mutex_;
    std::unordered_map<std::string, storage::PersistedTorrent> torrents_;
    std::unordered_map<std::string, std::vector<std::string>> labels_;
};

} // namespace tt::engine
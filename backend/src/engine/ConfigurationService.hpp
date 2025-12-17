#pragma once

#include "engine/Core.hpp"
#include <atomic>
#include <mutex>
#include <shared_mutex>

namespace tt::engine
{

class PersistenceManager;
class EventBus;

class ConfigurationService
{
  public:
    ConfigurationService(PersistenceManager *persistence, EventBus *bus,
                         CoreSettings defaults);

    CoreSettings get() const;

    // Updates settings and publishes SettingsChangedEvent if changed
    void update(SessionUpdate const &update);

    // Direct setters for internal logic
    void set_listen_interface(std::string const &value);
    void set_download_path(std::filesystem::path const &path);
    void set_limits(std::optional<int> dl, std::optional<bool> dl_en,
                    std::optional<int> ul, std::optional<bool> ul_en);
    void set_peer_limits(std::optional<int> global,
                         std::optional<int> per_torrent);

    void persist_if_dirty();
    void persist_now();

  private:
    void mark_dirty();
    void notify_listeners();

    PersistenceManager *persistence_;
    EventBus *bus_;

    mutable std::shared_mutex mutex_;
    CoreSettings settings_;

    std::atomic_bool dirty_{false};
};

} // namespace tt::engine

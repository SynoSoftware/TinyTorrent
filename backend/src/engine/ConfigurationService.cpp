#include "engine/ConfigurationService.hpp"
#include "engine/EventBus.hpp"
#include "engine/Events.hpp"
#include "engine/PersistenceManager.hpp"
#include "engine/SettingsManager.hpp"
#include "utils/Endpoint.hpp"
#include "utils/Log.hpp"

#include <utility>

namespace tt::engine
{

ConfigurationService::ConfigurationService(PersistenceManager *persistence,
                                           EventBus *bus, CoreSettings defaults)
    : persistence_(persistence), bus_(bus), settings_(std::move(defaults))
{
}

CoreSettings ConfigurationService::get() const
{
    std::shared_lock<std::shared_mutex> lock(mutex_);
    return settings_;
}

void ConfigurationService::update(SessionUpdate const &update)
{
    bool changed = false;
    {
        std::unique_lock<std::shared_mutex> lock(mutex_);
        auto result = SettingsManager::apply_update(settings_, update);
        if (result.persist)
        {
            settings_ = result.settings;
            changed = true;
        }
    }

    if (changed)
    {
        mark_dirty();
        notify_listeners();
    }
}

void ConfigurationService::set_listen_interface(std::string const &value)
{
    auto parts = tt::net::parse_host_port(value);
    parts.port = tt::net::trim_whitespace(parts.port);
    if (parts.port.empty())
    {
        parts.port = "6881";
    }
    if (parts.host.empty())
    {
        parts.host = "0.0.0.0";
        parts.bracketed = false;
    }
    auto normalized = tt::net::format_host_port(parts);
    {
        std::unique_lock<std::shared_mutex> lock(mutex_);
        if (settings_.listen_interface == normalized)
            return;
        settings_.listen_interface = std::move(normalized);
    }
    mark_dirty();
}

void ConfigurationService::set_download_path(std::filesystem::path const &path)
{
    {
        std::unique_lock<std::shared_mutex> lock(mutex_);
        settings_.download_path = path;
    }
    mark_dirty();
    // Path changes usually trigger automation reconfiguration, handled via
    // event
    notify_listeners();
}

void ConfigurationService::set_limits(std::optional<int> dl,
                                      std::optional<bool> dl_en,
                                      std::optional<int> ul,
                                      std::optional<bool> ul_en)
{
    {
        std::unique_lock<std::shared_mutex> lock(mutex_);
        if (dl)
            settings_.download_rate_limit_kbps = *dl;
        if (dl_en)
            settings_.download_rate_limit_enabled = *dl_en;
        if (ul)
            settings_.upload_rate_limit_kbps = *ul;
        if (ul_en)
            settings_.upload_rate_limit_enabled = *ul_en;
    }
    mark_dirty();
    notify_listeners();
}

void ConfigurationService::set_peer_limits(std::optional<int> global,
                                           std::optional<int> per_torrent)
{
    {
        std::unique_lock<std::shared_mutex> lock(mutex_);
        if (global)
            settings_.peer_limit = *global;
        if (per_torrent)
            settings_.peer_limit_per_torrent = *per_torrent;
    }
    mark_dirty();
    notify_listeners();
}

void ConfigurationService::mark_dirty()
{
    dirty_.store(true, std::memory_order_release);
}

void ConfigurationService::persist_if_dirty()
{
    if (!dirty_.load(std::memory_order_acquire))
        return;
    persist_now();
}

void ConfigurationService::persist_now()
{
    if (!persistence_)
        return;

    CoreSettings copy = get();
    if (persistence_->persist_settings(copy))
    {
        dirty_.store(false, std::memory_order_release);
    }
    else
    {
        TT_LOG_INFO("failed to persist settings");
    }
}

void ConfigurationService::notify_listeners()
{
    // In a real event bus, we might pass the diff.
    // Here we just signal that settings changed.
    // Consumers call get() to see new state.
    bus_->publish(SettingsChangedEvent{});
}

} // namespace tt::engine

#include "engine/AlertRouter.hpp"

#include "engine/EventBus.hpp"
#include "engine/Events.hpp"
#include "engine/TorrentManager.hpp"
#include "engine/TorrentUtils.hpp"
#include "utils/Endpoint.hpp"
#include "utils/Log.hpp"

#include <format>

namespace tt::engine
{

AlertRouter::AlertRouter(TorrentManager *manager, EventBus *bus,
                         MetadataPathProvider metadata_path_provider)
    : manager_(manager), bus_(bus),
      metadata_path_provider_(std::move(metadata_path_provider))
{
}

void AlertRouter::wire_callbacks()
{
    if (!manager_)
        return;

    TorrentManager::AlertCallbacks cb{};

    // State Update
    cb.on_state_update =
        [this](std::vector<libtorrent::v2::torrent_status> const &statuses)
    { bus_->publish(StateUpdateEvent{statuses}); };

    // Finished
    cb.on_torrent_finished =
        [this](libtorrent::torrent_handle const &handle,
               libtorrent::v2::torrent_status const &status)
    { bus_->publish(TorrentFinishedEvent{handle, status}); };

    // Metadata
    cb.metadata_file_path = [this](std::string const &hash)
    {
        if (metadata_path_provider_)
            return metadata_path_provider_(hash);
        return std::filesystem::path{};
    };

    cb.on_metadata_persisted = [this](std::string const &hash,
                                      std::filesystem::path const &path,
                                      std::vector<std::uint8_t> const &metadata)
    { bus_->publish(MetadataPersistedEvent{hash, path, metadata}); };

    // Resume Data
    cb.on_resume_data = [this](std::string const &hash,
                               libtorrent::add_torrent_params const &params)
    { bus_->publish(ResumeDataAvailableEvent{hash, params}); };

    cb.on_resume_hash_completed = [this](std::string const &hash)
    { bus_->publish(ResumeDataSavedEvent{hash}); };

    cb.extend_resume_deadline = [this]
    { bus_->publish(ExtendResumeDeadlineEvent{}); };

    // Listeners
    cb.on_listen_succeeded = [this](auto const &a)
    { handle_listen_succeeded(a); };
    cb.on_listen_failed = [this](auto const &a) { handle_listen_failed(a); };

    // Errors
    cb.on_file_error = [this](auto const &a) { handle_file_error(a); };
    cb.on_tracker_error = [this](auto const &a) { handle_tracker_error(a); };
    cb.on_portmap_error = [this](auto const &a) { handle_portmap_error(a); };
    cb.on_fastresume_rejected = [this](auto const &a)
    { handle_fastresume_rejected(a); };

    // Storage
    cb.on_storage_moved = [this](auto const &a) { handle_storage_moved(a); };
    cb.on_storage_moved_failed = [this](auto const &a)
    { handle_storage_move_failed(a); };

    manager_->set_alert_callbacks(std::move(cb));
}

void AlertRouter::handle_listen_succeeded(
    libtorrent::listen_succeeded_alert const &alert)
{
    if (alert.socket_type != libtorrent::socket_type_t::tcp)
        return;

    auto host = alert.address.to_string();
    tt::net::HostPort host_port{host, std::to_string(alert.port)};
    host_port.bracketed = tt::net::is_ipv6_literal(host);
    auto interface = tt::net::format_host_port(host_port);

    TT_LOG_INFO("listen succeeded on {}", interface);

    bus_->publish(
        ListenSucceededEvent{interface, alert.port, alert.address.is_v6()});
}

void AlertRouter::handle_listen_failed(
    libtorrent::listen_failed_alert const &alert)
{
    if (alert.socket_type != libtorrent::socket_type_t::tcp)
        return;

    auto host = alert.address.to_string();
    tt::net::HostPort host_port{host, std::to_string(alert.port)};
    host_port.bracketed = tt::net::is_ipv6_literal(host);
    auto endpoint = tt::net::format_host_port(host_port);
    auto message =
        std::format("listen failed on {}: {}", endpoint, alert.message());

    TT_LOG_INFO("{}", message);

    bus_->publish(ListenFailedEvent{endpoint, alert.port, message,
                                    alert.address.is_v6()});
}

void AlertRouter::handle_storage_moved(
    libtorrent::storage_moved_alert const &alert)
{
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        auto path = alert.storage_path();
        if (path == nullptr || *path == '\0')
            return;

        TT_LOG_INFO("{} storage moved to {}", *hash, path);
        bus_->publish(StorageMovedEvent{*hash, std::filesystem::path(path),
                                        alert.handle});
    }
}

void AlertRouter::handle_storage_move_failed(
    libtorrent::storage_moved_failed_alert const &alert)
{
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        auto message = std::format("storage move failed: {}", alert.message());
        TT_LOG_INFO("{}: {}", *hash, message);
        bus_->publish(StorageMoveFailedEvent{*hash, message, alert.handle});
        bus_->publish(TorrentErrorEvent{*hash, message, "storage"});
    }
}

void AlertRouter::handle_file_error(libtorrent::file_error_alert const &alert)
{
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        auto message = std::format("file error: {}", alert.message());
        TT_LOG_INFO("{}: {}", *hash, message);
        bus_->publish(TorrentErrorEvent{*hash, message, "file"});
    }
}

void AlertRouter::handle_tracker_error(
    libtorrent::tracker_error_alert const &alert)
{
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        auto tracker = alert.tracker_url();
        auto label = tracker && *tracker ? tracker : "<unknown>";
        auto message = std::format("tracker {}: {}", label, alert.message());
        TT_LOG_INFO("{}: {}", *hash, message);
        bus_->publish(TorrentErrorEvent{*hash, message, "tracker"});
    }
}

void AlertRouter::handle_portmap_error(
    libtorrent::portmap_error_alert const &alert)
{
    auto message = std::format("portmap failed: {}", alert.message());
    TT_LOG_INFO("{}", message);
    // Could define a PortmapErrorEvent if needed, reusing ListenFailed for now
    // or just logging as above.
}

void AlertRouter::handle_fastresume_rejected(
    libtorrent::fastresume_rejected_alert const &alert)
{
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        TT_LOG_INFO("{}: fastresume rejected: {}", *hash, alert.message());
    }
    else
    {
        TT_LOG_INFO("fastresume rejected: {}", alert.message());
    }
}

int AlertRouter::assign_rpc_id(libtorrent::info_hash_t const &hash) const
{
    if (!manager_)
    {
        return 0;
    }
    auto best = hash.get_best();
    if (!hash_is_nonzero(best))
    {
        return 0;
    }
    return manager_->assign_rpc_id(best);
}

} // namespace tt::engine

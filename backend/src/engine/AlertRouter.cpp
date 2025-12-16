#include "engine/AlertRouter.hpp"

#include "engine/AutomationAgent.hpp"
#include "engine/PersistenceManager.hpp"
#include "engine/ResumeDataService.hpp"
#include "engine/TorrentManager.hpp"
#include "engine/TorrentUtils.hpp"
#include "utils/Endpoint.hpp"
#include "utils/Log.hpp"

#include <format>
#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/alert_types.hpp>
#include <libtorrent/torrent_status.hpp>

namespace tt::engine
{

AlertRouter::AlertRouter(TorrentManager *manager, AutomationAgent *automation,
                         PersistenceManager *persistence, HistoryAgent *history,
                         ResumeDataService *resume, Callbacks callbacks)
    : manager_(manager), automation_(automation), persistence_(persistence),
      history_(history), resume_service_(resume),
      callbacks_(std::move(callbacks))
{
}

void AlertRouter::wire_callbacks()
{
    if (!manager_)
    {
        return;
    }

    TorrentManager::AlertCallbacks cb{};
    cb.on_state_update =
        [this](std::vector<libtorrent::torrent_status> const &statuses)
    {
        if (!callbacks_.mark_torrent_dirty)
        {
            return;
        }
        for (auto const &status : statuses)
        {
            if (auto id = assign_rpc_id(status.info_hashes); id > 0)
            {
                callbacks_.mark_torrent_dirty(id);
            }
        }
    };
    cb.on_torrent_finished = [this](libtorrent::torrent_handle const &handle,
                                    libtorrent::torrent_status const &status)
    {
        if (automation_)
        {
            automation_->process_completion(handle, status);
        }
        if (callbacks_.mark_torrent_dirty)
        {
            if (auto id = assign_rpc_id(status.info_hashes); id > 0)
            {
                callbacks_.mark_torrent_dirty(id);
            }
        }
    };
    cb.metadata_file_path = [this](std::string const &hash)
    {
        if (callbacks_.metadata_path)
        {
            return callbacks_.metadata_path(hash);
        }
        return std::filesystem::path{};
    };
    cb.on_metadata_persisted = [this](std::string const &hash,
                                      std::filesystem::path const &path,
                                      std::vector<std::uint8_t> const &metadata)
    {
        if (persistence_)
        {
            persistence_->update_metadata(hash, path.string(), metadata);
        }
    };
    cb.on_resume_data = [this](std::string const &hash,
                               libtorrent::add_torrent_params const &params)
    {
        if (resume_service_)
        {
            resume_service_->persist_resume_data(hash, params);
        }
    };
    cb.on_resume_hash_completed = [this](std::string const &hash)
    {
        if (resume_service_)
        {
            resume_service_->mark_completed(hash);
        }
    };
    cb.extend_resume_deadline = [this]
    {
        if (resume_service_)
        {
            resume_service_->extend_deadline();
        }
    };
    cb.on_listen_succeeded = [this](auto const &alert)
    { handle_listen_succeeded(alert); };
    cb.on_listen_failed = [this](auto const &alert)
    { handle_listen_failed(alert); };
    cb.on_file_error = [this](auto const &alert) { handle_file_error(alert); };
    cb.on_tracker_error = [this](auto const &alert)
    { handle_tracker_error(alert); };
    cb.on_portmap_error = [this](auto const &alert)
    { handle_portmap_error(alert); };
    cb.on_storage_moved = [this](auto const &alert)
    { handle_storage_moved(alert); };
    cb.on_storage_moved_failed = [this](auto const &alert)
    { handle_storage_move_failed(alert); };
    cb.on_fastresume_rejected = [this](auto const &alert)
    { handle_fastresume_rejected(alert); };

    manager_->set_alert_callbacks(std::move(cb));
}

void AlertRouter::handle_listen_succeeded(
    libtorrent::listen_succeeded_alert const &alert)
{
    if (alert.socket_type != libtorrent::socket_type_t::tcp)
    {
        return;
    }
    auto host = alert.address.to_string();
    tt::net::HostPort host_port{host, std::to_string(alert.port)};
    host_port.bracketed = tt::net::is_ipv6_literal(host);
    auto interface = tt::net::format_host_port(host_port);
    if (callbacks_.set_listen_interface)
    {
        callbacks_.set_listen_interface(interface);
    }
    if (callbacks_.set_listen_error)
    {
        callbacks_.set_listen_error({});
    }
    TT_LOG_INFO("listen succeeded on {}", interface);
}

void AlertRouter::handle_listen_failed(
    libtorrent::listen_failed_alert const &alert)
{
    if (alert.socket_type != libtorrent::socket_type_t::tcp)
    {
        return;
    }
    auto host = alert.address.to_string();
    tt::net::HostPort host_port{host, std::to_string(alert.port)};
    host_port.bracketed = tt::net::is_ipv6_literal(host);
    auto endpoint = tt::net::format_host_port(host_port);
    auto message =
        std::format("listen failed on {}: {}", endpoint, alert.message());
    if (callbacks_.set_listen_error)
    {
        callbacks_.set_listen_error(message);
    }
    TT_LOG_INFO("{}", message);
}

void AlertRouter::handle_storage_moved(
    libtorrent::storage_moved_alert const &alert)
{
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        auto path = alert.storage_path();
        if (path == nullptr || *path == '\0')
        {
            return;
        }
        auto destination = std::filesystem::path(path);
        if (automation_)
        {
            automation_->handle_storage_moved(*hash, destination);
        }
        else if (callbacks_.finalize_pending_move)
        {
            callbacks_.finalize_pending_move(*hash, destination);
        }
        TT_LOG_INFO("{} storage moved to {}", *hash, path);
        if (callbacks_.mark_torrent_dirty)
        {
            auto const status = alert.handle.status();
            if (auto id = assign_rpc_id(status.info_hashes); id > 0)
            {
                callbacks_.mark_torrent_dirty(id);
            }
        }
    }
}

void AlertRouter::handle_storage_move_failed(
    libtorrent::storage_moved_failed_alert const &alert)
{
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        auto message = std::format("storage move failed: {}", alert.message());
        record_error(*hash, message);
        if (automation_)
        {
            automation_->handle_storage_move_failed(*hash);
        }
        else if (callbacks_.cancel_pending_move)
        {
            callbacks_.cancel_pending_move(*hash);
        }
        TT_LOG_INFO("{}: {}", *hash, message);
    }
}

void AlertRouter::handle_metadata_persist(
    std::string const &hash, std::filesystem::path const &path,
    std::vector<std::uint8_t> const &metadata)
{
    if (persistence_)
    {
        persistence_->update_metadata(hash, path.string(), metadata);
    }
}

void AlertRouter::handle_resume_data(
    std::string const &hash, libtorrent::add_torrent_params const &params)
{
    if (resume_service_)
    {
        resume_service_->persist_resume_data(hash, params);
    }
}

void AlertRouter::handle_resume_hash_completed(std::string const &hash)
{
    if (resume_service_)
    {
        resume_service_->mark_completed(hash);
    }
}

void AlertRouter::handle_extend_resume_deadline()
{
    if (resume_service_)
    {
        resume_service_->extend_deadline();
    }
}

void AlertRouter::handle_file_error(libtorrent::file_error_alert const &alert)
{
    if (auto hash = hash_from_handle(alert.handle); hash)
    {
        auto message = std::format("file error: {}", alert.message());
        record_error(*hash, message);
        TT_LOG_INFO("{}: {}", *hash, message);
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
        record_error(*hash, message);
        TT_LOG_INFO("{}: {}", *hash, message);
    }
}

void AlertRouter::handle_portmap_error(
    libtorrent::portmap_error_alert const &alert)
{
    auto message = std::format("portmap failed: {}", alert.message());
    if (callbacks_.set_listen_error)
    {
        callbacks_.set_listen_error(message);
    }
    TT_LOG_INFO("{}", message);
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

void AlertRouter::record_error(std::string const &hash, std::string message)
{
    if (hash.empty())
    {
        return;
    }
    if (callbacks_.record_torrent_error)
    {
        callbacks_.record_torrent_error(hash, std::move(message));
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

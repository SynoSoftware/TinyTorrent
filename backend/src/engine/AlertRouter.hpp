#pragma once

#pragma once

#include "engine/EventBus.hpp"
#include "engine/Events.hpp"

#include <filesystem>
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/alert_types.hpp>

namespace tt::engine
{

class TorrentManager;

class AlertRouter
{
  public:
    using MetadataPathProvider =
        std::function<std::filesystem::path(std::string const &)>;

    AlertRouter(TorrentManager *manager, EventBus *bus,
                MetadataPathProvider metadata_path_provider);

    void wire_callbacks();

  private:
    TorrentManager *manager_ = nullptr;
    EventBus *bus_ = nullptr;
    MetadataPathProvider metadata_path_provider_;

    void handle_listen_succeeded(libtorrent::listen_succeeded_alert const &a);
    void handle_listen_failed(libtorrent::listen_failed_alert const &a);
    void handle_storage_moved(libtorrent::storage_moved_alert const &a);
    void
    handle_storage_move_failed(libtorrent::storage_moved_failed_alert const &a);
    void handle_file_error(libtorrent::file_error_alert const &alert);
    void handle_tracker_error(libtorrent::tracker_error_alert const &alert);
    void handle_torrent_delete_failed(
        libtorrent::torrent_delete_failed_alert const &alert);
    void handle_portmap_error(libtorrent::portmap_error_alert const &alert);
    void handle_fastresume_rejected(
        libtorrent::fastresume_rejected_alert const &alert);
    int assign_rpc_id(libtorrent::info_hash_t const &hash) const;
};

} // namespace tt::engine

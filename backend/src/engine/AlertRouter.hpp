#pragma once

#include <functional>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/alert_types.hpp>
#include <libtorrent/info_hash.hpp>

namespace tt::engine
{

class TorrentManager;
class AutomationAgent;
class PersistenceManager;
class HistoryAgent;
class ResumeDataService;

class AlertRouter
{
  public:
    struct Callbacks
    {
        std::function<void(int)> mark_torrent_dirty;
        std::function<void(std::string const &, std::string)> record_torrent_error;
        std::function<void(std::string)> set_listen_error;
        std::function<void(std::string)> set_listen_interface;
        std::function<std::filesystem::path(std::string const &)> metadata_path;
        std::function<void(std::string const &, std::filesystem::path const &)>
            finalize_pending_move;
        std::function<void(std::string const &)> cancel_pending_move;
    };

    AlertRouter(TorrentManager *manager,
                AutomationAgent *automation,
                PersistenceManager *persistence,
                HistoryAgent *history,
                ResumeDataService *resume,
                Callbacks callbacks);

    void wire_callbacks();

  private:
    TorrentManager *manager_ = nullptr;
    AutomationAgent *automation_ = nullptr;
    PersistenceManager *persistence_ = nullptr;
    HistoryAgent *history_ = nullptr;
    ResumeDataService *resume_service_ = nullptr;
    Callbacks callbacks_;

    void handle_listen_succeeded(libtorrent::listen_succeeded_alert const &a);
    void handle_listen_failed(libtorrent::listen_failed_alert const &a);
    void handle_storage_moved(libtorrent::storage_moved_alert const &a);
    void handle_storage_move_failed(
        libtorrent::storage_moved_failed_alert const &a);
    void handle_metadata_persist(
        std::string const &hash, std::filesystem::path const &path,
        std::vector<std::uint8_t> const &metadata);
    void handle_resume_data(std::string const &hash,
                            libtorrent::add_torrent_params const &params);
    void handle_resume_hash_completed(std::string const &hash);
    void handle_extend_resume_deadline();
    void handle_file_error(libtorrent::file_error_alert const &alert);
    void handle_tracker_error(libtorrent::tracker_error_alert const &alert);
    void handle_portmap_error(libtorrent::portmap_error_alert const &alert);
    void handle_fastresume_rejected(
        libtorrent::fastresume_rejected_alert const &alert);
    void record_error(std::string const &hash, std::string message);
    int assign_rpc_id(libtorrent::info_hash_t const &hash) const;
};

} // namespace tt::engine

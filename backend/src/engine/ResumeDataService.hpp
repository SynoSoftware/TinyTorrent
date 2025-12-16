#pragma once

#include <chrono>
#include <optional>
#include <string>
#include <unordered_set>

#include <libtorrent/add_torrent_params.hpp>

namespace tt::engine
{

class TorrentManager;
class PersistenceManager;

class ResumeDataService
{
  public:
    using Clock = std::chrono::steady_clock;

    ResumeDataService(
        TorrentManager *torrents, PersistenceManager *persistence,
        std::chrono::seconds alert_timeout = std::chrono::seconds(5));

    // Initiate save_resume_data on all handles; returns true if any queued.
    bool request_save_all();

    // Called when a resume hash finished (from alert).
    void mark_completed(std::string const &hash);

    // Called when resume data payload is received; persist it.
    void persist_resume_data(std::string const &hash,
                             libtorrent::add_torrent_params const &params);

    // Check if saving is still in progress or timed out.
    bool in_progress(Clock::time_point now) const;

    // Called when alert deadlines should be extended.
    void extend_deadline();

  private:
    TorrentManager *torrents_ = nullptr;
    PersistenceManager *persistence_ = nullptr;
    std::unordered_set<std::string> pending_;
    Clock::time_point deadline_{};
    std::chrono::seconds alert_timeout_{};
};

} // namespace tt::engine

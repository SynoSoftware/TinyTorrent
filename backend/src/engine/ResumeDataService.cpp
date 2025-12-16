#include "engine/ResumeDataService.hpp"

#include "engine/PersistenceManager.hpp"
#include "engine/TorrentManager.hpp"
#include "engine/TorrentUtils.hpp"

#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/write_resume_data.hpp>

#include <vector>

namespace tt::engine
{

ResumeDataService::ResumeDataService(TorrentManager *torrents,
                                     PersistenceManager *persistence,
                                     std::chrono::seconds alert_timeout)
    : torrents_(torrents), persistence_(persistence),
      alert_timeout_(alert_timeout)
{
}

bool ResumeDataService::request_save_all()
{
    if (!torrents_)
    {
        return false;
    }
    pending_.clear();
    auto handles = torrents_->torrent_handles();
    for (auto const &handle : handles)
    {
        if (!handle.is_valid())
        {
            continue;
        }
        handle.save_resume_data();
        if (auto hash = hash_from_handle(handle); hash && !hash->empty())
        {
            pending_.insert(*hash);
        }
    }
    if (pending_.empty())
    {
        deadline_ = Clock::time_point::min();
        return false;
    }
    deadline_ = Clock::now() + alert_timeout_;
    return true;
}

void ResumeDataService::mark_completed(std::string const &hash)
{
    if (hash.empty())
    {
        return;
    }
    pending_.erase(hash);
    if (!pending_.empty())
    {
        extend_deadline();
    }
}

void ResumeDataService::persist_resume_data(
    std::string const &hash, libtorrent::add_torrent_params const &params)
{
    if (!persistence_ || !persistence_->is_valid())
    {
        return;
    }
    auto buffer = libtorrent::write_resume_data_buf(params);
    if (buffer.empty())
    {
        return;
    }
    std::vector<std::uint8_t> data(buffer.begin(), buffer.end());
    persistence_->update_resume_data(hash, data);
}

void ResumeDataService::extend_deadline()
{
    if (pending_.empty())
    {
        deadline_ = Clock::time_point::min();
        return;
    }
    deadline_ = Clock::now() + alert_timeout_;
}

bool ResumeDataService::in_progress(Clock::time_point /*now*/) const
{
    if (pending_.empty())
    {
        return false;
    }
    return Clock::now() < deadline_;
}

} // namespace tt::engine

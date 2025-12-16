#include "engine/StateService.hpp"

#include "engine/PersistenceManager.hpp"
#include "utils/Log.hpp"

namespace tt::engine
{

StateService::StateService(PersistenceManager *persistence)
    : persistence_(persistence)
{
    auto now = std::chrono::steady_clock::now();
    last_state_flush_ = now;
    stats_last_update_ = now;
    session_start_time_ = now;
}

void StateService::initialize_session_statistics(SessionTotals const &totals)
{
    auto now = std::chrono::steady_clock::now();
    std::lock_guard<std::mutex> guard(state_mutex_);
    session_start_time_ = now;
    stats_last_update_ = now;
    session_start_uploaded_ = totals.uploaded;
    session_start_downloaded_ = totals.downloaded;
    last_total_uploaded_ = totals.uploaded;
    last_total_downloaded_ = totals.downloaded;
}

std::pair<std::uint64_t, std::uint64_t>
StateService::record_session_totals(SessionTotals const &totals,
                                    std::chrono::steady_clock::time_point now)
{
    std::lock_guard<std::mutex> guard(state_mutex_);
    if (now < stats_last_update_)
    {
        stats_last_update_ = now;
    }
    auto elapsed = now - stats_last_update_;
    if (elapsed.count() > 0)
    {
        auto seconds = static_cast<std::uint64_t>(
            std::chrono::duration_cast<std::chrono::seconds>(elapsed).count());
        if (seconds > 0)
        {
            persisted_stats_.seconds_active += seconds;
            mark_dirty_locked();
        }
    }
    std::uint64_t uploaded_delta = totals.uploaded >= last_total_uploaded_
                                       ? totals.uploaded - last_total_uploaded_
                                       : totals.uploaded;
    if (uploaded_delta > 0)
    {
        persisted_stats_.uploaded_bytes += uploaded_delta;
        mark_dirty_locked();
    }
    std::uint64_t downloaded_delta =
        totals.downloaded >= last_total_downloaded_
            ? totals.downloaded - last_total_downloaded_
            : totals.downloaded;
    if (downloaded_delta > 0)
    {
        persisted_stats_.downloaded_bytes += downloaded_delta;
        mark_dirty_locked();
    }
    last_total_uploaded_ = totals.uploaded;
    last_total_downloaded_ = totals.downloaded;
    stats_last_update_ = now;
    return {downloaded_delta, uploaded_delta};
}

SessionStatistics StateService::cumulative_stats() const
{
    std::lock_guard<std::mutex> guard(state_mutex_);
    return persisted_stats_;
}

SessionStatistics StateService::current_session_stats(
    SessionTotals const &totals,
    std::chrono::steady_clock::time_point now) const
{
    std::lock_guard<std::mutex> guard(state_mutex_);
    SessionStatistics stats{};
    stats.uploaded_bytes = totals.uploaded >= session_start_uploaded_
                               ? totals.uploaded - session_start_uploaded_
                               : totals.uploaded;
    stats.downloaded_bytes = totals.downloaded >= session_start_downloaded_
                                 ? totals.downloaded - session_start_downloaded_
                                 : totals.downloaded;
    std::uint64_t elapsed_seconds = 0;
    if (now >= session_start_time_)
    {
        elapsed_seconds = static_cast<std::uint64_t>(
            std::chrono::duration_cast<std::chrono::seconds>(
                now - session_start_time_)
                .count());
    }
    stats.seconds_active = elapsed_seconds;
    stats.session_count = 1;
    return stats;
}

void StateService::set_session_count(std::uint64_t count)
{
    std::lock_guard<std::mutex> guard(state_mutex_);
    persisted_stats_.session_count = count;
}

void StateService::mark_dirty()
{
    std::lock_guard<std::mutex> guard(state_mutex_);
    state_dirty_ = true;
}

void StateService::flush_if_due(std::chrono::steady_clock::time_point now)
{
    std::lock_guard<std::mutex> guard(state_mutex_);
    if (!state_dirty_)
    {
        return;
    }
    if (now < last_state_flush_ + kStateFlushInterval)
    {
        return;
    }
    persist_state_unlocked();
    state_dirty_ = false;
    last_state_flush_ = now;
}

void StateService::persist_now()
{
    std::lock_guard<std::mutex> guard(state_mutex_);
    persist_state_unlocked();
    state_dirty_ = false;
    last_state_flush_ = std::chrono::steady_clock::now();
}

void StateService::load_persisted_stats()
{
    if (!persistence_ || !persistence_->is_valid())
    {
        return;
    }
    std::lock_guard<std::mutex> guard(state_mutex_);
    persisted_stats_ = persistence_->load_session_statistics();
}

void StateService::persist_state_unlocked()
{
    if (!persistence_ || !persistence_->is_valid())
    {
        return;
    }
    persistence_->persist_session_stats(persisted_stats_);
}

void StateService::mark_dirty_locked()
{
    state_dirty_ = true;
}

} // namespace tt::engine

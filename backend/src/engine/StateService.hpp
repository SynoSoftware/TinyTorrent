#pragma once

#include "engine/Core.hpp"

#include <chrono>
#include <cstdint>
#include <mutex>
#include <optional>
#include <utility>

namespace tt::engine
{

class PersistenceManager;

class StateService
{
  public:
    explicit StateService(PersistenceManager *persistence);

    void initialize_session_statistics(SessionTotals const &totals);
    std::pair<std::uint64_t, std::uint64_t>
    record_session_totals(SessionTotals const &totals,
                          std::chrono::steady_clock::time_point now);
    SessionStatistics cumulative_stats() const;
    SessionStatistics
    current_session_stats(SessionTotals const &totals,
                          std::chrono::steady_clock::time_point now) const;
    void set_session_count(std::uint64_t count);

    void mark_dirty();
    void flush_if_due(std::chrono::steady_clock::time_point now);
    void persist_now();
    void load_persisted_stats();

  private:
    void persist_state_unlocked();
    void mark_dirty_locked();

    PersistenceManager *persistence_ = nullptr;
    SessionStatistics persisted_stats_;
    mutable std::mutex state_mutex_;
    bool state_dirty_ = false;
    std::chrono::steady_clock::time_point last_state_flush_;
    std::chrono::steady_clock::time_point stats_last_update_;
    std::chrono::steady_clock::time_point session_start_time_;
    std::uint64_t session_start_downloaded_ = 0;
    std::uint64_t session_start_uploaded_ = 0;
    std::uint64_t last_total_downloaded_ = 0;
    std::uint64_t last_total_uploaded_ = 0;

    static constexpr auto kStateFlushInterval = std::chrono::seconds(5);
};

} // namespace tt::engine

#pragma once

#include <chrono>
#include <functional>

namespace tt::engine
{

class AutomationAgent;
class HistoryAgent;
class PersistenceManager;

// HousekeepingService encapsulates periodic engine tasks currently in Core.
// Planned duties:
//  - Trigger automation scans on schedule.
//  - Flush persisted state/settings at configured intervals.
//  - Enforce history retention and flush pending history records on shutdown.
//  - Coordinate graceful shutdown timers (resume data deadlines, etc.).
class HousekeepingService
{
  public:
    using Clock = std::chrono::steady_clock;

    struct Timers
    {
        std::chrono::seconds housekeeping_interval{2};
        std::chrono::seconds state_flush_interval{5};
        std::chrono::milliseconds settings_flush_interval{500};
    };

    HousekeepingService(AutomationAgent *automation,
                        HistoryAgent *history,
                        PersistenceManager *persistence,
                        Timers timers = {});

    // Called from engine loop to run scheduled tasks if due.
    void tick(Clock::time_point now);

    // Called on shutdown to force final flush of history/persistence.
    void shutdown_flush();

  private:
    AutomationAgent *automation_ = nullptr;
    HistoryAgent *history_ = nullptr;
    PersistenceManager *persistence_ = nullptr;
    Timers timers_{};
    Clock::time_point next_housekeeping_{};
    Clock::time_point next_state_flush_{};
    Clock::time_point next_settings_flush_{};

    // TODO: wire flush delegates (state, settings) via std::function callbacks.
};

} // namespace tt::engine

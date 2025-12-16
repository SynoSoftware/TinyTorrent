#include "engine/HousekeepingService.hpp"

#include "engine/AutomationAgent.hpp"
#include "engine/HistoryAgent.hpp"
#include "engine/PersistenceManager.hpp"

namespace tt::engine
{

HousekeepingService::HousekeepingService(AutomationAgent *automation,
                                         HistoryAgent *history,
                                         PersistenceManager *persistence,
                                         Timers timers)
  : automation_(automation),
    history_(history),
    persistence_(persistence),
    timers_(timers)
{
    auto now = Clock::now();
    next_housekeeping_ = now + timers_.housekeeping_interval;
    next_state_flush_ = now + timers_.state_flush_interval;
    next_settings_flush_ = now + timers_.settings_flush_interval;
}

void HousekeepingService::tick(Clock::time_point now)
{
    // TODO: call automation_->scan() when now >= next_housekeeping_.
    // TODO: trigger state flush and settings flush via injected callbacks.
    // TODO: call history_->perform_retention(now) when due.
}

void HousekeepingService::shutdown_flush()
{
    // TODO: force history flush and persistence flush on shutdown.
}

} // namespace tt::engine

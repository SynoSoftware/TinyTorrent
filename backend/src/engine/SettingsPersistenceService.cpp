#include "engine/SettingsPersistenceService.hpp"

#include "engine/PersistenceManager.hpp"
#include "engine/Core.hpp" // for CoreSettings

namespace tt::engine
{

SettingsPersistenceService::SettingsPersistenceService(
    PersistenceManager *persistence, Callbacks callbacks,
    std::chrono::milliseconds interval)
  : persistence_(persistence),
    callbacks_(std::move(callbacks)),
    interval_(interval)
{
    next_flush_ = Clock::time_point::min();
}

void SettingsPersistenceService::mark_dirty(Clock::time_point now)
{
    dirty_ = true;
    next_flush_ = now + interval_;
}

void SettingsPersistenceService::tick(Clock::time_point now)
{
    if (!dirty_ || now < next_flush_)
    {
        return;
    }
    flush_now();
}

void SettingsPersistenceService::flush_now()
{
    if (!dirty_ || !persistence_ || !persistence_->is_valid())
    {
        return;
    }
    if (callbacks_.snapshot)
    {
        auto settings = callbacks_.snapshot();
        if (!persistence_->persist_settings(settings))
        {
            // TODO: optional logging callback if needed later.
        }
    }
    dirty_ = false;
    next_flush_ = Clock::time_point::min();
}

} // namespace tt::engine

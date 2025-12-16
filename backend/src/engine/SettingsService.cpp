#include "engine/SettingsService.hpp"

#include "engine/PersistenceManager.hpp"

namespace tt::engine
{

SettingsService::SettingsService(PersistenceManager *persistence)
    : persistence_(persistence)
{
}

void SettingsService::mark_dirty()
{
    // Placeholder: logic will move from Core
    (void)persistence_;
}

void SettingsService::flush_if_due(std::chrono::steady_clock::time_point now)
{
    // Placeholder: logic will move from Core
    (void)persistence_;
    (void)now;
}

void SettingsService::flush_now()
{
    // Placeholder: logic will move from Core
    (void)persistence_;
}

} // namespace tt::engine

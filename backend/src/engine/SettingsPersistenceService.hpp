#pragma once

#include <chrono>
#include <functional>

namespace tt::engine
{

struct CoreSettings;
class PersistenceManager;

// SettingsPersistenceService encapsulates settings_dirty bookkeeping and
// periodic flush to PersistenceManager.
// Plan:
//  - Expose mark_dirty(now) to schedule a flush after a small delay.
//  - tick(now) performs flush when due, using a provided snapshot supplier.
//  - flush_now() forces immediate persist (e.g., shutdown).
class SettingsPersistenceService
{
  public:
    using Clock = std::chrono::steady_clock;

    struct Callbacks
    {
        // Supplies the current settings snapshot for persistence.
        std::function<CoreSettings()> snapshot;
    };

    SettingsPersistenceService(PersistenceManager *persistence,
                               Callbacks callbacks,
                               std::chrono::milliseconds interval =
                                   std::chrono::milliseconds(500));

    void mark_dirty(Clock::time_point now);
    void tick(Clock::time_point now);
    void flush_now();

  private:
    PersistenceManager *persistence_ = nullptr;
    Callbacks callbacks_{};
    std::chrono::milliseconds interval_{};
    bool dirty_ = false;
    Clock::time_point next_flush_{};
};

} // namespace tt::engine

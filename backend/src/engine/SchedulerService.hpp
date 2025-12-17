#pragma once

#include <chrono>
#include <functional>
#include <queue>
#include <vector>

namespace tt::engine
{

class SchedulerService
{
  public:
    using Clock = std::chrono::steady_clock;
    using TaskId = size_t;
    using Callback = std::function<void()>;

    // Returns a TaskId that can be used to cancel (optional implementation)
    TaskId schedule(std::chrono::milliseconds interval, Callback callback);

    // Run pending tasks. Returns how many were executed.
    size_t tick(Clock::time_point now);

    // Helper for the main loop: "How long can I sleep before work is due?"
    std::chrono::milliseconds time_until_next_task(Clock::time_point now) const;

  private:
    struct Task
    {
        TaskId id;
        std::chrono::milliseconds interval;
        Clock::time_point next_run;
        Callback callback;

        // Min-heap priority queue needs > operator for smallest-first
        bool operator>(const Task &other) const
        {
            return next_run > other.next_run;
        }
    };

    std::priority_queue<Task, std::vector<Task>, std::greater<Task>> tasks_;
    TaskId next_id_ = 1;
};

} // namespace tt::engine
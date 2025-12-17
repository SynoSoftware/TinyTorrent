#include "engine/SchedulerService.hpp"

namespace tt::engine
{

auto SchedulerService::schedule(std::chrono::milliseconds interval,
                                Callback callback) -> TaskId
{
    TaskId id = next_id_++;
    auto next = Clock::now() + interval;
    tasks_.push({id, interval, next, std::move(callback)});
    return id;
}

size_t SchedulerService::tick(Clock::time_point now)
{
    size_t executed = 0;

    // Process all tasks that are due
    while (!tasks_.empty() && tasks_.top().next_run <= now)
    {
        // 1. Extract task
        Task task = tasks_.top();
        tasks_.pop();

        // 2. Execute
        if (task.callback)
        {
            task.callback();
            executed++;
        }

        // 3. Reschedule
        task.next_run = now + task.interval;
        tasks_.push(task);
    }
    return executed;
}

std::chrono::milliseconds
SchedulerService::time_until_next_task(Clock::time_point now) const
{
    if (tasks_.empty())
    {
        return std::chrono::hours(24); // Infinite sleep essentially
    }
    auto next = tasks_.top().next_run;
    if (now >= next)
        return std::chrono::milliseconds(0);
    return std::chrono::duration_cast<std::chrono::milliseconds>(next - now);
}

} // namespace tt::engine
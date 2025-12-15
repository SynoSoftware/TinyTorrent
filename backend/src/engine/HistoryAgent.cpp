#include "engine/HistoryAgent.hpp"

#include "utils/Log.hpp"
#include "utils/StateStore.hpp"

#include <algorithm>
#include <chrono>
#include <future>

namespace tt::engine
{

namespace
{

constexpr int kMinHistoryIntervalSeconds = 60;
constexpr auto kHistoryRetentionCheckInterval = std::chrono::hours(1);

std::int64_t
align_to_history_interval(std::chrono::system_clock::time_point now,
                          int interval_seconds)
{
    auto seconds = static_cast<std::int64_t>(
        std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch())
            .count());
    if (interval_seconds <= 0)
    {
        return seconds;
    }
    return (seconds / interval_seconds) * interval_seconds;
}

int normalize_history_interval(int value)
{
    return std::max(kMinHistoryIntervalSeconds, value);
}

} // namespace

HistoryAgent::HistoryAgent(std::filesystem::path db_path, HistoryConfig config)
    : database_(std::make_unique<storage::Database>(std::move(db_path))),
      config_(std::move(config)), last_flush_(std::chrono::steady_clock::now()),
      next_retention_check_(std::chrono::steady_clock::now())
{
    configure_window(std::chrono::system_clock::now());
}

HistoryAgent::~HistoryAgent()
{
    stop();
}

void HistoryAgent::start()
{
    if (!database_ || !database_->is_valid())
    {
        return;
    }
    if (worker_thread_.joinable())
    {
        return;
    }
    exit_requested_.store(false, std::memory_order_release);
    worker_running_.store(true, std::memory_order_release);
    worker_thread_ = std::thread([this] { worker_loop(); });
}

void HistoryAgent::stop()
{
    exit_requested_.store(true, std::memory_order_release);
    task_cv_.notify_all();
    if (worker_thread_.joinable())
    {
        worker_thread_.join();
    }
    worker_running_.store(false, std::memory_order_release);
}

void HistoryAgent::record(std::chrono::steady_clock::time_point now,
                          std::uint64_t downloaded_delta,
                          std::uint64_t uploaded_delta)
{
    if (!config_.enabled)
    {
        return;
    }
    if (config_.interval_seconds <= 0)
    {
        return;
    }
    accumulator_down_ += downloaded_delta;
    accumulator_up_ += uploaded_delta;
    flush_if_due(now);
}

void HistoryAgent::flush_if_due(std::chrono::steady_clock::time_point now,
                                bool force)
{
    if (!config_.enabled && !force)
    {
        return;
    }
    if (config_.interval_seconds <= 0)
    {
        return;
    }
    auto next_flush =
        last_flush_ + std::chrono::seconds(config_.interval_seconds);
    if (!force && now < next_flush)
    {
        return;
    }
    auto bucket_timestamp = bucket_start_;
    auto down_bytes = accumulator_down_;
    auto up_bytes = accumulator_up_;
    accumulator_down_ = 0;
    accumulator_up_ = 0;
    if (bucket_timestamp == 0)
    {
        bucket_timestamp = align_to_history_interval(
            std::chrono::system_clock::now(), config_.interval_seconds);
    }
    if (!database_ || !database_->is_valid())
    {
        last_flush_ = now;
        bucket_start_ = bucket_timestamp;
        return;
    }
    schedule_task_async(
        [this, bucket_timestamp, down_bytes, up_bytes]()
        {
            if (!database_ || !database_->is_valid())
            {
                return;
            }
            if (!database_->insert_speed_history(bucket_timestamp, down_bytes,
                                                 up_bytes))
            {
                TT_LOG_INFO("history bucket insert failed");
            }
        });
    bucket_start_ = bucket_timestamp + config_.interval_seconds;
    last_flush_ = now;
}

void HistoryAgent::perform_retention(std::chrono::steady_clock::time_point now)
{
    if (config_.retention_days <= 0)
    {
        return;
    }
    if (now < next_retention_check_)
    {
        return;
    }
    next_retention_check_ = now + kHistoryRetentionCheckInterval;
    if (!database_ || !database_->is_valid())
    {
        return;
    }
    auto cutoff = static_cast<std::int64_t>(
        std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch())
            .count());
    auto retention_seconds =
        static_cast<std::int64_t>(config_.retention_days) * 86400;
    cutoff -= retention_seconds;
    if (cutoff < 0)
    {
        cutoff = 0;
    }
    schedule_task_async(
        [this, cutoff]()
        {
            if (!database_)
            {
                return;
            }
            if (!database_->delete_speed_history_before(cutoff))
            {
                TT_LOG_INFO("history retention delete failed");
            }
        });
}

std::vector<HistoryBucket>
HistoryAgent::query(std::int64_t start, std::int64_t end, std::int64_t step)
{
    if (!database_ || !database_->is_valid())
    {
        return {};
    }
    auto future = schedule_task_async(
        [this, start, end, step]()
        {
            if (!database_ || !database_->is_valid())
            {
                return std::vector<HistoryBucket>{};
            }
            auto entries = database_->query_speed_history(start, end, step);
            std::vector<HistoryBucket> result;
            result.reserve(entries.size());
            for (auto const &entry : entries)
            {
                result.push_back(HistoryBucket{entry.timestamp,
                                               entry.total_down, entry.total_up,
                                               entry.peak_down, entry.peak_up});
            }
            return result;
        });
    if (future.valid())
    {
        return future.get();
    }
    return {};
}

bool HistoryAgent::clear(std::optional<std::int64_t> older_than)
{
    if (!database_ || !database_->is_valid())
    {
        return false;
    }
    if (older_than)
    {
        auto future = schedule_task_async(
            [this, cutoff = *older_than]()
            {
                if (!database_)
                {
                    return false;
                }
                return database_->delete_speed_history_before(cutoff);
            });
        return future.valid() ? future.get() : false;
    }
    auto future = schedule_task_async(
        [this]()
        {
            if (!database_)
            {
                return false;
            }
            return database_->delete_speed_history_all();
        });
    return future.valid() ? future.get() : false;
}

HistoryConfig HistoryAgent::config() const
{
    return config_;
}

void HistoryAgent::update_config(HistoryConfig config, bool flush_after,
                                 bool reconfigure_after)
{
    config_.enabled = config.enabled;
    config_.interval_seconds =
        normalize_history_interval(config.interval_seconds);
    config_.retention_days = config.retention_days;
    if (flush_after)
    {
        flush_if_due(std::chrono::steady_clock::now(), true);
    }
    if (reconfigure_after)
    {
        configure_window(std::chrono::system_clock::now());
    }
}

void HistoryAgent::configure_window(std::chrono::system_clock::time_point now)
{
    bucket_start_ = align_to_history_interval(now, config_.interval_seconds);
    accumulator_down_ = 0;
    accumulator_up_ = 0;
    last_flush_ = std::chrono::steady_clock::now();
    next_retention_check_ = last_flush_;
}

void HistoryAgent::worker_loop()
{
    while (true)
    {
        std::function<void()> task;
        {
            std::unique_lock<std::mutex> lock(task_mutex_);
            task_cv_.wait(lock,
                          [this]
                          {
                              return !tasks_.empty() ||
                                     exit_requested_.load(
                                         std::memory_order_acquire);
                          });
            if (tasks_.empty())
            {
                if (exit_requested_.load(std::memory_order_acquire))
                {
                    break;
                }
                continue;
            }
            task = std::move(tasks_.front());
            tasks_.pop_front();
        }
        try
        {
            task();
        }
        catch (std::exception const &ex)
        {
            TT_LOG_INFO("history worker task exception: {}", ex.what());
        }
        catch (...)
        {
            TT_LOG_INFO("history worker task exception");
        }
    }
}

template <typename Fn>
std::future<std::invoke_result_t<Fn>> HistoryAgent::schedule_task_async(Fn &&fn)
{
    using result_t = std::invoke_result_t<Fn>;
    auto task =
        std::make_shared<std::packaged_task<result_t()>>(std::forward<Fn>(fn));
    auto future = task->get_future();
    if (!worker_running_.load(std::memory_order_acquire) ||
        exit_requested_.load(std::memory_order_acquire))
    {
        (*task)();
        return future;
    }
    {
        std::lock_guard<std::mutex> lock(task_mutex_);
        tasks_.emplace_back([task]() mutable { (*task)(); });
    }
    task_cv_.notify_one();
    return future;
}

} // namespace tt::engine

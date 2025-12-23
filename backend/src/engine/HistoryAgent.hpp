#pragma once

#include "engine/Core.hpp"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>
#include <type_traits>
#include <vector>

namespace tt::storage
{
class Database;
}

namespace tt::engine
{

class HistoryAgent
{
  public:
    HistoryAgent(std::filesystem::path db_path, HistoryConfig config);
    HistoryAgent(HistoryAgent const &) = delete;
    HistoryAgent &operator=(HistoryAgent const &) = delete;
    ~HistoryAgent();

    void start();
    void stop();

    void record(std::chrono::steady_clock::time_point now,
                std::uint64_t downloaded_delta, std::uint64_t uploaded_delta);
    void flush_if_due(std::chrono::steady_clock::time_point now,
                      bool force = false);
    void perform_retention(std::chrono::steady_clock::time_point now);

    std::vector<HistoryBucket> query(std::int64_t start, std::int64_t end,
                                     std::int64_t step);
    bool clear(std::optional<std::int64_t> older_than);

    HistoryConfig config() const;
    void update_config(HistoryConfig config, bool flush_after,
                       bool reconfigure_after);
    void configure_window(std::chrono::system_clock::time_point now);

  private:
    template <typename Fn>
    std::future<std::invoke_result_t<Fn>> schedule_task_async(Fn &&fn);

    void worker_loop();

    std::unique_ptr<storage::Database> database_;
    HistoryConfig config_;
    std::chrono::steady_clock::time_point last_flush_;
    std::chrono::steady_clock::time_point next_retention_check_;
    std::atomic<std::uint64_t> accumulator_down_ = 0;
    std::atomic<std::uint64_t> accumulator_up_ = 0;
    std::atomic<std::int64_t> bucket_start_ = 0;

    std::atomic<bool> worker_running_{false};
    std::atomic<bool> exit_requested_{false};
    std::thread worker_thread_;
    std::mutex task_mutex_;
    std::condition_variable task_cv_;
    std::deque<std::function<void()>> tasks_;
};

} // namespace tt::engine

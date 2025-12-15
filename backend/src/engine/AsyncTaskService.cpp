#include "engine/AsyncTaskService.hpp"

#include "utils/Log.hpp"

#include <exception>
#include <thread>
#include <utility>

namespace tt::engine
{

AsyncTaskService::AsyncTaskService() = default;

AsyncTaskService::~AsyncTaskService()
{
    stop();
}

void AsyncTaskService::start()
{
    if (worker_.joinable())
    {
        return;
    }
    exit_requested_.store(false, std::memory_order_release);
    running_.store(true, std::memory_order_release);
    worker_ = std::thread([this] { loop(); });
}

void AsyncTaskService::stop()
{
    exit_requested_.store(true, std::memory_order_release);
    cv_.notify_all();
    if (worker_.joinable())
    {
        worker_.join();
    }
    running_.store(false, std::memory_order_release);
}

bool AsyncTaskService::is_running() const noexcept
{
    return running_.load(std::memory_order_acquire);
}

void AsyncTaskService::submit(std::function<void()> task)
{
    if (!task)
    {
        return;
    }
    {
        std::lock_guard<std::mutex> guard(mutex_);
        if (exit_requested_.load(std::memory_order_acquire))
        {
            return;
        }
        tasks_.push_back(std::move(task));
    }
    cv_.notify_one();
}

void AsyncTaskService::loop()
{
    while (true)
    {
        std::function<void()> task;
        {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait(lock,
                     [this]
                     {
                         return exit_requested_.load(
                                    std::memory_order_acquire) ||
                                !tasks_.empty();
                     });
            if (exit_requested_.load(std::memory_order_acquire) &&
                tasks_.empty())
            {
                break;
            }
            if (tasks_.empty())
            {
                continue;
            }
            task = std::move(tasks_.front());
            tasks_.pop_front();
        }
        try
        {
            if (task)
            {
                task();
            }
        }
        catch (std::exception const &ex)
        {
            TT_LOG_INFO("async task exception: {}", ex.what());
        }
        catch (...)
        {
            TT_LOG_INFO("async task exception");
        }
    }
    running_.store(false, std::memory_order_release);
}

} // namespace tt::engine

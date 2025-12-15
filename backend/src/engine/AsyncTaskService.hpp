#pragma once

#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>

namespace tt::engine {

class AsyncTaskService {
public:
  AsyncTaskService();
  AsyncTaskService(AsyncTaskService const &) = delete;
  AsyncTaskService &operator=(AsyncTaskService const &) = delete;
  ~AsyncTaskService();

  void start();
  void stop();
  bool is_running() const noexcept;
  void submit(std::function<void()> task);

private:
  void loop();

  mutable std::mutex mutex_;
  std::condition_variable cv_;
  std::deque<std::function<void()>> tasks_;
  std::thread worker_;
  std::atomic<bool> running_{false};
  std::atomic<bool> exit_requested_{false};
};

} // namespace tt::engine

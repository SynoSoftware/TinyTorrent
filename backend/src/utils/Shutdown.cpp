#include "utils/Shutdown.hpp"

#include <atomic>

namespace tt::runtime {

namespace {
std::atomic_bool g_shutdown_requested{false};
} // namespace

void request_shutdown() noexcept {
  g_shutdown_requested.store(true, std::memory_order_relaxed);
}

bool should_shutdown() noexcept {
  return g_shutdown_requested.load(std::memory_order_relaxed);
}

} // namespace tt::runtime

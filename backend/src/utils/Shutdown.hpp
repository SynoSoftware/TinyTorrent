#pragma once

#include <atomic>

namespace tt::runtime
{

void request_shutdown() noexcept;
bool should_shutdown() noexcept;

} // namespace tt::runtime

#pragma once

#include <cstdarg>
#include <cstdio>
#include <chrono>
#include <ctime>

namespace tt::log {

#if defined(TT_ENABLE_LOGGING) && !defined(TT_BUILD_MINIMAL)
inline void write_line(char level, char const *fmt, ...) {
  auto const now = std::chrono::system_clock::now();
  auto millis =
      static_cast<long long>(std::chrono::duration_cast<std::chrono::milliseconds>(
                                 now.time_since_epoch())
                                 .count() %
                             1000);
  auto time = std::chrono::system_clock::to_time_t(now);
  std::tm tm{};
  localtime_s(&tm, &time);
  char time_buffer[16]{};
  std::strftime(time_buffer, sizeof(time_buffer), "%H:%M:%S", &tm);

  std::fprintf(stderr, "[%c %s.%03lld] ", level, time_buffer, millis);
  va_list args;
  va_start(args, fmt);
  std::vfprintf(stderr, fmt, args);
  va_end(args);
  std::fputc('\n', stderr);
}
#else
inline void write_line(char, char const *, ...) noexcept {}
#endif

} // namespace tt::log

#if defined(TT_ENABLE_LOGGING) && !defined(TT_BUILD_MINIMAL)
#define TT_LOG_INFO(fmt, ...) tt::log::write_line('I', fmt, ##__VA_ARGS__)
#define TT_LOG_DEBUG(fmt, ...) tt::log::write_line('D', fmt, ##__VA_ARGS__)
#else
#define TT_LOG_INFO(fmt, ...) (void)0
#define TT_LOG_DEBUG(fmt, ...) (void)0
#endif

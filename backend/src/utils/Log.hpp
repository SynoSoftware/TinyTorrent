#pragma once

#include <chrono>
#include <cstdio>
#include <ctime>
#include <format>
#include <utility>

namespace tt::log
{

#if defined(TT_ENABLE_LOGGING) && !defined(TT_BUILD_MINIMAL)
template <typename... Args>
inline void write_line(char level, std::format_string<Args...> fmt,
                       Args &&...args)
{
    const auto now = std::chrono::system_clock::now();
    auto const millis = static_cast<long long>(
        std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch())
            .count() %
        1000);
    auto const time = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
    localtime_s(&tm, &time);
    char time_buffer[16]{};
    std::strftime(time_buffer, sizeof(time_buffer), "%H:%M:%S", &tm);

    auto const message = std::format(fmt, std::forward<Args>(args)...);
    std::fprintf(stderr, "[%c %s.%03lld] %s\n", level, time_buffer, millis,
                 message.c_str());
}
#else
template <typename... Args>
inline void write_line(char, std::format_string<Args...>, Args &&...) noexcept
{
}
#endif

template <typename... Args>
inline void print_status(std::format_string<Args...> fmt, Args &&...args)
{
    auto const message = std::format(fmt, std::forward<Args>(args)...);
    std::fputs(message.c_str(), stdout);
    std::fputc('\n', stdout);
}

} // namespace tt::log

#if defined(TT_ENABLE_LOGGING) && !defined(TT_BUILD_MINIMAL)
#define TT_LOG_INFO(fmt, ...) tt::log::write_line('I', fmt, ##__VA_ARGS__)
#define TT_LOG_DEBUG(fmt, ...) tt::log::write_line('D', fmt, ##__VA_ARGS__)
#define TT_LOG_WARN(fmt, ...) tt::log::write_line('W', fmt, ##__VA_ARGS__)
#define TT_LOG_ERROR(fmt, ...) tt::log::write_line('E', fmt, ##__VA_ARGS__)
#else
#define TT_LOG_INFO(fmt, ...) (void)0
#define TT_LOG_DEBUG(fmt, ...) (void)0
#define TT_LOG_WARN(fmt, ...) (void)0
#define TT_LOG_ERROR(fmt, ...) (void)0
#endif

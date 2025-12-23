#pragma once

#include <chrono>
#include <cstdio>
#include <ctime>
#include <format>
#include <fstream>
#include <mutex>
#include <utility>

namespace tt::log
{

// Forward declaration for non-templated file append (defined in Log.cpp).
void append_log_line_to_file(std::string const &line);

// If TT_ENABLE_LOGGING is defined and non-zero, it takes absolute
// precedence over TT_BUILD_MINIMAL. This allows enabling logs temporarily
// in Release builds for diagnostics.
#if !defined(TT_ENABLE_LOGGING)
// leave undefined unless explicitly enabled
#endif

// Logging implementation enabled when TT_ENABLE_LOGGING is defined and
// non-zero. This ignores TT_BUILD_MINIMAL when TT_ENABLE_LOGGING==1.
#if defined(TT_ENABLE_LOGGING) && (TT_ENABLE_LOGGING)
template <typename... Args>
inline void write_line(char level, std::string_view fmt, Args &&...args)
{
    const auto now = std::chrono::system_clock::now();
    auto const millis = static_cast<long long>(
        std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch())
            .count() %
        1000);
    auto const time = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
#if defined(_WIN32)
    localtime_s(&tm, &time);
#else
    localtime_r(&time, &tm);
#endif
    char time_buffer[16]{};
    std::strftime(time_buffer, sizeof(time_buffer), "%H:%M:%S", &tm);

    auto const message = std::vformat(fmt, std::make_format_args(args...));
    // Compose final line without using std::format to avoid compile-time
    // format-string template issues. Format millis as 3 digits.
    char millis_buf[8] = {};
    std::snprintf(millis_buf, sizeof(millis_buf), "%03lld", millis);
    std::string final;
    final.reserve(64 + message.size());
    final.push_back('[');
    final.push_back(level);
    final.push_back(' ');
    final.append(time_buffer);
    final.push_back('.');
    final.append(millis_buf);
    final.append("] ");
    final.append(message);
    // 1) Try stderr first
    if (stderr)
    {
        std::fprintf(stderr, "%s\n", final.c_str());
        std::fflush(stderr);
    }
    // 2) Always append to a fallback file to ensure logs are persisted
    try
    {
        append_log_line_to_file(final);
    }
    catch (...)
    {
    }
}
#else
template <typename... Args>
inline void write_line(char, const std::string &, Args &&...) noexcept
{
}
#endif

template <typename... Args>
inline void print_status(std::string_view fmt, Args &&...args)
{
    auto const message = std::vformat(fmt, std::make_format_args(args...));
    std::fputs(message.c_str(), stdout);
    std::fputc('\n', stdout);
}

} // namespace tt::log

// Macro behavior: If TT_ENABLE_LOGGING is explicitly set to 1, always
// enable logging macros regardless of TT_BUILD_MINIMAL. Otherwise, fall
// back to the original behavior: disable logs when TT_BUILD_MINIMAL is set.
#if defined(TT_ENABLE_LOGGING) && (TT_ENABLE_LOGGING)
#define TT_LOG_INFO(fmt, ...) tt::log::write_line('I', fmt, ##__VA_ARGS__)
#define TT_LOG_DEBUG(fmt, ...) tt::log::write_line('D', fmt, ##__VA_ARGS__)
#define TT_LOG_WARN(fmt, ...) tt::log::write_line('W', fmt, ##__VA_ARGS__)
#define TT_LOG_ERROR(fmt, ...) tt::log::write_line('E', fmt, ##__VA_ARGS__)
#else
#if defined(TT_BUILD_MINIMAL)
#define TT_LOG_INFO(fmt, ...) (void)0
#define TT_LOG_DEBUG(fmt, ...) (void)0
#define TT_LOG_WARN(fmt, ...) (void)0
#define TT_LOG_ERROR(fmt, ...) (void)0
#else
#define TT_LOG_INFO(fmt, ...) tt::log::write_line('I', fmt, ##__VA_ARGS__)
#define TT_LOG_DEBUG(fmt, ...) tt::log::write_line('D', fmt, ##__VA_ARGS__)
#define TT_LOG_WARN(fmt, ...) tt::log::write_line('W', fmt, ##__VA_ARGS__)
#define TT_LOG_ERROR(fmt, ...) tt::log::write_line('E', fmt, ##__VA_ARGS__)
#endif
#endif

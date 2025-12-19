#pragma once

#include <algorithm>
#include <array>
#include <cctype>
#include <string>
#include <string_view>
#include <utility>

namespace tt::net
{

struct HostPort
{
    std::string host;
    std::string port;
    bool bracketed = false;
};

inline HostPort parse_host_port(std::string_view input)
{
    HostPort result;
    if (input.empty())
    {
        return result;
    }
    if (input.front() == '[')
    {
        auto closing = input.find(']');
        if (closing == std::string_view::npos)
        {
            result.host = std::string(input);
            return result;
        }
        result.host = std::string(input.substr(1, closing - 1));
        result.bracketed = true;
        if (closing + 1 < input.size() && input[closing + 1] == ':')
        {
            result.port = std::string(input.substr(closing + 2));
        }
        return result;
    }
    auto colon = input.find_last_of(':');
    if (colon == std::string_view::npos)
    {
        result.host = std::string(input);
        return result;
    }
    result.host = std::string(input.substr(0, colon));
    result.port = std::string(input.substr(colon + 1));
    return result;
}

inline std::string format_host_port(HostPort const &parts)
{
    if (parts.host.empty())
    {
        return parts.port.empty() ? std::string() : ":" + parts.port;
    }
    std::string host = parts.host;
    bool needs_bracket =
        parts.bracketed || host.find(':') != std::string::npos;
    if (needs_bracket && (host.front() != '[' || host.back() != ']'))
    {
        host = "[" + host + "]";
    }
    if (parts.port.empty())
    {
        return host;
    }
    return host + ":" + parts.port;
}

inline bool is_ipv6_literal(std::string_view host)
{
    return host.find(':') != std::string::npos;
}

constexpr std::array<std::string_view, 5> kLoopbackHosts = {
    "127.0.0.1", "localhost", "[::1]", "::1", "0:0:0:0:0:0:0:1"};

inline std::string trim_whitespace(std::string value)
{
    auto begin = value.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos)
    {
        return {};
    }
    auto end = value.find_last_not_of(" \t\r\n");
    if (end == std::string::npos)
    {
        return {};
    }
    return value.substr(begin, end - begin + 1);
}

inline bool is_loopback_host(std::string_view host)
{
    if (host.empty())
    {
        return false;
    }
    std::string normalized(trim_whitespace(std::string(host)));
    if (normalized.size() >= 2 && normalized.front() == '[' &&
        normalized.back() == ']')
    {
        normalized = normalized.substr(1, normalized.size() - 2);
    }
    std::transform(normalized.begin(), normalized.end(), normalized.begin(),
                   [](unsigned char ch)
                   { return static_cast<char>(std::tolower(ch)); });
    for (auto candidate : kLoopbackHosts)
    {
        std::string candidate_normalized(candidate);
        std::transform(candidate_normalized.begin(), candidate_normalized.end(),
                       candidate_normalized.begin(),
                       [](unsigned char ch)
                       { return static_cast<char>(std::tolower(ch)); });
        if (normalized == candidate_normalized)
        {
            return true;
        }
    }
    return false;
}

inline std::pair<std::string, std::string> parse_rpc_bind(
    std::string const &value)
{
    if (value.empty())
    {
        return {std::string(), std::string()};
    }
    auto scheme = value.find("://");
    auto host_start = (scheme == std::string::npos) ? 0 : scheme + 3;
    auto host_end = value.find('/', host_start);
    std::string host_port;
    if (host_end == std::string::npos)
    {
        host_port = value.substr(host_start);
    }
    else
    {
        host_port = value.substr(host_start, host_end - host_start);
    }
    if (host_port.empty())
    {
        return {std::string(), std::string()};
    }
    auto parts = parse_host_port(host_port);
    return {parts.host, parts.port};
}

} // namespace tt::net

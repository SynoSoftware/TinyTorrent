#pragma once

#include <string>
#include <string_view>

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
    bool needs_bracket = parts.bracketed || host.find(':') != std::string::npos;
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
    return host.find(':') != std::string_view::npos;
}

} // namespace tt::net

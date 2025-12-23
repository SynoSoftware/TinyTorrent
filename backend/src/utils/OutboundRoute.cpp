#include "utils/OutboundRoute.hpp"

#include "utils/Log.hpp"

#include <algorithm>
#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>

#include <iphlpapi.h>
#include <netioapi.h>

#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "ws2_32.lib")
#endif

namespace tt::net
{

namespace
{
#if defined(_WIN32)

struct Candidate
{
    std::string ipv4;
    std::uint32_t ifindex = 0;
    std::uint32_t route_metric = 0;
    std::uint32_t iftype = 0;
    std::wstring friendly_name;
};

bool starts_with_case_insensitive(std::wstring const &value,
                                  wchar_t const *prefix)
{
    if (!prefix)
    {
        return false;
    }
    std::size_t prefix_len = wcslen(prefix);
    if (value.size() < prefix_len)
    {
        return false;
    }
    for (std::size_t i = 0; i < prefix_len; ++i)
    {
        auto a = value[i];
        auto b = prefix[i];
        if (towlower(a) != towlower(b))
        {
            return false;
        }
    }
    return true;
}

bool contains_case_insensitive(std::wstring const &value, wchar_t const *needle)
{
    if (!needle)
    {
        return false;
    }
    auto needle_len = wcslen(needle);
    if (needle_len == 0)
    {
        return true;
    }
    for (std::size_t i = 0; i + needle_len <= value.size(); ++i)
    {
        bool match = true;
        for (std::size_t j = 0; j < needle_len; ++j)
        {
            if (towlower(value[i + j]) != towlower(needle[j]))
            {
                match = false;
                break;
            }
        }
        if (match)
        {
            return true;
        }
    }
    return false;
}

bool is_virtual_adapter_name(std::wstring const &name)
{
    // Deterministic string checks for well-known virtual adapters.
    // Avoids trying to infer subnets (which can collide with real networks).
    return contains_case_insensitive(name, L"docker") ||
           contains_case_insensitive(name, L"wsl") ||
           contains_case_insensitive(name, L"hyper-v") ||
           contains_case_insensitive(name, L"vEthernet") ||
           contains_case_insensitive(name, L"vmware") ||
           contains_case_insensitive(name, L"virtualbox") ||
           contains_case_insensitive(name, L"vbox") ||
           contains_case_insensitive(name, L"loopback");
}

int interface_kind_rank(std::uint32_t iftype, std::wstring const &name)
{
    // Lower is better.
    // Prefer physical NICs over VPN/tunnels, and exclude virtual adapters.
    if (is_virtual_adapter_name(name))
    {
        return 100;
    }

    // Common physical NIC types
    if (iftype == IF_TYPE_ETHERNET_CSMACD || iftype == IF_TYPE_IEEE80211)
    {
        return 0;
    }

    // VPN-ish / tunnels
    if (iftype == IF_TYPE_PPP || iftype == IF_TYPE_TUNNEL)
    {
        return 10;
    }

    // Everything else
    return 20;
}

std::optional<std::string> socket_route_ipv4()
{
    WSADATA wsa{};
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0)
    {
        return std::nullopt;
    }

    SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (s == INVALID_SOCKET)
    {
        WSACleanup();
        return std::nullopt;
    }

    sockaddr_in dest{};
    dest.sin_family = AF_INET;
    dest.sin_port = htons(53);
    // 8.8.8.8
    dest.sin_addr.s_addr = htonl(0x08080808);

    // No packets are necessarily sent for UDP connect; OS picks a route.
    int rc = connect(s, reinterpret_cast<sockaddr *>(&dest), sizeof(dest));
    if (rc != 0)
    {
        closesocket(s);
        WSACleanup();
        return std::nullopt;
    }

    sockaddr_in local{};
    int local_len = sizeof(local);
    rc = getsockname(s, reinterpret_cast<sockaddr *>(&local), &local_len);
    if (rc != 0)
    {
        closesocket(s);
        WSACleanup();
        return std::nullopt;
    }

    char buf[INET_ADDRSTRLEN] = {};
    if (!InetNtopA(AF_INET, &local.sin_addr, buf, INET_ADDRSTRLEN))
    {
        closesocket(s);
        WSACleanup();
        return std::nullopt;
    }

    std::string result(buf);
    closesocket(s);
    WSACleanup();
    if (result.empty())
    {
        return std::nullopt;
    }
    return result;
}

std::unordered_map<std::uint32_t, std::uint32_t> default_route_metrics()
{
    std::unordered_map<std::uint32_t, std::uint32_t> metrics;

    PMIB_IPFORWARD_TABLE2 table = nullptr;
    if (GetIpForwardTable2(AF_INET, &table) != NO_ERROR || !table)
    {
        return metrics;
    }

    for (ULONG i = 0; i < table->NumEntries; ++i)
    {
        auto const &row = table->Table[i];
        if (row.DestinationPrefix.Prefix.si_family != AF_INET)
        {
            continue;
        }
        if (row.DestinationPrefix.PrefixLength != 0)
        {
            continue;
        }
        // Default route 0.0.0.0/0
        auto const dest = row.DestinationPrefix.Prefix.Ipv4.sin_addr.s_addr;
        if (dest != 0)
        {
            continue;
        }
        auto ifindex = row.InterfaceIndex;
        auto metric = row.Metric;
        auto it = metrics.find(ifindex);
        if (it == metrics.end() || metric < it->second)
        {
            metrics[ifindex] = metric;
        }
    }

    FreeMibTable(table);
    return metrics;
}

std::vector<Candidate> enumerate_candidates()
{
    std::vector<Candidate> out;

    auto route_metrics = default_route_metrics();
    if (route_metrics.empty())
    {
        return out;
    }

    ULONG flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST |
                  GAA_FLAG_SKIP_DNS_SERVER;

    ULONG size = 0;
    GetAdaptersAddresses(AF_INET, flags, nullptr, nullptr, &size);
    if (size == 0)
    {
        return out;
    }

    std::vector<std::uint8_t> buffer(size);
    auto *addrs = reinterpret_cast<IP_ADAPTER_ADDRESSES *>(buffer.data());
    ULONG rc = GetAdaptersAddresses(AF_INET, flags, nullptr, addrs, &size);
    if (rc != NO_ERROR)
    {
        return out;
    }

    for (auto *a = addrs; a != nullptr; a = a->Next)
    {
        if (a->OperStatus != IfOperStatusUp)
        {
            continue;
        }
        if (a->IfType == IF_TYPE_SOFTWARE_LOOPBACK)
        {
            continue;
        }

        auto ifindex = static_cast<std::uint32_t>(a->IfIndex);
        auto metric_it = route_metrics.find(ifindex);
        if (metric_it == route_metrics.end())
        {
            continue;
        }

        std::wstring friendly = a->FriendlyName ? a->FriendlyName : L"";
        if (is_virtual_adapter_name(friendly))
        {
            continue;
        }

        // Choose the first suitable unicast IPv4 address.
        std::string ip;
        for (auto *u = a->FirstUnicastAddress; u != nullptr; u = u->Next)
        {
            if (!u->Address.lpSockaddr)
            {
                continue;
            }
            if (u->Address.lpSockaddr->sa_family != AF_INET)
            {
                continue;
            }
            auto *sin = reinterpret_cast<sockaddr_in *>(u->Address.lpSockaddr);
            char buf_ip[INET_ADDRSTRLEN] = {};
            if (!InetNtopA(AF_INET, &sin->sin_addr, buf_ip, INET_ADDRSTRLEN))
            {
                continue;
            }
            std::string candidate_ip(buf_ip);
            if (candidate_ip.empty())
            {
                continue;
            }
            if (is_disallowed_outbound_ipv4(candidate_ip))
            {
                continue;
            }
            ip = std::move(candidate_ip);
            break;
        }

        if (ip.empty())
        {
            continue;
        }

        Candidate c;
        c.ipv4 = std::move(ip);
        c.ifindex = ifindex;
        c.route_metric = metric_it->second;
        c.iftype = a->IfType;
        c.friendly_name = std::move(friendly);
        out.push_back(std::move(c));
    }

    return out;
}

#endif
} // namespace

bool is_disallowed_outbound_ipv4(std::string const &ipv4)
{
    // Strict exclusions:
    // - 127.0.0.0/8
    // - 169.254.0.0/16 (APIPA)
    // - 0.0.0.0
    in_addr addr{};
#if defined(_WIN32)
    if (InetPtonA(AF_INET, ipv4.c_str(), &addr) != 1)
    {
        return true;
    }
#else
    (void)addr;
#endif

#if defined(_WIN32)
    auto v = ntohl(addr.s_addr);
    if ((v & 0xFF000000u) == 0x7F000000u)
    {
        return true;
    }
    if ((v & 0xFFFF0000u) == 0xA9FE0000u)
    {
        return true;
    }
    if (v == 0)
    {
        return true;
    }
#endif

    return false;
}

std::optional<std::string> primary_outbound_ipv4()
{
#if defined(_WIN32)
    auto ip = socket_route_ipv4();
    if (!ip)
    {
        return std::nullopt;
    }
    if (is_disallowed_outbound_ipv4(*ip))
    {
        return std::nullopt;
    }
    return ip;
#else
    return std::nullopt;
#endif
}

std::vector<std::string> ranked_outbound_ipv4_candidates()
{
#if !defined(_WIN32)
    return {};
#else
    auto candidates = enumerate_candidates();
    if (candidates.empty())
    {
        return {};
    }

    // Deterministic sort.
    std::sort(candidates.begin(), candidates.end(),
              [](Candidate const &a, Candidate const &b)
              {
                  if (a.route_metric != b.route_metric)
                  {
                      return a.route_metric < b.route_metric;
                  }
                  auto ar = interface_kind_rank(a.iftype, a.friendly_name);
                  auto br = interface_kind_rank(b.iftype, b.friendly_name);
                  if (ar != br)
                  {
                      return ar < br;
                  }
                  if (a.ifindex != b.ifindex)
                  {
                      return a.ifindex < b.ifindex;
                  }
                  return a.ipv4 < b.ipv4;
              });

    // Prefer OS-selected primary route (8.8.8.8) if it appears.
    if (auto primary = primary_outbound_ipv4(); primary)
    {
        auto it = std::find_if(candidates.begin(), candidates.end(),
                               [&](Candidate const &c)
                               { return c.ipv4 == *primary; });
        if (it != candidates.end())
        {
            Candidate chosen = *it;
            candidates.erase(it);
            candidates.insert(candidates.begin(), std::move(chosen));
        }
        else
        {
            // The OS-selected primary route is authoritative; if it passed
            // exclusions, include it first.
            Candidate chosen;
            chosen.ipv4 = *primary;
            chosen.route_metric = 0;
            chosen.ifindex = 0;
            chosen.iftype = 0;
            candidates.insert(candidates.begin(), std::move(chosen));
        }
    }

    // Deduplicate by IP (stable order).
    std::vector<std::string> result;
    result.reserve(candidates.size());
    for (auto const &c : candidates)
    {
        if (c.ipv4.empty() || is_disallowed_outbound_ipv4(c.ipv4))
        {
            continue;
        }
        if (std::find(result.begin(), result.end(), c.ipv4) != result.end())
        {
            continue;
        }
        result.push_back(c.ipv4);
    }

#if defined(TT_ENABLE_LOGGING) && !defined(TT_BUILD_MINIMAL)
    if (!result.empty())
    {
        TT_LOG_INFO("Outbound announce candidates: {}", result.size());
        for (std::size_t i = 0; i < result.size(); ++i)
        {
            TT_LOG_INFO("  [{}] {}", i, result[i]);
        }
    }
#endif

    return result;
#endif
}

} // namespace tt::net

#pragma once

#include <optional>
#include <string>
#include <vector>

namespace tt::net
{

// Returns a deterministic, ranked list of outbound IPv4 source addresses that
// have a real default route. The list is intended for pinning libtorrent's
// settings_pack::announce_ip/outgoing_interfaces.
//
// Windows: based on the OS routing table + adapter state.
// Other platforms: returns empty.
std::vector<std::string> ranked_outbound_ipv4_candidates();

// Returns the OS-selected primary outbound IPv4 source address for reaching a
// public internet destination (8.8.8.8:53). Windows only.
// Other platforms: returns std::nullopt.
std::optional<std::string> primary_outbound_ipv4();

// Returns true if the IPv4 address is disallowed as an outbound announce source
// (loopback/APIPA/unspecified).
bool is_disallowed_outbound_ipv4(std::string const &ipv4);

} // namespace tt::net

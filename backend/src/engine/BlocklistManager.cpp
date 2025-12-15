#include "engine/BlocklistManager.hpp"

#include "utils/Log.hpp"

#include <boost/asio/ip/network_v4.hpp>
#include <boost/asio/ip/network_v6.hpp>
#include <libtorrent/address.hpp>

#include <cctype>
#include <fstream>
#include <string>
#include <string_view>
#include <optional>
#include <system_error>
#include <utility>

namespace tt::engine {

namespace {

std::string_view trim_view(std::string_view value) {
  std::size_t begin = 0;
  std::size_t end = value.size();
  while (begin < end &&
         std::isspace(static_cast<unsigned char>(value[begin]))) {
    ++begin;
  }
  while (end > begin &&
         std::isspace(static_cast<unsigned char>(value[end - 1]))) {
    --end;
  }
  return value.substr(begin, end - begin);
}

std::optional<libtorrent::address> parse_address(std::string_view input) {
  if (input.empty()) {
    return std::nullopt;
  }
  try {
    return libtorrent::make_address(std::string(input));
  } catch (...) {
    return std::nullopt;
  }
}

libtorrent::address_v6 expand_ipv6_range(boost::asio::ip::network_v6 const &network) {
  auto bytes = network.network().to_bytes();
  int prefix = static_cast<int>(network.prefix_length());
  for (int bit = prefix; bit < 128; ++bit) {
    auto index = bit / 8;
    auto shift = 7 - (bit % 8);
    bytes[index] |= static_cast<unsigned char>(1 << shift);
  }
  return libtorrent::address_v6(bytes);
}

std::optional<std::pair<libtorrent::address, libtorrent::address>>
parse_blocklist_entry(std::string_view raw) {
  auto value = trim_view(raw);
  if (value.empty() || value[0] == '#') {
    return std::nullopt;
  }

  auto const dash = value.find('-');
  if (dash != std::string_view::npos) {
    auto first = trim_view(value.substr(0, dash));
    auto last = trim_view(value.substr(dash + 1));
    if (auto start = parse_address(first); start) {
      if (auto end = parse_address(last); end) {
        return std::make_pair(*start, *end);
      }
    }
    return std::nullopt;
  }

  auto const slash = value.find('/');
  if (slash != std::string_view::npos) {
    std::string segment(value);
    try {
      auto network = boost::asio::ip::make_network_v4(segment);
      libtorrent::address start =
          libtorrent::address_v4(network.network());
      libtorrent::address end =
          libtorrent::address_v4(network.broadcast());
      return std::make_pair(start, end);
    } catch (...) {
      try {
        auto network = boost::asio::ip::make_network_v6(segment);
        libtorrent::address start =
            libtorrent::address_v6(network.network());
        libtorrent::address end =
            libtorrent::address_v6(expand_ipv6_range(network));
        return std::make_pair(start, end);
      } catch (...) {
        return std::nullopt;
      }
    }
  }

  if (auto addr = parse_address(value); addr) {
    return std::make_pair(*addr, *addr);
  }
  return std::nullopt;
}

} // namespace

BlocklistManager::BlocklistManager(std::filesystem::path path)
    : path_(std::move(path)) {}

void BlocklistManager::set_path(std::filesystem::path path) {
  path_ = std::move(path);
}

std::filesystem::path const &BlocklistManager::path() const noexcept {
  return path_;
}

std::optional<BlocklistManager::Result> BlocklistManager::reload() const {
  if (path_.empty()) {
    return std::nullopt;
  }
  std::error_code ec;
  if (!std::filesystem::exists(path_, ec)) {
    return std::nullopt;
  }
  std::ifstream input(path_);
  if (!input) {
    return std::nullopt;
  }
  Result result;
  std::string line;
  while (std::getline(input, line)) {
    if (!line.empty() && line.back() == '\r') {
      line.pop_back();
    }
    if (auto range = parse_blocklist_entry(line); range) {
      result.filter.add_rule(range->first, range->second,
                             libtorrent::ip_filter::blocked);
      ++result.entries;
    }
  }
  result.timestamp = std::chrono::system_clock::now();
  return result;
}

} // namespace tt::engine

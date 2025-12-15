#pragma once

#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/alert_types.hpp>
#include <libtorrent/sha1_hash.hpp>
#include <libtorrent/torrent_handle.hpp>

#include <cstdint>
#include <limits>
#include <optional>
#include <string>
#include <string_view>

namespace tt::engine {

constexpr int kSha1Bytes = static_cast<int>(libtorrent::sha1_hash::size());

inline int hex_digit_value(char ch) {
  if (ch >= '0' && ch <= '9') {
    return ch - '0';
  }
  if (ch >= 'a' && ch <= 'f') {
    return ch - 'a' + 10;
  }
  if (ch >= 'A' && ch <= 'F') {
    return ch - 'A' + 10;
  }
  return -1;
}

inline std::optional<libtorrent::sha1_hash> sha1_from_hex(std::string_view value) {
  constexpr auto expected = kSha1Bytes * 2;
  if (value.size() != expected) {
    return std::nullopt;
  }
  libtorrent::sha1_hash result;
  for (int i = 0; i < kSha1Bytes; ++i) {
    int high = hex_digit_value(value[2 * i]);
    int low = hex_digit_value(value[2 * i + 1]);
    if (high < 0 || low < 0) {
      return std::nullopt;
    }
    result[i] = static_cast<std::uint8_t>((high << 4) | low);
  }
  return result;
}

inline std::string info_hash_to_hex(libtorrent::sha1_hash const &hash) {
  constexpr char kHexDigits[] = "0123456789abcdef";
  std::string result;
  result.reserve(kSha1Bytes * 2);
  for (int i = 0; i < kSha1Bytes; ++i) {
    auto byte = static_cast<unsigned char>(hash[i]);
    result.push_back(kHexDigits[byte >> 4]);
    result.push_back(kHexDigits[byte & 0x0F]);
  }
  return result;
}

inline std::string info_hash_to_hex(libtorrent::info_hash_t const &info) {
  return info_hash_to_hex(info.get_best());
}

inline bool hash_is_nonzero(libtorrent::sha1_hash const &hash) {
  auto const *bytes = reinterpret_cast<unsigned char const *>(hash.data());
  for (int i = 0; i < kSha1Bytes; ++i) {
    if (bytes[i] != 0) {
      return true;
    }
  }
  return false;
}

inline std::optional<std::string> info_hash_from_params(
    libtorrent::add_torrent_params const &params) {
  auto best = params.info_hashes.get_best();
  if (hash_is_nonzero(best)) {
    return info_hash_to_hex(best);
  }
  if (params.ti) {
    auto const alt = params.ti->info_hashes().get_best();
    if (hash_is_nonzero(alt)) {
      return info_hash_to_hex(alt);
    }
  }
  return std::nullopt;
}

inline std::optional<std::string> hash_from_handle(libtorrent::torrent_handle const &handle) {
  if (!handle.is_valid()) {
    return std::nullopt;
  }
  auto const status = handle.status();
  auto const best = status.info_hashes.get_best();
  if (!hash_is_nonzero(best)) {
    return std::nullopt;
  }
  return info_hash_to_hex(best);
}

inline int kbps_to_bytes(int limit_kbps, bool enabled) {
  if (!enabled || limit_kbps <= 0) {
    return 0;
  }
  std::int64_t bytes = static_cast<std::int64_t>(limit_kbps) * 1024;
  if (bytes > std::numeric_limits<int>::max()) {
    bytes = std::numeric_limits<int>::max();
  }
  return static_cast<int>(bytes);
}

} // namespace tt::engine

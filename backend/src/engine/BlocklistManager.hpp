#pragma once

#include <chrono>
#include <cstddef>
#include <filesystem>
#include <optional>

#include <libtorrent/ip_filter.hpp>

namespace tt::engine {

class BlocklistManager {
public:
  struct Result {
    libtorrent::ip_filter filter;
    std::size_t entries = 0;
    std::chrono::system_clock::time_point timestamp =
        std::chrono::system_clock::now();
  };

  BlocklistManager() = default;
  explicit BlocklistManager(std::filesystem::path path);

  void set_path(std::filesystem::path path);
  std::filesystem::path const &path() const noexcept;

  std::optional<Result> reload() const;

private:
  std::filesystem::path path_;
};

} // namespace tt::engine

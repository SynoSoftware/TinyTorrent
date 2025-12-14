#include "engine/Core.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/bdecode.hpp>
#include <libtorrent/alert.hpp>
#include <libtorrent/alert_types.hpp>
#include <libtorrent/error_code.hpp>
#include <libtorrent/file_storage.hpp>
#include <libtorrent/magnet_uri.hpp>
#include <libtorrent/hex.hpp>
#include <libtorrent/address.hpp>
#include <libtorrent/announce_entry.hpp>
#include <libtorrent/peer_info.hpp>
#include <libtorrent/session.hpp>
#include <libtorrent/session_handle.hpp>
#include <libtorrent/session_params.hpp>
#include <libtorrent/kademlia/dht_state.hpp>
#include <boost/asio/ip/network_v4.hpp>
#include <boost/asio/ip/network_v6.hpp>
#include <libtorrent/settings_pack.hpp>
#include <libtorrent/torrent_flags.hpp>
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/torrent_info.hpp>
#include <libtorrent/torrent_status.hpp>
#include <libtorrent/sha1_hash.hpp>
#include <libtorrent/span.hpp>
#include <libtorrent/download_priority.hpp>
#include <libtorrent/storage_defs.hpp>
#include <libtorrent/units.hpp>
#include <libtorrent/time.hpp>
#include <libtorrent/write_resume_data.hpp>

#include "utils/Log.hpp"
#include "utils/Base64.hpp"
#include "utils/FS.hpp"
#include "utils/Endpoint.hpp"
#include "utils/StateStore.hpp"

#include <ctime>
#include <exception>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <format>
#include <functional>
#include <future>
#include <limits>
#include <memory>
#include <optional>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <thread>
#include <type_traits>
#include <iterator>
#include <fstream>
#include <system_error>
#include <unordered_map>
#include <unordered_set>
#include <utility>

namespace tt::engine {

namespace {

constexpr char const *kUserAgent = "TinyTorrent/0.1.0";
constexpr auto kHousekeepingInterval = std::chrono::seconds(2);
constexpr auto kResumeAlertTimeout = std::chrono::seconds(5);
constexpr auto kStateFlushInterval = std::chrono::seconds(5);
constexpr auto kShutdownTimeout = std::chrono::seconds(10);
constexpr std::uintmax_t kMaxWatchFileSize = 64ull * 1024 * 1024;
constexpr auto kWatchFileStabilityThreshold = std::chrono::seconds(3);
constexpr int kMinHistoryIntervalSeconds = 60;
constexpr auto kHistoryRetentionCheckInterval = std::chrono::hours(1);
constexpr auto kSettingsPersistInterval = std::chrono::milliseconds(500);

constexpr int kSha1Bytes = static_cast<int>(libtorrent::sha1_hash::size());

struct SessionTotals {
  std::uint64_t uploaded = 0;
  std::uint64_t downloaded = 0;
};

std::int64_t align_to_history_interval(std::chrono::system_clock::time_point now,
                                       int interval_seconds) {
  auto seconds = static_cast<std::int64_t>(
      std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count());
  if (interval_seconds <= 0) {
    return seconds;
  }
  return (seconds / interval_seconds) * interval_seconds;
}

std::string info_hash_to_hex(libtorrent::sha1_hash const &hash) {
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

std::string info_hash_to_hex(libtorrent::info_hash_t const &info) {
  return info_hash_to_hex(info.get_best());
}

int hex_digit_value(char ch) {
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

std::optional<libtorrent::sha1_hash> sha1_from_hex(std::string_view value) {
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

std::int64_t estimate_eta(libtorrent::torrent_status const &status) {
  if (status.download_rate <= 0) {
    return -1;
  }
  auto remaining = status.total_wanted - status.total_wanted_done;
  if (remaining <= 0) {
    return 0;
  }
  return (remaining + static_cast<std::int64_t>(status.download_rate) - 1) /
         static_cast<std::int64_t>(status.download_rate);
}

std::string to_state_string(libtorrent::torrent_status::state_t state) {
  using state_t = libtorrent::torrent_status::state_t;
  switch (state) {
    case state_t::checking_files:
      return "checking-files";
    case state_t::downloading_metadata:
      return "downloading-metadata";
    case state_t::downloading:
      return "downloading";
    case state_t::finished:
      return "finished";
    case state_t::seeding:
      return "seeding";
    case state_t::checking_resume_data:
      return "checking-resume-data";
    default:
      return "unknown";
  }
}

struct Sha1HashHash {
  std::size_t operator()(libtorrent::sha1_hash const &hash) const noexcept {
    constexpr auto size = libtorrent::sha1_hash::size();
    auto const *data = reinterpret_cast<unsigned char const *>(hash.data());
    std::size_t value = 0;
    for (std::size_t i = 0; i < size; ++i) {
      value = value * 1315423911u + data[i];
    }
    return value;
  }
};

std::string normalize_torrent_path(std::string_view value) {
  if (value.empty()) {
    return {};
  }
  try {
    auto path = std::filesystem::path(std::string(value));
    path = path.lexically_normal();
    return path.generic_string();
  } catch (...) {
    return {};
  }
}

std::tm to_local_time(std::time_t value) {
  std::tm result{};
#if defined(_WIN32)
  localtime_s(&result, &value);
#else
  localtime_r(&value, &result);
#endif
  return result;
}

bool alt_speed_day_matches(CoreSettings const &settings, int day) {
  int mask = settings.alt_speed_time_day;
  if (mask == 0) {
    mask = 0x7F;
  }
  return (mask & (1 << day)) != 0;
}

bool alt_speed_time_matches(CoreSettings const &settings) {
  if (!settings.alt_speed_time_enabled) {
    return false;
  }
  int begin = std::clamp(settings.alt_speed_time_begin, 0, 24 * 60 - 1);
  int end = std::clamp(settings.alt_speed_time_end, 0, 24 * 60 - 1);
  auto now = std::chrono::system_clock::now();
  auto tm = to_local_time(std::chrono::system_clock::to_time_t(now));
  int minute = tm.tm_hour * 60 + tm.tm_min;
  if (!alt_speed_day_matches(settings, tm.tm_wday)) {
    return false;
  }
  if (begin == end) {
    return true;
  }
  if (begin < end) {
    return minute >= begin && minute < end;
  }
  return minute >= begin || minute < end;
}

bool should_use_alt_speed(CoreSettings const &settings) {
  if (settings.alt_speed_enabled) {
    return true;
  }
  if (settings.alt_speed_time_enabled) {
    return alt_speed_time_matches(settings);
  }
  return false;
}

void configure_encryption(libtorrent::settings_pack &pack, EncryptionMode mode) {
  using namespace libtorrent;
  settings_pack::enc_policy policy = settings_pack::enc_policy::pe_enabled;
  settings_pack::enc_level level = settings_pack::enc_level::pe_both;
  bool prefer_rc4 = false;
  switch (mode) {
    case EncryptionMode::Preferred:
      prefer_rc4 = true;
      break;
    case EncryptionMode::Required:
      policy = settings_pack::enc_policy::pe_forced;
      level = settings_pack::enc_level::pe_rc4;
      prefer_rc4 = true;
      break;
    case EncryptionMode::Tolerated:
    default:
      break;
  }
  pack.set_int(settings_pack::out_enc_policy, static_cast<int>(policy));
  pack.set_int(settings_pack::in_enc_policy, static_cast<int>(policy));
  pack.set_int(settings_pack::allowed_enc_level, static_cast<int>(level));
  pack.set_bool(settings_pack::prefer_rc4, prefer_rc4);
}

void configure_proxy_settings(libtorrent::settings_pack &pack,
                              CoreSettings const &settings) {
  pack.set_int(libtorrent::settings_pack::proxy_type, settings.proxy_type);
  pack.set_str(libtorrent::settings_pack::proxy_hostname,
               settings.proxy_hostname);
  pack.set_int(libtorrent::settings_pack::proxy_port, settings.proxy_port);
  pack.set_bool(libtorrent::settings_pack::proxy_peer_connections,
                settings.proxy_peer_connections);
  pack.set_bool(libtorrent::settings_pack::proxy_tracker_connections,
                settings.proxy_peer_connections);
  pack.set_bool(libtorrent::settings_pack::proxy_hostnames,
                !settings.proxy_hostname.empty());
  pack.set_str(libtorrent::settings_pack::proxy_username,
               settings.proxy_auth_enabled ? settings.proxy_username : "");
  pack.set_str(libtorrent::settings_pack::proxy_password,
               settings.proxy_auth_enabled ? settings.proxy_password : "");
}

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

bool load_blocklist(std::filesystem::path const &path,
                    libtorrent::ip_filter &filter, std::size_t &entries) {
  if (path.empty()) {
    return false;
  }
  if (!std::filesystem::exists(path)) {
    return false;
  }
  std::ifstream input(path);
  if (!input) {
    return false;
  }
  entries = 0;
  std::string line;
  while (std::getline(input, line)) {
    if (!line.empty() && line.back() == '\r') {
      line.pop_back();
    }
    if (auto range = parse_blocklist_entry(line); range) {
      filter.add_rule(range->first, range->second,
                      libtorrent::ip_filter::blocked);
      ++entries;
    }
  }
  return true;
}

int kbps_to_bytes(int limit_kbps, bool enabled) {
  if (!enabled || limit_kbps <= 0) {
    return 0;
  }
  std::int64_t bytes = static_cast<std::int64_t>(limit_kbps) * 1024;
  if (bytes > std::numeric_limits<int>::max()) {
    bytes = std::numeric_limits<int>::max();
  }
  return static_cast<int>(bytes);
}

bool hash_is_nonzero(libtorrent::sha1_hash const &hash) {
  auto const *bytes = reinterpret_cast<unsigned char const *>(hash.data());
  for (int i = 0; i < kSha1Bytes; ++i) {
    if (bytes[i] != 0) {
      return true;
    }
  }
  return false;
}

std::optional<std::string> info_hash_from_params(
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

std::optional<std::string> hash_from_handle(libtorrent::torrent_handle const &handle) {
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

} // namespace

struct TorrentLimitState {
  std::optional<double> ratio_limit;
  bool ratio_enabled = false;
  std::optional<int> ratio_mode;
  std::optional<int> idle_limit;
  bool idle_enabled = false;
  std::optional<int> idle_mode;
  libtorrent::clock_type::time_point last_activity =
      libtorrent::clock_type::now();
  bool ratio_triggered = false;
  bool idle_triggered = false;
};

struct Core::Impl {
  friend class Core;
  CoreSettings settings;
  std::unique_ptr<libtorrent::session> session;
  libtorrent::settings_pack current_settings;
  std::deque<std::function<void()>> tasks;
  mutable std::mutex task_mutex;
  std::condition_variable wake_cv;
  std::mutex wake_mutex;
  std::atomic_bool running{true};
  std::atomic<std::chrono::steady_clock::duration::rep> shutdown_start_ticks{0};
  std::atomic<std::shared_ptr<SessionSnapshot>> snapshot{std::make_shared<SessionSnapshot>()};
  std::vector<libtorrent::alert *> alert_buffer;
  std::unordered_map<int, libtorrent::sha1_hash> id_to_hash;
  std::unordered_map<libtorrent::sha1_hash, int, Sha1HashHash> hash_to_id;
  int next_id = 1;
  std::filesystem::path state_path;
  std::filesystem::path metadata_dir;
  std::filesystem::path dht_state_path;
  std::chrono::steady_clock::time_point session_start_time =
      std::chrono::steady_clock::now();
  std::uint64_t session_start_downloaded = 0;
  std::uint64_t session_start_uploaded = 0;
  std::chrono::steady_clock::time_point stats_last_update =
      std::chrono::steady_clock::now();
  std::uint64_t last_total_downloaded = 0;
  std::uint64_t last_total_uploaded = 0;
  bool state_dirty = false;
  std::chrono::steady_clock::time_point last_state_flush =
      std::chrono::steady_clock::now();
  std::unique_ptr<tt::storage::Database> database;
  std::unique_ptr<tt::storage::Database> history_database;
  std::unordered_map<std::string, tt::storage::PersistedTorrent> persisted_torrents;
  std::vector<tt::storage::PersistedTorrent> startup_entries;
  SessionStatistics persisted_stats;
  mutable std::mutex state_mutex;
  mutable std::shared_mutex settings_mutex;
  std::filesystem::path blocklist_path;
  std::size_t blocklist_entries = 0;
  std::optional<std::chrono::system_clock::time_point> blocklist_last_update;
  bool alt_speed_active = false;
  bool history_enabled = true;
  int history_interval_seconds = kMinHistoryIntervalSeconds;
  int history_retention_days = 0;
  std::unordered_map<int, TorrentLimitState> torrent_limits;
  std::unordered_map<std::string, std::vector<std::string>> torrent_labels;
  std::unordered_map<std::string, std::filesystem::path> final_paths;
  std::unordered_map<int, int> torrent_priorities;
  std::unordered_map<int, std::uint64_t> torrent_revisions;
  std::uint64_t next_torrent_revision = 1;
  std::unordered_map<int, TorrentSnapshot> snapshot_cache;
  std::unordered_map<std::string, std::filesystem::path> pending_move_paths;
  std::unordered_map<std::string, std::string> torrent_error_messages;
  struct WatchFileSnapshot {
    std::uintmax_t size = 0;
    std::filesystem::file_time_type mtime;
    std::chrono::steady_clock::time_point last_change =
        std::chrono::steady_clock::time_point::min();
  };
  struct WatchEntryInfo {
    std::filesystem::path path;
    std::uintmax_t size = 0;
    std::filesystem::file_time_type mtime;
  };
  std::unordered_map<std::filesystem::path, WatchFileSnapshot> watch_dir_snapshots;
  std::atomic_bool shutdown_requested{false};
  bool save_resume_in_progress = false;
  std::unordered_set<std::string> pending_resume_hashes;
  std::chrono::steady_clock::time_point resume_deadline =
      std::chrono::steady_clock::now();
  std::chrono::steady_clock::time_point next_housekeeping =
      std::chrono::steady_clock::now();
  std::uint64_t history_accumulator_down = 0;
  std::uint64_t history_accumulator_up = 0;
  std::int64_t history_bucket_start = 0;
  std::chrono::steady_clock::time_point history_last_flush =
      std::chrono::steady_clock::now();
  std::chrono::steady_clock::time_point next_history_retention =
      std::chrono::steady_clock::now();
  std::atomic_bool settings_dirty{false};
  std::chrono::steady_clock::time_point next_settings_persist =
      std::chrono::steady_clock::time_point::min();
  std::mutex settings_persist_mutex;
  std::string listen_error;
  std::thread history_worker_thread;
  std::mutex history_task_mutex;
  std::condition_variable history_task_cv;
  std::deque<std::function<void()>> history_tasks;
  std::atomic<bool> history_worker_running{false};
  std::atomic<bool> history_worker_exit_requested{false};
  std::thread io_worker_thread;
  std::mutex io_task_mutex;
  std::condition_variable io_task_cv;
  std::deque<std::function<void()>> io_tasks;
  std::atomic<bool> io_worker_running{false};
  std::atomic<bool> io_worker_exit_requested{false};
  bool replaying_saved_torrents = false;

  explicit Impl(CoreSettings settings) : settings(std::move(settings)) {
    std::filesystem::create_directories(this->settings.download_path);
    metadata_dir = tt::utils::data_root() / "metadata";
    std::filesystem::create_directories(metadata_dir);
    if (this->settings.watch_dir_enabled && !this->settings.watch_dir.empty()) {
      std::filesystem::create_directories(this->settings.watch_dir);
    }

    state_path = this->settings.state_path;
    if (state_path.empty()) {
      state_path = tt::utils::data_root() / "tinytorrent.db";
    }
    dht_state_path = state_path;
    dht_state_path.replace_extension(".dht");
    database = std::make_unique<tt::storage::Database>(state_path);
    if (database && database->is_valid()) {
      load_persisted_torrents_from_db();
      load_persisted_stats_from_db();
    } else {
      TT_LOG_INFO("sqlite state database unavailable; falling back to ephemeral state");
      persisted_stats.session_count = 1;
    }

    history_database = std::make_unique<tt::storage::Database>(state_path);
    if (history_database && history_database->is_valid()) {
      start_history_worker();
    }
    start_io_worker();
    alert_buffer.reserve(128);

    history_enabled = this->settings.history_enabled;
    history_interval_seconds = std::max(kMinHistoryIntervalSeconds, this->settings.history_interval_seconds);
    this->settings.history_interval_seconds = history_interval_seconds;
    history_retention_days = std::max(0, this->settings.history_retention_days);
    configure_history_window(std::chrono::system_clock::now());

    auto dht_state = load_dht_state();
    libtorrent::settings_pack pack;
    pack.set_int(libtorrent::settings_pack::alert_mask, libtorrent::alert::all_categories);
    pack.set_str(libtorrent::settings_pack::user_agent, kUserAgent);
    pack.set_str(libtorrent::settings_pack::listen_interfaces,
                 this->settings.listen_interface);
    pack.set_int(libtorrent::settings_pack::download_rate_limit,
                 kbps_to_bytes(this->settings.download_rate_limit_kbps,
                               this->settings.download_rate_limit_enabled));
    pack.set_int(libtorrent::settings_pack::upload_rate_limit,
                 kbps_to_bytes(this->settings.upload_rate_limit_kbps,
                               this->settings.upload_rate_limit_enabled));
    if (this->settings.peer_limit > 0) {
      pack.set_int(libtorrent::settings_pack::connections_limit,
                   this->settings.peer_limit);
    }
    if (this->settings.peer_limit_per_torrent > 0) {
      pack.set_int(libtorrent::settings_pack::unchoke_slots_limit,
                   this->settings.peer_limit_per_torrent);
    }

    configure_encryption(pack, this->settings.encryption);
    pack.set_bool(libtorrent::settings_pack::enable_dht,
                  this->settings.dht_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_lsd,
                  this->settings.lpd_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_incoming_utp,
                  this->settings.utp_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_outgoing_utp,
                  this->settings.utp_enabled);
    if (this->settings.download_queue_size > 0) {
      pack.set_int(libtorrent::settings_pack::active_downloads,
                   this->settings.download_queue_size);
    }
    if (this->settings.seed_queue_size > 0) {
      pack.set_int(libtorrent::settings_pack::active_seeds,
                   this->settings.seed_queue_size);
    }
    pack.set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                  this->settings.queue_stalled_enabled);

    configure_proxy_settings(pack, this->settings);

    current_settings = pack;
    blocklist_path = this->settings.blocklist_path;
    libtorrent::session_params params(pack);
    if (dht_state) {
      params.dht_state = std::move(*dht_state);
    }
    session = std::make_unique<libtorrent::session>(params);
    refresh_active_speed_limits(true);
    replay_saved_torrents();
    initialize_session_statistics();
    mark_state_dirty();
  }

  ~Impl() {
    stop_io_worker();
    stop_history_worker();
  }

  void run() {
    try {
      while (running.load(std::memory_order_relaxed)) {
        auto now = std::chrono::steady_clock::now();
        if (shutdown_requested.load(std::memory_order_relaxed) && !save_resume_in_progress) {
          persist_resume_data();
        }
        refresh_active_speed_limits();
        process_tasks();
        process_alerts();
        update_snapshot();
        perform_housekeeping();
        flush_settings_if_due(now);
        if (shutdown_requested.load(std::memory_order_relaxed)) {
          if (!save_resume_in_progress || pending_resume_hashes.empty() ||
              now >= resume_deadline) {
            running.store(false, std::memory_order_relaxed);
            continue;
          }
          auto start_ticks =
              shutdown_start_ticks.load(std::memory_order_acquire);
          if (start_ticks > 0) {
            auto start_time = std::chrono::steady_clock::time_point(
                std::chrono::steady_clock::duration(start_ticks));
            if (now - start_time >= kShutdownTimeout) {
              TT_LOG_INFO("shutdown timeout reached; forcing exit");
              running.store(false, std::memory_order_relaxed);
              continue;
            }
          }
        }
        std::unique_lock<std::mutex> lock(wake_mutex);
        wake_cv.wait_for(lock, std::chrono::milliseconds(settings.idle_sleep_ms),
                         [this] {
                           return !tasks.empty() ||
                                  shutdown_requested.load(std::memory_order_relaxed);
                         });
      }
    } catch (std::exception const &ex) {
      TT_LOG_INFO("engine loop exception: {}", ex.what());
    } catch (...) {
      TT_LOG_INFO("engine loop exception");
    }
    auto now = std::chrono::steady_clock::now();
    if (history_enabled &&
        now - history_last_flush >= std::chrono::seconds(10)) {
      flush_history_if_due(now, true);
    }
    persist_dht_state();
    persist_state();
    flush_settings_now();
  }

  void stop() noexcept {
    auto now = std::chrono::steady_clock::now();
    auto ticks = now.time_since_epoch().count();
    auto expected = std::chrono::steady_clock::duration::rep(0);
    shutdown_start_ticks.compare_exchange_strong(
        expected, ticks, std::memory_order_release, std::memory_order_relaxed);
    shutdown_requested.store(true, std::memory_order_relaxed);
    wake_cv.notify_one();
  }

  Core::AddTorrentStatus enqueue_torrent(TorrentAddRequest request) {
    libtorrent::add_torrent_params params;
    libtorrent::error_code ec;

    if (!request.metainfo.empty()) {
    libtorrent::span<char const> span(
        reinterpret_cast<char const *>(request.metainfo.data()),
        static_cast<int>(request.metainfo.size()));
    auto node = libtorrent::bdecode(span, ec);
      if (ec) {
        TT_LOG_INFO("failed to decode provided metainfo: {}", ec.message());
        return Core::AddTorrentStatus::InvalidUri;
      }

      auto ti = std::make_shared<libtorrent::torrent_info>(node, ec);
      if (ec) {
        TT_LOG_INFO("failed to parse torrent metainfo: {}", ec.message());
        return Core::AddTorrentStatus::InvalidUri;
      }
      params.ti = std::move(ti);
    } else if (request.uri) {
      libtorrent::parse_magnet_uri(*request.uri, params, ec);
      if (ec) {
        TT_LOG_INFO("failed to parse magnet link: {}", ec.message());
        return Core::AddTorrentStatus::InvalidUri;
      }
    } else {
      TT_LOG_INFO("torrent-add request missing uri/metainfo");
      return Core::AddTorrentStatus::InvalidUri;
    }

    auto save_path = request.download_path.empty() ? settings.download_path
                                                   : request.download_path;
    auto final_save_path = save_path;
    if (settings.incomplete_dir_enabled && !settings.incomplete_dir.empty()) {
      params.save_path = settings.incomplete_dir.string();
    } else {
      params.save_path = final_save_path.string();
    }
    params.flags = libtorrent::torrent_flags::auto_managed;
    if (request.paused) {
      params.flags |= libtorrent::torrent_flags::paused;
    }

    std::string info;
    if (params.ti) {
      info = params.ti->name();
    } else if (request.uri) {
      info = *request.uri;
    }
    if (info.empty()) {
      info = "<unnamed torrent>";
    }
    if (info.size() > 128) {
      info = info.substr(0, 128) + "...";
    }
    TT_LOG_INFO("enqueue_add_torrent name={} save_path={} paused={}", info,
                params.save_path, static_cast<int>(request.paused));
    if (auto hash = info_hash_from_params(params); hash) {
      register_persisted_torrent(*hash, request);
    }

    enqueue_task([this, params = std::move(params)]() mutable {
      if (session) {
        session->async_add_torrent(std::move(params));
      }
    });

    return Core::AddTorrentStatus::Ok;
  }

  std::shared_ptr<SessionSnapshot> snapshot_copy() const noexcept {
    return snapshot.load(std::memory_order_acquire);
  }

  template <typename Fn>
  auto run_task(Fn &&fn) -> std::future<std::invoke_result_t<Fn>> {
    using result_t = std::invoke_result_t<Fn>;
    auto task = std::make_shared<std::packaged_task<result_t()>>(std::forward<Fn>(fn));
    auto future = task->get_future();
    enqueue_task([task]() mutable { (*task)(); });
    return future;
  }

  std::optional<TorrentDetail> detail_for_id(int id) {
    if (!session) {
      return std::nullopt;
    }
    if (auto handle = handle_for_id(id); handle) {
      auto status = handle->status();
      return collect_detail(id, *handle, status);
    }
    return std::nullopt;
  }

  void enqueue_task(std::function<void()> task) {
    {
      std::lock_guard<std::mutex> lock(task_mutex);
      tasks.push_back(std::move(task));
    }
    wake_cv.notify_one();
  }

private:
  void process_tasks() {
    std::deque<std::function<void()>> pending;
    {
      std::lock_guard<std::mutex> lock(task_mutex);
      pending.swap(tasks);
    }

    TT_LOG_DEBUG("Processing {} pending engine commands", pending.size());

    for (auto &task : pending) {
      task();
    }
  }

  void process_alerts() {
    if (!session) {
      return;
    }
    alert_buffer.clear();
    session->pop_alerts(&alert_buffer);
    for (auto const *alert : alert_buffer) {
      if (auto *finished = libtorrent::alert_cast<libtorrent::torrent_finished_alert>(alert)) {
        handle_torrent_finished(*finished);
    } else if (auto *resume =
                   libtorrent::alert_cast<libtorrent::save_resume_data_alert>(alert)) {
      handle_save_resume_data_alert(*resume);
    } else if (auto *failed =
                   libtorrent::alert_cast<libtorrent::save_resume_data_failed_alert>(alert)) {
      handle_save_resume_data_failed_alert(*failed);
    } else if (auto *metadata =
                   libtorrent::alert_cast<libtorrent::metadata_received_alert>(alert)) {
      handle_metadata_received_alert(*metadata);
      } else if (auto *state =
                   libtorrent::alert_cast<libtorrent::state_update_alert>(alert)) {
      for (auto const &status : state->status) {
        auto id = assign_rpc_id(status.info_hashes.get_best());
        mark_torrent_dirty(id);
      }
    } else if (auto *listen =
                   libtorrent::alert_cast<libtorrent::listen_succeeded_alert>(alert)) {
      handle_listen_succeeded(*listen);
    } else if (auto *failed =
                   libtorrent::alert_cast<libtorrent::listen_failed_alert>(alert)) {
      handle_listen_failed(*failed);
    } else if (auto *file_error =
                   libtorrent::alert_cast<libtorrent::file_error_alert>(alert)) {
      handle_file_error_alert(*file_error);
    } else if (auto *tracker_error =
                   libtorrent::alert_cast<libtorrent::tracker_error_alert>(alert)) {
      handle_tracker_error_alert(*tracker_error);
    } else if (auto *portmap_failed =
                   libtorrent::alert_cast<libtorrent::portmap_error_alert>(alert)) {
      handle_portmap_error_alert(*portmap_failed);
    } else if (auto *moved =
                   libtorrent::alert_cast<libtorrent::storage_moved_alert>(alert)) {
      handle_storage_moved_alert(*moved);
    } else if (auto *storage_failed =
                   libtorrent::alert_cast<libtorrent::storage_moved_failed_alert>(alert)) {
      handle_storage_moved_failed_alert(*storage_failed);
    }
  }
}

  void handle_torrent_finished(libtorrent::torrent_finished_alert const &alert) {
    if (!session) {
      return;
    }
    auto handle = alert.handle;
    if (!handle.is_valid()) {
      return;
    }
    auto status = handle.status();
    move_completed_from_incomplete(handle, status);
    auto id = assign_rpc_id(status.info_hashes.get_best());
    mark_torrent_dirty(id);
  }

  void handle_metadata_received_alert(
      libtorrent::metadata_received_alert const &alert) {
    auto const &handle = alert.handle;
    if (!handle.is_valid()) {
      return;
    }
    auto const info = handle.info_hashes().get_best();
    if (!hash_is_nonzero(info)) {
      return;
    }
    auto hash = info_hash_to_hex(info);
    auto const *ti = handle.torrent_file().get();
    if (ti == nullptr) {
      return;
    }
    try {
      libtorrent::add_torrent_params params;
      params.ti = std::make_shared<libtorrent::torrent_info>(*ti);
      auto payload = libtorrent::write_torrent_file_buf(params,
                                                       libtorrent::write_torrent_flags_t{});
      if (payload.empty()) {
        return;
      }
      auto path = metadata_file_path(hash);
      if (path.empty()) {
        return;
      }
      std::error_code ec;
      std::filesystem::create_directories(metadata_dir, ec);
      if (ec) {
        TT_LOG_INFO("failed to ensure metadata directory {}: {}", metadata_dir.string(),
                    ec.message());
        return;
      }
      std::ofstream output(path, std::ios::binary);
      if (!output) {
        TT_LOG_INFO("failed to write metadata for {} to {}", hash, path.string());
        return;
      }
      output.write(payload.data(), static_cast<std::streamsize>(payload.size()));
      output.flush();
      if (!output) {
        TT_LOG_INFO("failed to flush metadata for {} to {}", hash, path.string());
        return;
      }
      std::vector<std::uint8_t> metadata(payload.begin(), payload.end());
      update_persisted_metadata(hash, path, metadata);
    } catch (std::system_error const &ex) {
      TT_LOG_INFO("failed to serialize metadata for {}: {}", hash, ex.what());
    }
  }

  void handle_save_resume_data_alert(libtorrent::save_resume_data_alert const &alert) {
    if (auto hash = info_hash_from_params(alert.params); hash) {
      update_persisted_resume_data(*hash, alert.params);
      mark_resume_hash_completed(*hash);
      return;
    }
    if (auto hash = hash_from_handle(alert.handle); hash) {
      mark_resume_hash_completed(*hash);
      return;
    }
    resume_deadline = std::chrono::steady_clock::now() + kResumeAlertTimeout;
  }

  void handle_save_resume_data_failed_alert(
      libtorrent::save_resume_data_failed_alert const &alert) {
    TT_LOG_INFO("save resume data failed: {}", alert.error.message());
    if (auto hash = hash_from_handle(alert.handle); hash) {
      mark_resume_hash_completed(*hash);
      return;
    }
    resume_deadline = std::chrono::steady_clock::now() + kResumeAlertTimeout;
  }

  void persist_state() {
    std::lock_guard<std::mutex> lock(state_mutex);
    persist_state_unlocked();
    state_dirty = false;
    last_state_flush = std::chrono::steady_clock::now();
  }

  void mark_state_dirty() {
    std::lock_guard<std::mutex> lock(state_mutex);
    mark_state_dirty_locked();
  }

  void mark_state_dirty_locked() {
    state_dirty = true;
  }

  void flush_state_if_due(std::chrono::steady_clock::time_point now) {
    std::lock_guard<std::mutex> lock(state_mutex);
    if (!state_dirty) {
      return;
    }
    if (now < last_state_flush + kStateFlushInterval) {
      return;
    }
    persist_state_unlocked();
    state_dirty = false;
    last_state_flush = now;
  }

  void persist_resume_data() {
    if (!session) {
      return;
    }
    auto handles = session->get_torrents();
    pending_resume_hashes.clear();
    for (auto const &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      auto status = handle.status();
      auto best = status.info_hashes.get_best();
      handle.save_resume_data();
      if (!hash_is_nonzero(best)) {
        continue;
      }
      pending_resume_hashes.insert(info_hash_to_hex(best));
    }
    save_resume_in_progress = !pending_resume_hashes.empty();
    resume_deadline = std::chrono::steady_clock::now() + kResumeAlertTimeout;
  }

  void mark_resume_hash_completed(std::string const &hash) {
    if (!hash.empty()) {
      pending_resume_hashes.erase(hash);
    }
    resume_deadline = std::chrono::steady_clock::now() + kResumeAlertTimeout;
    save_resume_in_progress = !pending_resume_hashes.empty();
  }

  void persist_state_unlocked() {
    if (!database || !database->is_valid()) {
      return;
    }
    persist_stat_value("secondsActive", persisted_stats.seconds_active);
    persist_stat_value("uploadedBytes", persisted_stats.uploaded_bytes);
    persist_stat_value("downloadedBytes", persisted_stats.downloaded_bytes);
  }

  void persist_stat_value(std::string const &key, std::uint64_t value) {
    if (!database) {
      return;
    }
    database->set_setting(key, std::to_string(value));
  }

  std::uint64_t read_uint64_setting(std::string const &key) const {
    if (!database || !database->is_valid()) {
      return 0;
    }
    if (auto value = database->get_setting(key); value) {
      try {
        return static_cast<std::uint64_t>(std::stoull(*value));
      } catch (...) {
        return 0;
      }
    }
    return 0;
  }

  void load_persisted_stats_from_db() {
    persisted_stats.uploaded_bytes = read_uint64_setting("uploadedBytes");
    persisted_stats.downloaded_bytes = read_uint64_setting("downloadedBytes");
    persisted_stats.seconds_active = read_uint64_setting("secondsActive");
    persisted_stats.session_count = read_uint64_setting("sessionCount");
    ++persisted_stats.session_count;
    persist_stat_value("sessionCount", persisted_stats.session_count);
  }

  void load_persisted_torrents_from_db() {
    if (!database || !database->is_valid()) {
      return;
    }
    auto entries = database->load_torrents();
    startup_entries = std::move(entries);
    int highest_rpc_id = next_id - 1;
    for (auto const &entry : startup_entries) {
      if (entry.hash.empty()) {
        continue;
      }
      highest_rpc_id = std::max(highest_rpc_id, entry.rpc_id);
    }
    if (highest_rpc_id >= next_id) {
      next_id = highest_rpc_id + 1;
    }
  }

  std::optional<libtorrent::dht::dht_state> load_dht_state() const {
    if (dht_state_path.empty() || !std::filesystem::exists(dht_state_path)) {
      return std::nullopt;
    }
    std::ifstream input(dht_state_path, std::ios::binary);
    if (!input) {
      return std::nullopt;
    }
    std::vector<char> buffer((std::istreambuf_iterator<char>(input)),
                             std::istreambuf_iterator<char>());
    if (buffer.empty()) {
      return std::nullopt;
    }
    try {
      auto params = libtorrent::read_session_params(
          libtorrent::span<char const>(buffer.data(), buffer.size()),
          libtorrent::session_handle::save_dht_state);
      return params.dht_state;
    } catch (...) {
      TT_LOG_INFO("failed to load DHT state from {}", dht_state_path.string());
    }
    return std::nullopt;
  }

  void persist_dht_state() {
    if (!session || dht_state_path.empty()) {
      return;
    }
    auto params =
        session->session_state(libtorrent::session_handle::save_dht_state);
    auto buffer = libtorrent::write_session_params_buf(
        params, libtorrent::session_handle::save_dht_state);
    if (buffer.empty()) {
      return;
    }
    std::error_code ec;
    auto parent = dht_state_path.parent_path();
    if (!parent.empty() && !std::filesystem::exists(parent, ec)) {
      std::filesystem::create_directories(parent, ec);
    }
    if (ec) {
      TT_LOG_INFO("failed to ensure DHT state directory {}: {}",
                  parent.string(), ec.message());
      return;
    }
    std::ofstream output(dht_state_path, std::ios::binary);
    if (!output) {
      TT_LOG_INFO("failed to write DHT state to {}", dht_state_path.string());
      return;
    }
    output.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
    if (!output) {
      TT_LOG_INFO("failed to write DHT state to {}", dht_state_path.string());
    }
  }

  std::string listen_error_impl() const {
    std::shared_lock<std::shared_mutex> guard(settings_mutex);
    return listen_error;
  }

  void set_listen_error(std::string value) {
    std::lock_guard<std::shared_mutex> guard(settings_mutex);
    listen_error = std::move(value);
  }

  void handle_listen_succeeded(libtorrent::listen_succeeded_alert const &alert) {
    if (alert.socket_type != libtorrent::socket_type_t::tcp) {
      return;
    }
    auto host = alert.address.to_string();
    tt::net::HostPort host_port{host, std::to_string(alert.port)};
    host_port.bracketed = tt::net::is_ipv6_literal(host);
    auto interface = tt::net::format_host_port(host_port);
    {
      std::lock_guard<std::shared_mutex> guard(settings_mutex);
      settings.listen_interface = interface;
      listen_error.clear();
    }
    mark_settings_dirty();
    TT_LOG_INFO("listen succeeded on {}", interface);
  }

  void handle_listen_failed(libtorrent::listen_failed_alert const &alert) {
    if (alert.socket_type != libtorrent::socket_type_t::tcp) {
      return;
    }
    auto host = alert.address.to_string();
    tt::net::HostPort host_port{host, std::to_string(alert.port)};
    host_port.bracketed = tt::net::is_ipv6_literal(host);
    auto endpoint = tt::net::format_host_port(host_port);
    auto message =
        std::format("listen failed on {}: {}", endpoint, alert.message());
    set_listen_error(message);
    TT_LOG_INFO("{}", message);
  }

  void handle_file_error_alert(libtorrent::file_error_alert const &alert) {
    if (auto hash = hash_from_handle(alert.handle); hash) {
      auto message = std::format("file error: {}", alert.message());
      record_torrent_error(*hash, message);
      TT_LOG_INFO("{}: {}", hash, message);
    }
  }

  void handle_tracker_error_alert(libtorrent::tracker_error_alert const &alert) {
    if (auto hash = hash_from_handle(alert.handle); hash) {
      auto tracker = alert.tracker_url();
      auto label = tracker && *tracker ? tracker : "<unknown>";
      auto message = std::format("tracker {}: {}", label, alert.message());
      record_torrent_error(*hash, message);
      TT_LOG_INFO("{}: {}", hash, message);
    }
  }

  void handle_portmap_error_alert(libtorrent::portmap_error_alert const &alert) {
    auto message = std::format("portmap failed: {}", alert.message());
    set_listen_error(message);
    TT_LOG_INFO("{}", message);
  }

  void handle_storage_moved_alert(libtorrent::storage_moved_alert const &alert) {
    if (auto hash = hash_from_handle(alert.handle); hash) {
      auto path = alert.storage_path();
      if (path == nullptr || *path == '\0') {
        return;
      }
      finalize_pending_move(*hash, std::filesystem::path(path));
      TT_LOG_INFO("{} storage moved to {}", hash, path);
    }
  }

  void handle_storage_moved_failed_alert(
      libtorrent::storage_moved_failed_alert const &alert) {
    if (auto hash = hash_from_handle(alert.handle); hash) {
      auto message = std::format("storage move failed: {}", alert.message());
      record_torrent_error(*hash, message);
      cancel_pending_move(*hash);
      TT_LOG_INFO("{}: {}", hash, message);
    }
  }

  void update_persisted_resume_data(std::string const &hash,
                                    libtorrent::add_torrent_params const &params) {
    if (hash.empty() || !database || !database->is_valid()) {
      return;
    }
    auto buffer = libtorrent::write_resume_data_buf(params);
    if (buffer.empty()) {
      return;
    }
    std::vector<std::uint8_t> data(buffer.begin(), buffer.end());
    database->update_resume_data(hash, data);
  }

  void persist_settings_to_db() {
    if (!database || !database->is_valid()) {
      return;
    }
    CoreSettings snapshot;
    {
      std::shared_lock<std::shared_mutex> lock(settings_mutex);
      snapshot = settings;
    }
    if (!database->begin_transaction()) {
      TT_LOG_INFO("failed to begin settings transaction");
      return;
    }
    bool success = true;
    auto set_bool = [&](char const *key, bool value) {
      success = success && database->set_setting(key, value ? "1" : "0");
    };
    auto set_int = [&](char const *key, int value) {
      success = success && database->set_setting(key, std::to_string(value));
    };
    auto set_double = [&](char const *key, double value) {
      success = success && database->set_setting(key, std::to_string(value));
    };
    success = success && database->set_setting("listenInterface",
                                               snapshot.listen_interface);
    success = success && database->set_setting(
                          "downloadPath", snapshot.download_path.string());
    set_int("speedLimitDown", snapshot.download_rate_limit_kbps);
    set_bool("speedLimitDownEnabled", snapshot.download_rate_limit_enabled);
    set_int("speedLimitUp", snapshot.upload_rate_limit_kbps);
    set_bool("speedLimitUpEnabled", snapshot.upload_rate_limit_enabled);
    set_int("peerLimit", snapshot.peer_limit);
    set_int("peerLimitPerTorrent", snapshot.peer_limit_per_torrent);
    set_int("altSpeedDown", snapshot.alt_download_rate_limit_kbps);
    set_int("altSpeedUp", snapshot.alt_upload_rate_limit_kbps);
    set_bool("altSpeedEnabled", snapshot.alt_speed_enabled);
    set_bool("altSpeedTimeEnabled", snapshot.alt_speed_time_enabled);
    set_int("altSpeedTimeBegin", snapshot.alt_speed_time_begin);
    set_int("altSpeedTimeEnd", snapshot.alt_speed_time_end);
    set_int("altSpeedTimeDay", snapshot.alt_speed_time_day);
    set_int("encryption", static_cast<int>(snapshot.encryption));
    set_bool("dhtEnabled", snapshot.dht_enabled);
    set_bool("pexEnabled", snapshot.pex_enabled);
    set_bool("lpdEnabled", snapshot.lpd_enabled);
    set_bool("utpEnabled", snapshot.utp_enabled);
    set_int("downloadQueueSize", snapshot.download_queue_size);
    set_int("seedQueueSize", snapshot.seed_queue_size);
    set_bool("queueStalledEnabled", snapshot.queue_stalled_enabled);
    success = success && database->set_setting(
                          "incompleteDir",
                          snapshot.incomplete_dir.empty()
                              ? std::string{}
                              : snapshot.incomplete_dir.string());
    set_bool("incompleteDirEnabled", snapshot.incomplete_dir_enabled);
    success = success && database->set_setting(
                          "watchDir",
                          snapshot.watch_dir.empty() ? std::string{}
                                                     : snapshot.watch_dir.string());
    set_bool("watchDirEnabled", snapshot.watch_dir_enabled);
    set_double("seedRatioLimit", snapshot.seed_ratio_limit);
    set_bool("seedRatioLimited", snapshot.seed_ratio_enabled);
    set_int("seedIdleLimit", snapshot.seed_idle_limit_minutes);
    set_bool("seedIdleLimited", snapshot.seed_idle_enabled);
    set_int("proxyType", snapshot.proxy_type);
    success = success && database->set_setting("proxyHost", snapshot.proxy_hostname);
    set_int("proxyPort", snapshot.proxy_port);
    set_bool("proxyAuthEnabled", snapshot.proxy_auth_enabled);
    success = success && database->set_setting("proxyUsername",
                                               snapshot.proxy_username);
    success = success && database->set_setting("proxyPassword",
                                               snapshot.proxy_password);
    set_bool("proxyPeerConnections", snapshot.proxy_peer_connections);
    set_bool("historyEnabled", snapshot.history_enabled);
    set_int("historyInterval", snapshot.history_interval_seconds);
    set_int("historyRetentionDays", snapshot.history_retention_days);
    if (!success) {
      TT_LOG_INFO("failed to persist session settings");
      database->rollback_transaction();
      return;
    }
    if (!database->commit_transaction()) {
      TT_LOG_INFO("failed to commit session settings");
    }
  }

  void mark_settings_dirty() {
    auto now = std::chrono::steady_clock::now();
    std::lock_guard<std::mutex> guard(settings_persist_mutex);
    settings_dirty.store(true, std::memory_order_release);
    next_settings_persist = now + kSettingsPersistInterval;
  }

  void flush_settings_if_due(std::chrono::steady_clock::time_point now) {
    bool should_flush = false;
    {
      std::lock_guard<std::mutex> guard(settings_persist_mutex);
      if (!settings_dirty.load(std::memory_order_acquire)) {
        return;
      }
      if (now < next_settings_persist) {
        return;
      }
      settings_dirty.store(false, std::memory_order_release);
      next_settings_persist = std::chrono::steady_clock::time_point::min();
      should_flush = true;
    }
    if (should_flush) {
      persist_settings_to_db();
    }
  }

  void flush_settings_now() {
    bool should_flush = false;
    {
      std::lock_guard<std::mutex> guard(settings_persist_mutex);
      if (!settings_dirty.load(std::memory_order_acquire)) {
        return;
      }
      settings_dirty.store(false, std::memory_order_release);
      next_settings_persist = std::chrono::steady_clock::time_point::min();
      should_flush = true;
    }
    if (should_flush) {
      persist_settings_to_db();
    }
  }

  void record_torrent_error(std::string const &hash, std::string message) {
    if (hash.empty()) {
      return;
    }
    int dirty_id = 0;
    {
      std::lock_guard<std::mutex> guard(state_mutex);
      if (message.empty()) {
        torrent_error_messages.erase(hash);
      } else {
        torrent_error_messages[hash] = std::move(message);
      }
      if (auto sha1 = sha1_from_hex(hash); sha1) {
        auto it = hash_to_id.find(*sha1);
        if (it != hash_to_id.end()) {
          dirty_id = it->second;
        }
      }
    }
    if (dirty_id > 0) {
      mark_torrent_dirty(dirty_id);
    }
  }

  std::string torrent_error_string(std::string const &hash) const {
    if (hash.empty()) {
      return {};
    }
    std::lock_guard<std::mutex> guard(state_mutex);
    if (auto it = torrent_error_messages.find(hash); it != torrent_error_messages.end()) {
      return it->second;
    }
    return {};
  }

  void queue_pending_move(std::string const &hash, std::filesystem::path destination) {
    if (hash.empty() || destination.empty()) {
      return;
    }
    std::lock_guard<std::mutex> guard(state_mutex);
    pending_move_paths[hash] = std::move(destination);
  }

  void cancel_pending_move(std::string const &hash) {
    if (hash.empty()) {
      return;
    }
    std::lock_guard<std::mutex> guard(state_mutex);
    pending_move_paths.erase(hash);
  }

  void finalize_pending_move(std::string const &hash,
                             std::filesystem::path destination) {
    if (hash.empty() || destination.empty()) {
      return;
    }
    cancel_pending_move(hash);
    update_persisted_download_path(hash, destination);
  }

  int normalized_history_interval(int value) const {
    return std::max(kMinHistoryIntervalSeconds, value);
  }

  void configure_history_window(std::chrono::system_clock::time_point now) {
    history_bucket_start = align_to_history_interval(now, history_interval_seconds);
    history_accumulator_down = 0;
    history_accumulator_up = 0;
    history_last_flush = std::chrono::steady_clock::now();
    next_history_retention = history_last_flush;
  }

  void accumulate_history(std::chrono::steady_clock::time_point now,
                          std::uint64_t downloaded_delta,
                          std::uint64_t uploaded_delta) {
    if (!history_enabled) {
      return;
    }
    history_accumulator_down += downloaded_delta;
    history_accumulator_up += uploaded_delta;
    flush_history_if_due(now);
  }

  void flush_history_if_due(std::chrono::steady_clock::time_point now, bool force = false) {
    if (!history_enabled && !force) {
      return;
    }
    if (history_interval_seconds <= 0) {
      return;
    }
    if (!force) {
      auto next_flush = history_last_flush + std::chrono::seconds(history_interval_seconds);
      if (now < next_flush) {
        return;
      }
    }
    auto bucket_timestamp = history_bucket_start;
    auto down_bytes = history_accumulator_down;
    auto up_bytes = history_accumulator_up;
    history_accumulator_down = 0;
    history_accumulator_up = 0;
    if (bucket_timestamp <= 0) {
      bucket_timestamp = align_to_history_interval(std::chrono::system_clock::now(),
                                                  history_interval_seconds);
    }
    if (history_database && history_database->is_valid()) {
      schedule_history_task([this, bucket_timestamp, down_bytes, up_bytes]() {
        if (!history_database->insert_speed_history(bucket_timestamp, down_bytes, up_bytes)) {
          TT_LOG_INFO("failed to record history bucket {}", bucket_timestamp);
        }
      });
    }
    history_bucket_start = bucket_timestamp + history_interval_seconds;
    history_last_flush = now;
  }

  void perform_history_retention(std::chrono::steady_clock::time_point now) {
    if (history_retention_days <= 0) {
      return;
    }
    if (now < next_history_retention) {
      return;
    }
    next_history_retention = now + kHistoryRetentionCheckInterval;
    if (!history_database || !history_database->is_valid()) {
      return;
    }
    auto cutoff = static_cast<std::int64_t>(
        std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch())
            .count());
    auto retention_seconds =
        static_cast<std::int64_t>(history_retention_days) * 86400;
    cutoff -= retention_seconds;
    if (cutoff < 0) {
      cutoff = 0;
    }
    schedule_history_task([this, cutoff]() {
      if (history_database && !history_database->delete_speed_history_before(cutoff)) {
        TT_LOG_INFO("history retention delete failed");
      }
    });
  }

  template <typename Fn>
  auto schedule_history_task(Fn &&fn)
      -> std::future<std::invoke_result_t<Fn>> {
    using result_t = std::invoke_result_t<Fn>;
    auto task =
        std::make_shared<std::packaged_task<result_t()>>(std::forward<Fn>(fn));
    auto future = task->get_future();
    if (!history_worker_running.load(std::memory_order_acquire) ||
        history_worker_exit_requested.load(std::memory_order_acquire)) {
      (*task)();
      return future;
    }
    {
      std::lock_guard<std::mutex> lock(history_task_mutex);
      history_tasks.emplace_back([task]() mutable { (*task)(); });
    }
    history_task_cv.notify_one();
    return future;
  }

  void start_history_worker() {
    if (history_worker_thread.joinable()) {
      return;
    }
    history_worker_exit_requested.store(false, std::memory_order_release);
    history_worker_running.store(true, std::memory_order_release);
    history_worker_thread = std::thread([this] { history_worker_loop(); });
  }

  void stop_history_worker() {
    history_worker_exit_requested.store(true, std::memory_order_release);
    history_task_cv.notify_all();
    if (history_worker_thread.joinable()) {
      history_worker_thread.join();
    }
  }

  void history_worker_loop() {
    while (true) {
      std::function<void()> task;
      {
        std::unique_lock<std::mutex> lock(history_task_mutex);
        history_task_cv.wait(
            lock, [this] {
              return !history_tasks.empty() ||
                     history_worker_exit_requested.load(std::memory_order_acquire);
            });
        if (history_tasks.empty()) {
          if (history_worker_exit_requested.load(std::memory_order_acquire)) {
            break;
          }
          continue;
        }
        task = std::move(history_tasks.front());
        history_tasks.pop_front();
      }
      try {
        task();
      } catch (std::exception const &ex) {
        TT_LOG_INFO("history worker task exception: {}", ex.what());
      } catch (...) {
        TT_LOG_INFO("history worker task exception");
      }
    }
    history_worker_running.store(false, std::memory_order_release);
  }

  void start_io_worker() {
    if (io_worker_thread.joinable()) {
      return;
    }
    io_worker_exit_requested.store(false, std::memory_order_release);
    io_worker_running.store(true, std::memory_order_release);
    io_worker_thread = std::thread([this] { io_worker_loop(); });
  }

  void stop_io_worker() {
    io_worker_exit_requested.store(true, std::memory_order_release);
    io_task_cv.notify_all();
    if (io_worker_thread.joinable()) {
      io_worker_thread.join();
    }
  }

  void io_worker_loop() {
    while (true) {
      std::function<void()> task;
      {
        std::unique_lock<std::mutex> lock(io_task_mutex);
        io_task_cv.wait(lock, [this] {
          return !io_tasks.empty() ||
                 io_worker_exit_requested.load(std::memory_order_acquire);
        });
        if (io_tasks.empty()) {
          if (io_worker_exit_requested.load(std::memory_order_acquire)) {
            break;
          }
          continue;
        }
        task = std::move(io_tasks.front());
        io_tasks.pop_front();
      }
      try {
        task();
      } catch (std::exception const &ex) {
        TT_LOG_INFO("io worker task exception: {}", ex.what());
      } catch (...) {
        TT_LOG_INFO("io worker task exception");
      }
    }
    io_worker_running.store(false, std::memory_order_release);
  }

  void schedule_io_task(std::function<void()> task) {
    if (io_worker_exit_requested.load(std::memory_order_acquire)) {
      return;
    }
    {
      std::lock_guard<std::mutex> lock(io_task_mutex);
      io_tasks.push_back(std::move(task));
    }
    io_task_cv.notify_one();
  }

  std::vector<HistoryBucket> history_query(std::int64_t start, std::int64_t end,
                                           std::int64_t step) {
    if (!history_database || !history_database->is_valid()) {
      return {};
    }
    try {
      auto future = schedule_history_task(
          [this, start, end, step]() -> std::vector<HistoryBucket> {
            std::vector<HistoryBucket> result;
            auto entries = history_database->query_speed_history(start, end, step);
            result.reserve(entries.size());
            for (auto const &entry : entries) {
              HistoryBucket bucket;
              bucket.timestamp = entry.timestamp;
              bucket.total_down = entry.total_down;
              bucket.total_up = entry.total_up;
              bucket.peak_down = entry.peak_down;
              bucket.peak_up = entry.peak_up;
              result.push_back(bucket);
            }
            return result;
          });
      return future.get();
    } catch (...) {
      return {};
    }
  }

  bool history_clear(std::optional<std::int64_t> older_than) {
    if (!history_database || !history_database->is_valid()) {
      return false;
    }
    try {
      auto future = schedule_history_task([this, older_than]() -> bool {
        if (older_than) {
          return history_database->delete_speed_history_before(*older_than);
        }
        return history_database->delete_speed_history_all();
      });
      return future.get();
    } catch (...) {
      return false;
    }
  }

  HistoryConfig history_config_impl() const {
    HistoryConfig config;
    config.enabled = history_enabled;
    config.interval_seconds = history_interval_seconds;
    config.retention_days = history_retention_days;
    return config;
  }

  CoreSettings settings_copy() const {
    std::shared_lock<std::shared_mutex> lock(settings_mutex);
    return settings;
  }

  void initialize_session_statistics() {
    session_start_time = std::chrono::steady_clock::now();
    stats_last_update = session_start_time;
    auto totals = capture_session_totals();
    session_start_uploaded = totals.uploaded;
    session_start_downloaded = totals.downloaded;
    last_total_uploaded = totals.uploaded;
    last_total_downloaded = totals.downloaded;
  }

  SessionTotals capture_session_totals() const {
    SessionTotals totals;
    if (!session) {
      return totals;
    }
    auto handles = session->get_torrents();
    for (auto const &handle : handles) {
      auto status = handle.status();
      if (status.total_upload > 0) {
        totals.uploaded += static_cast<std::uint64_t>(status.total_upload);
      }
      if (status.total_download > 0) {
        totals.downloaded += static_cast<std::uint64_t>(status.total_download);
      }
    }
    return totals;
  }

  void accumulate_session_stats_locked(SessionTotals const &totals,
                                        std::chrono::steady_clock::time_point now) {
    if (now < stats_last_update) {
      stats_last_update = now;
    }
    auto elapsed = now - stats_last_update;
    if (elapsed.count() > 0) {
      auto seconds =
          static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::seconds>(elapsed).count());
      if (seconds > 0) {
        persisted_stats.seconds_active += seconds;
        mark_state_dirty_locked();
      }
    }
    std::uint64_t uploaded_delta =
        totals.uploaded >= last_total_uploaded ? totals.uploaded - last_total_uploaded
                                               : totals.uploaded;
    if (uploaded_delta > 0) {
      persisted_stats.uploaded_bytes += uploaded_delta;
      mark_state_dirty_locked();
    }
    std::uint64_t downloaded_delta =
        totals.downloaded >= last_total_downloaded ? totals.downloaded - last_total_downloaded
                                                   : totals.downloaded;
    if (downloaded_delta > 0) {
      persisted_stats.downloaded_bytes += downloaded_delta;
      mark_state_dirty_locked();
    }
    last_total_uploaded = totals.uploaded;
    last_total_downloaded = totals.downloaded;
    stats_last_update = now;
  }

  void perform_housekeeping() {
    auto now = std::chrono::steady_clock::now();
    if (now < next_housekeeping) {
      return;
    }
    next_housekeeping = now + kHousekeepingInterval;
    scan_watch_directory();
    flush_state_if_due(now);
    perform_history_retention(now);
  }

  void scan_watch_directory() {
    std::filesystem::path watch_dir;
    {
      std::shared_lock<std::shared_mutex> lock(settings_mutex);
      if (!settings.watch_dir_enabled || settings.watch_dir.empty()) {
        watch_dir_snapshots.clear();
        return;
      }
      watch_dir = settings.watch_dir;
    }
    schedule_io_task([this, watch_dir = std::move(watch_dir)]() mutable {
      auto entries = collect_watch_entries(watch_dir);
      enqueue_task([this, watch_dir = std::move(watch_dir), entries =
                                                std::move(entries)]() mutable {
        process_watch_entries(watch_dir, std::move(entries));
      });
    });
  }

  static std::vector<WatchEntryInfo> collect_watch_entries(
      std::filesystem::path const &watch_dir) {
    std::vector<WatchEntryInfo> result;
    if (watch_dir.empty()) {
      return result;
    }
    std::error_code ec;
    std::filesystem::create_directories(watch_dir, ec);
    if (ec) {
      TT_LOG_INFO("failed to create watch-dir {}: {}", watch_dir.string(),
                  ec.message());
      return result;
    }
    for (auto const &entry :
         std::filesystem::directory_iterator(watch_dir, ec)) {
      if (ec) {
        TT_LOG_INFO("watch-dir iteration failed: {}", ec.message());
        break;
      }
      std::error_code file_ec;
      if (!entry.is_regular_file(file_ec) || file_ec) {
        continue;
      }
      auto path = entry.path();
      if (path.extension() != ".torrent") {
        continue;
      }
      auto size = entry.file_size(file_ec);
      if (file_ec) {
        continue;
      }
      if (size > kMaxWatchFileSize) {
        TT_LOG_INFO("watch-dir skipping oversized file {} ({} bytes)",
                    path.string(), size);
        continue;
      }
      auto mtime = entry.last_write_time(file_ec);
      if (file_ec) {
        continue;
      }
      result.push_back(WatchEntryInfo{path, size, mtime});
    }
    return result;
  }

  void process_watch_entries(std::filesystem::path const &watch_dir,
                             std::vector<WatchEntryInfo> entries) {
    std::filesystem::path download_path;
    {
      std::shared_lock<std::shared_mutex> lock(settings_mutex);
      if (!settings.watch_dir_enabled || settings.watch_dir != watch_dir) {
        watch_dir_snapshots.clear();
        return;
      }
      download_path = settings.download_path;
    }
    auto now = std::chrono::steady_clock::now();
    std::unordered_set<std::filesystem::path> seen;
    seen.reserve(entries.size());
    for (auto const &entry : entries) {
      seen.insert(entry.path);
      auto it = watch_dir_snapshots.find(entry.path);
      if (it == watch_dir_snapshots.end()) {
        watch_dir_snapshots.emplace(
            entry.path,
            WatchFileSnapshot{entry.size, entry.mtime, now});
        continue;
      }
      auto &snapshot = it->second;
      if (snapshot.size != entry.size || snapshot.mtime != entry.mtime) {
        snapshot.size = entry.size;
        snapshot.mtime = entry.mtime;
        snapshot.last_change = now;
        continue;
      }
      if (now - snapshot.last_change < kWatchFileStabilityThreshold) {
        continue;
      }
      std::ifstream input(entry.path, std::ios::binary);
      if (!input) {
        mark_watch_file(entry.path, ".invalid");
        continue;
      }
      std::vector<std::uint8_t> buffer(
          (std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
      if (buffer.empty()) {
        mark_watch_file(entry.path, ".invalid");
        continue;
      }
      TorrentAddRequest request;
      request.metainfo = std::move(buffer);
      request.download_path = download_path;
      auto status = enqueue_torrent(std::move(request));
      if (status == Core::AddTorrentStatus::Ok) {
        mark_watch_file(entry.path, ".added");
      } else {
        auto reason = status == Core::AddTorrentStatus::InvalidUri
                          ? "invalid torrent metadata"
                          : "failed to queue torrent";
        TT_LOG_INFO("watch-dir enqueue failed for {}: {}", entry.path.string(),
                    reason);
        mark_watch_file(entry.path, ".invalid");
      }
    }
    for (auto it = watch_dir_snapshots.begin(); it != watch_dir_snapshots.end();) {
      if (seen.contains(it->first)) {
        ++it;
        continue;
      }
      it = watch_dir_snapshots.erase(it);
    }
  }

  void mark_watch_file(std::filesystem::path const &source,
                       char const *suffix) {
    std::error_code ec;
    auto target = source;
    watch_dir_snapshots.erase(source);
    target += suffix;
    std::filesystem::remove(target, ec);
    std::filesystem::rename(source, target, ec);
    if (ec) {
      TT_LOG_INFO("failed to rename watch file {}: {}", source.string(),
                  ec.message());
    }
  }

  std::filesystem::path metadata_file_path(std::string const &hash) const {
    if (hash.empty() || metadata_dir.empty()) {
      return {};
    }
    return metadata_dir / (hash + ".torrent");
  }

    void add_or_update_persisted(tt::storage::PersistedTorrent entry) {
      if (entry.hash.empty()) {
        return;
      }
      auto hash = entry.hash;
      tt::storage::PersistedTorrent sanitized = entry;
      sanitized.resume_data.clear();
      sanitized.metainfo.clear();
      sanitized.resume_data.shrink_to_fit();
      sanitized.metainfo.shrink_to_fit();
      {
        std::lock_guard<std::mutex> lock(state_mutex);
        persisted_torrents[hash] = sanitized;
        auto &stored = persisted_torrents[hash];
        if (!stored.labels.empty()) {
          torrent_labels[hash] = tt::storage::deserialize_label_list(stored.labels);
        } else {
          torrent_labels.erase(hash);
        }
        auto target_path = stored.save_path.has_value()
                               ? std::filesystem::path(*stored.save_path)
                               : settings.download_path;
        final_paths[hash] = target_path;
        if (stored.rpc_id > 0) {
          if (auto sha1 = sha1_from_hex(hash); sha1) {
            hash_to_id[*sha1] = stored.rpc_id;
            id_to_hash[stored.rpc_id] = *sha1;
          }
        }
      }
      if (!replaying_saved_torrents && database && database->is_valid()) {
        database->upsert_torrent(entry);
      }
    }

    void update_persisted_download_path(std::string const &hash,
                                        std::filesystem::path const &path) {
      if (hash.empty() || path.empty()) {
        return;
      }
      std::string normalized = path.string();
      {
        std::lock_guard<std::mutex> lock(state_mutex);
        auto it = persisted_torrents.find(hash);
        if (it == persisted_torrents.end()) {
          return;
        }
        it->second.save_path = normalized;
        final_paths[hash] = std::filesystem::path(normalized);
      }
      if (database && database->is_valid()) {
        database->update_save_path(hash, normalized);
      }
    }

  void remove_persisted_torrent(std::string const &hash) {
    if (hash.empty()) {
      return;
    }
    bool removed_label = false;
    {
      std::lock_guard<std::mutex> lock(state_mutex);
      persisted_torrents.erase(hash);
      removed_label = torrent_labels.erase(hash) > 0;
      torrent_error_messages.erase(hash);
      pending_move_paths.erase(hash);
    }
    if (database && database->is_valid()) {
      database->delete_torrent(hash);
    }
    final_paths.erase(hash);
    if (auto metadata_path = metadata_file_path(hash); !metadata_path.empty()) {
      std::error_code ec;
      std::filesystem::remove(metadata_path, ec);
      if (ec) {
        TT_LOG_INFO("failed to remove metadata {}: {}", metadata_path.string(),
                    ec.message());
      }
    }
  }

    void update_persisted_rpc_id(std::string const &hash, int id) {
      if (hash.empty() || id <= 0) {
        return;
      }
      int previous_id = 0;
      {
        std::lock_guard<std::mutex> lock(state_mutex);
        auto it = persisted_torrents.find(hash);
        if (it == persisted_torrents.end()) {
          return;
        }
        if (it->second.rpc_id == id) {
          return;
        }
        previous_id = it->second.rpc_id;
        it->second.rpc_id = id;
        if (auto sha1 = sha1_from_hex(hash); sha1) {
          hash_to_id[*sha1] = id;
          id_to_hash[id] = *sha1;
          if (previous_id > 0) {
            id_to_hash.erase(previous_id);
          }
        }
      }
      if (database && database->is_valid()) {
        database->update_rpc_id(hash, id);
      }
    }

    void update_persisted_metadata(std::string const &hash,
                                   std::filesystem::path const &path,
                                   std::vector<std::uint8_t> const &metadata) {
      if (hash.empty() || path.empty()) {
        return;
      }
      auto normalized = path.string();
      {
        std::lock_guard<std::mutex> lock(state_mutex);
        auto it = persisted_torrents.find(hash);
        if (it == persisted_torrents.end()) {
          return;
        }
        it->second.metadata_path = normalized;
      }
      if (database && database->is_valid()) {
        database->update_metadata(hash, normalized, metadata);
      }
    }

    void register_persisted_torrent(std::string const &hash,
                                    TorrentAddRequest const &request) {
      if (hash.empty()) {
        return;
      }
      tt::storage::PersistedTorrent entry;
      entry.hash = hash;
      entry.save_path = request.download_path.string();
      entry.paused = request.paused;
      if (request.uri) {
        entry.magnet_uri = *request.uri;
      }
      entry.metainfo = request.metainfo;
      entry.resume_data = request.resume_data;
      entry.added_at = static_cast<std::uint64_t>(
          std::chrono::duration_cast<std::chrono::seconds>(
              std::chrono::system_clock::now().time_since_epoch())
              .count());
      add_or_update_persisted(std::move(entry));
    }

  void replay_saved_torrents() {
    if (startup_entries.empty()) {
      return;
    }
    replaying_saved_torrents = true;
    std::vector<TorrentAddRequest> pending;
    pending.reserve(startup_entries.size());
    std::vector<tt::storage::PersistedTorrent> sanitized_entries;
    sanitized_entries.reserve(startup_entries.size());
    for (auto &entry : startup_entries) {
      if (entry.hash.empty()) {
        continue;
      }
      TorrentAddRequest request;
      request.download_path =
          entry.save_path.has_value()
              ? std::filesystem::path(*entry.save_path)
              : settings.download_path;
      request.paused = entry.paused;
      bool has_metadata = false;
      if (!entry.metainfo.empty()) {
        request.metainfo = entry.metainfo;
        has_metadata = true;
      } else if (!entry.metadata_path.empty()) {
        std::ifstream input(entry.metadata_path, std::ios::binary);
        if (input) {
          std::vector<std::uint8_t> buffer(
              (std::istreambuf_iterator<char>(input)),
              std::istreambuf_iterator<char>());
          if (!buffer.empty()) {
            request.metainfo = std::move(buffer);
            has_metadata = true;
          } else {
            TT_LOG_INFO("metadata file {} for {} is empty", entry.metadata_path,
                        entry.hash);
          }
        } else {
          TT_LOG_INFO("failed to read metadata file {} for {}", entry.metadata_path,
                      entry.hash);
        }
      }
      if (!has_metadata && entry.magnet_uri.has_value()) {
        request.uri = *entry.magnet_uri;
        has_metadata = true;
      }
      bool queued = true;
      if (!has_metadata) {
        queued = false;
      } else {
        if (!entry.resume_data.empty()) {
          request.resume_data = entry.resume_data;
        }
        pending.push_back(std::move(request));
      }
      entry.resume_data.clear();
      entry.metainfo.clear();
      entry.resume_data.shrink_to_fit();
      entry.metainfo.shrink_to_fit();
      sanitized_entries.push_back(std::move(entry));
      if (!queued) {
        continue;
      }
    }
    startup_entries.clear();
    if (!sanitized_entries.empty()) {
      std::lock_guard<std::mutex> lock(state_mutex);
      for (auto &entry : sanitized_entries) {
        if (entry.hash.empty()) {
          continue;
        }
        auto &stored = persisted_torrents[entry.hash];
        stored = std::move(entry);
        if (!stored.labels.empty()) {
          torrent_labels[stored.hash] =
              tt::storage::deserialize_label_list(stored.labels);
        } else {
          torrent_labels.erase(stored.hash);
        }
        auto target_path = stored.save_path.has_value()
                               ? std::filesystem::path(*stored.save_path)
                               : settings.download_path;
        final_paths[stored.hash] = target_path;
        if (stored.rpc_id > 0) {
          if (auto hash = sha1_from_hex(stored.hash); hash) {
            if (!hash_to_id.contains(*hash)) {
              hash_to_id.emplace(*hash, stored.rpc_id);
              id_to_hash.emplace(stored.rpc_id, *hash);
            }
          }
        }
      }
    }
    for (auto &request : pending) {
      enqueue_torrent(std::move(request));
    }
    replaying_saved_torrents = false;
  }

  void update_snapshot() {
    if (!session) {
      return;
    }

    auto handles = session->get_torrents();
    auto new_snapshot = std::make_shared<SessionSnapshot>();
    auto totals = capture_session_totals();
    auto now = std::chrono::steady_clock::now();
    std::uint64_t downloaded_delta =
        totals.downloaded >= last_total_downloaded ? totals.downloaded - last_total_downloaded
                                                   : totals.downloaded;
    std::uint64_t uploaded_delta =
        totals.uploaded >= last_total_uploaded ? totals.uploaded - last_total_uploaded
                                               : totals.uploaded;
    accumulate_history(now, downloaded_delta, uploaded_delta);
    SessionStatistics cumulative_stats{};
    {
      std::lock_guard<std::mutex> lock(state_mutex);
      accumulate_session_stats_locked(totals, now);
      cumulative_stats = persisted_stats;
    }
    std::uint64_t elapsed_seconds = 0;
    if (now >= session_start_time) {
      elapsed_seconds = static_cast<std::uint64_t>(
          std::chrono::duration_cast<std::chrono::seconds>(now - session_start_time).count());
    }
    SessionStatistics current_stats{};
    current_stats.uploaded_bytes =
        totals.uploaded >= session_start_uploaded
            ? totals.uploaded - session_start_uploaded
            : totals.uploaded;
    current_stats.downloaded_bytes =
        totals.downloaded >= session_start_downloaded
            ? totals.downloaded - session_start_downloaded
            : totals.downloaded;
    current_stats.seconds_active = elapsed_seconds;
    current_stats.session_count = 1;
    new_snapshot->cumulative_stats = cumulative_stats;
    new_snapshot->current_stats = current_stats;
    new_snapshot->torrents.reserve(handles.size());
    new_snapshot->torrent_count = handles.size();
    std::uint64_t total_download_rate = 0;
    std::uint64_t total_upload_rate = 0;
    std::size_t paused_count = 0;
    std::unordered_set<int> seen_ids;
    std::unordered_map<int, TorrentSnapshot> updated_cache;

    for (auto const &handle : handles) {
      auto status = handle.status();
      auto const hash = info_hash_to_hex(status.info_hashes);
      auto id = assign_rpc_id(status.info_hashes.get_best());
      seen_ids.insert(id);
      enforce_torrent_seed_limits(id, handle, status);
      move_completed_from_incomplete(handle, status);
      std::uint64_t revision = ensure_torrent_revision(id);
      TorrentSnapshot entry;
      auto cache_it = snapshot_cache.find(id);
      if (cache_it != snapshot_cache.end() &&
          cache_it->second.revision == revision) {
        entry = cache_it->second;
      } else {
        entry = build_snapshot(id, status, revision);
      }
      if (auto labels_it = torrent_labels.find(hash);
          labels_it != torrent_labels.end()) {
        entry.labels = labels_it->second;
      } else {
        entry.labels.clear();
      }
      if (auto prio_it = torrent_priorities.find(id);
          prio_it != torrent_priorities.end()) {
        entry.bandwidth_priority = prio_it->second;
      } else {
        entry.bandwidth_priority = 0;
      }
      updated_cache[id] = entry;
      new_snapshot->torrents.push_back(entry);

      const auto download_payload = status.download_payload_rate > 0 ? status.download_payload_rate : 0;
      const auto upload_payload = status.upload_payload_rate > 0 ? status.upload_payload_rate : 0;
      total_download_rate += static_cast<std::uint64_t>(download_payload);
      total_upload_rate += static_cast<std::uint64_t>(upload_payload);
      if (static_cast<bool>(status.flags & libtorrent::torrent_flags::paused)) {
        ++paused_count;
      }
    }

    for (auto it = id_to_hash.begin(); it != id_to_hash.end();) {
      if (seen_ids.find(it->first) == seen_ids.end()) {
        hash_to_id.erase(it->second);
        torrent_revisions.erase(it->first);
        it = id_to_hash.erase(it);
      } else {
        ++it;
      }
    }

    for (auto it = torrent_limits.begin(); it != torrent_limits.end();) {
      if (!seen_ids.contains(it->first)) {
        it = torrent_limits.erase(it);
      } else {
        ++it;
      }
    }
    for (auto it = torrent_priorities.begin(); it != torrent_priorities.end();) {
      if (!seen_ids.contains(it->first)) {
        it = torrent_priorities.erase(it);
      } else {
        ++it;
      }
    }

    new_snapshot->paused_torrent_count = paused_count;
    new_snapshot->active_torrent_count =
        new_snapshot->torrent_count > paused_count ? new_snapshot->torrent_count - paused_count : 0;
    new_snapshot->download_rate = total_download_rate;
    new_snapshot->upload_rate = total_upload_rate;
    new_snapshot->dht_nodes = 0;

    snapshot_cache = std::move(updated_cache);

    TT_LOG_DEBUG(
        "Snapshot updated: {} torrents ({} active, {} paused) down={} up={}",
        new_snapshot->torrent_count, new_snapshot->active_torrent_count,
        new_snapshot->paused_torrent_count,
        static_cast<unsigned long long>(new_snapshot->download_rate),
        static_cast<unsigned long long>(new_snapshot->upload_rate));

    snapshot.store(new_snapshot, std::memory_order_release);
  }

  int assign_rpc_id(libtorrent::sha1_hash const &hash) {
    auto it = hash_to_id.find(hash);
    if (it != hash_to_id.end()) {
      return it->second;
    }
    int id = next_id++;
    hash_to_id.emplace(hash, id);
    id_to_hash.emplace(id, hash);
    update_persisted_rpc_id(info_hash_to_hex(hash), id);
    return id;
  }

  void mark_torrent_dirty(int id) {
    if (id <= 0) {
      return;
    }
    torrent_revisions[id] = next_torrent_revision++;
  }

  std::uint64_t ensure_torrent_revision(int id) {
    if (id <= 0) {
      return 0;
    }
    auto it = torrent_revisions.find(id);
    if (it == torrent_revisions.end()) {
      auto [new_it, inserted] =
          torrent_revisions.emplace(id, next_torrent_revision++);
      return new_it->second;
    }
    return it->second;
  }

  std::optional<libtorrent::torrent_handle> handle_for_id(int id) {
    auto it = id_to_hash.find(id);
    if (it == id_to_hash.end() || !session) {
      return std::nullopt;
    }
    auto handle = session->find_torrent(it->second);
    if (!handle.is_valid()) {
      return std::nullopt;
    }
    return handle;
  }

  std::vector<libtorrent::torrent_handle> resolve_handles(std::vector<int> const &ids) {
    std::vector<libtorrent::torrent_handle> result;
    for (int id : ids) {
      if (auto handle = handle_for_id(id); handle) {
        result.push_back(*handle);
      }
    }
    return result;
  }

  void update_download_path(std::filesystem::path path) {
    if (path.empty()) {
      return;
    }
    std::filesystem::create_directories(path);
    {
      std::lock_guard<std::mutex> state_lock(state_mutex);
      std::lock_guard<std::shared_mutex> settings_lock(settings_mutex);
      settings.download_path = std::move(path);
    }
    mark_settings_dirty();
  }

  bool update_listen_port(std::uint16_t port) {
    if (!session) {
      return false;
    }
    auto host = std::string{"0.0.0.0"};
    auto colon = settings.listen_interface.find_last_of(':');
    if (colon != std::string::npos) {
      host = settings.listen_interface.substr(0, colon);
      if (host.empty()) {
        host = "0.0.0.0";
      }
    } else if (!settings.listen_interface.empty()) {
      host = settings.listen_interface;
    }
    std::string recorded_interface;
    {
      std::lock_guard<std::mutex> state_lock(state_mutex);
      std::lock_guard<std::shared_mutex> settings_lock(settings_mutex);
      settings.listen_interface = host + ":" + std::to_string(port);
      recorded_interface = settings.listen_interface;
    }
    TT_LOG_INFO("recorded listen interface {} for peer-port {}",
                recorded_interface, static_cast<unsigned>(port));
    mark_settings_dirty();
    return true;
  }

  void apply_speed_limits(std::optional<int> download_kbps,
                          std::optional<bool> download_enabled,
                          std::optional<int> upload_kbps,
                          std::optional<bool> upload_enabled) {
    CoreSettings snapshot_settings;
    {
      std::shared_lock<std::shared_mutex> shared_lock(settings_mutex);
      snapshot_settings = settings;
    }
    auto download_enabled_flag =
        download_enabled.value_or(snapshot_settings.download_rate_limit_enabled);
    auto upload_enabled_flag =
        upload_enabled.value_or(snapshot_settings.upload_rate_limit_enabled);
    auto download_value =
        download_kbps.value_or(snapshot_settings.download_rate_limit_kbps);
    auto upload_value = upload_kbps.value_or(snapshot_settings.upload_rate_limit_kbps);

    {
      std::lock_guard<std::shared_mutex> settings_lock(settings_mutex);
      settings.download_rate_limit_enabled = download_enabled_flag;
      settings.upload_rate_limit_enabled = upload_enabled_flag;
      settings.download_rate_limit_kbps = download_value;
      settings.upload_rate_limit_kbps = upload_value;
    }

    refresh_active_speed_limits(true);
    mark_settings_dirty();
  }

  void refresh_active_speed_limits(bool force = false) {
    if (!session) {
      return;
    }
    CoreSettings snapshot = settings_copy();
    bool active = should_use_alt_speed(snapshot);
    if (!force && active == alt_speed_active) {
      return;
    }
    alt_speed_active = active;
    int download_value = active ? snapshot.alt_download_rate_limit_kbps
                                : snapshot.download_rate_limit_kbps;
    bool download_enabled = active ? true : snapshot.download_rate_limit_enabled;
    int upload_value = active ? snapshot.alt_upload_rate_limit_kbps
                              : snapshot.upload_rate_limit_kbps;
    bool upload_enabled = active ? true : snapshot.upload_rate_limit_enabled;
    apply_rate_limits(download_value, download_enabled, upload_value, upload_enabled);
  }

  void apply_rate_limits(int download_kbps, bool download_enabled,
                         int upload_kbps, bool upload_enabled) {
    libtorrent::settings_pack pack;
    int download_bytes = kbps_to_bytes(download_kbps, download_enabled);
    int upload_bytes = kbps_to_bytes(upload_kbps, upload_enabled);
    pack.set_int(libtorrent::settings_pack::download_rate_limit, download_bytes);
    pack.set_int(libtorrent::settings_pack::upload_rate_limit, upload_bytes);
    current_settings.set_int(libtorrent::settings_pack::download_rate_limit, download_bytes);
    current_settings.set_int(libtorrent::settings_pack::upload_rate_limit, upload_bytes);
    if (session) {
      session->apply_settings(pack);
    }
  }

  void apply_peer_limits(std::optional<int> global_limit,
                         std::optional<int> per_torrent_limit) {
    int updated_global = -1;
    int updated_per_torrent = -1;
    bool updated = false;
    {
      std::lock_guard<std::shared_mutex> lock(settings_mutex);
      if (global_limit) {
        int limit = std::max(0, *global_limit);
        settings.peer_limit = limit;
        updated_global = limit;
        updated = true;
      }
      if (per_torrent_limit) {
        int limit = std::max(0, *per_torrent_limit);
        settings.peer_limit_per_torrent = limit;
        updated_per_torrent = limit;
        updated = true;
      }
    }
    if (!updated) {
      return;
    }
    libtorrent::settings_pack pack;
    if (updated_global >= 0) {
      pack.set_int(libtorrent::settings_pack::connections_limit, updated_global);
      current_settings.set_int(libtorrent::settings_pack::connections_limit,
                               updated_global);
    }
    if (updated_per_torrent >= 0) {
      pack.set_int(libtorrent::settings_pack::unchoke_slots_limit,
                   updated_per_torrent);
      current_settings.set_int(libtorrent::settings_pack::unchoke_slots_limit,
                               updated_per_torrent);
    }
    if (session) {
      session->apply_settings(pack);
    }
    mark_settings_dirty();
  }

  void apply_session_update(SessionUpdate update) {
    bool persist = false;
    bool encryption_changed = false;
    bool network_changed = false;
    bool queue_changed = false;
    bool alt_changed = false;
    bool proxy_changed = false;
    bool pex_changed = false;
    bool flush_history_after = false;
    bool configure_history_after = false;

    {
      std::lock_guard<std::shared_mutex> settings_lock(settings_mutex);
      if (update.alt_speed_down_kbps) {
        settings.alt_download_rate_limit_kbps = *update.alt_speed_down_kbps;
        alt_changed = true;
        persist = true;
      }
      if (update.alt_speed_up_kbps) {
        settings.alt_upload_rate_limit_kbps = *update.alt_speed_up_kbps;
        alt_changed = true;
        persist = true;
      }
      if (update.alt_speed_enabled) {
        settings.alt_speed_enabled = *update.alt_speed_enabled;
        alt_changed = true;
        persist = true;
      }
      if (update.alt_speed_time_enabled) {
        settings.alt_speed_time_enabled = *update.alt_speed_time_enabled;
        alt_changed = true;
        persist = true;
      }
      if (update.alt_speed_time_begin) {
        settings.alt_speed_time_begin = *update.alt_speed_time_begin;
        alt_changed = true;
        persist = true;
      }
      if (update.alt_speed_time_end) {
        settings.alt_speed_time_end = *update.alt_speed_time_end;
        alt_changed = true;
        persist = true;
      }
      if (update.alt_speed_time_day) {
        settings.alt_speed_time_day = *update.alt_speed_time_day;
        alt_changed = true;
        persist = true;
      }
      if (update.encryption) {
        settings.encryption = *update.encryption;
        encryption_changed = true;
        persist = true;
      }
      if (update.dht_enabled) {
        settings.dht_enabled = *update.dht_enabled;
        network_changed = true;
        persist = true;
      }
      if (update.lpd_enabled) {
        settings.lpd_enabled = *update.lpd_enabled;
        network_changed = true;
        persist = true;
      }
      if (update.utp_enabled) {
        settings.utp_enabled = *update.utp_enabled;
        network_changed = true;
        persist = true;
      }
      if (update.pex_enabled) {
        settings.pex_enabled = *update.pex_enabled;
        pex_changed = true;
        persist = true;
      }
      if (update.download_queue_size) {
        settings.download_queue_size = *update.download_queue_size;
        queue_changed = true;
        persist = true;
      }
      if (update.seed_queue_size) {
        settings.seed_queue_size = *update.seed_queue_size;
        queue_changed = true;
        persist = true;
      }
      if (update.queue_stalled_enabled) {
        settings.queue_stalled_enabled = *update.queue_stalled_enabled;
        queue_changed = true;
        persist = true;
      }
      if (update.incomplete_dir) {
        settings.incomplete_dir = *update.incomplete_dir;
        persist = true;
      }
      if (update.incomplete_dir_enabled) {
        settings.incomplete_dir_enabled = *update.incomplete_dir_enabled;
        persist = true;
      }
      if (update.watch_dir) {
        settings.watch_dir = *update.watch_dir;
        persist = true;
        if (settings.watch_dir_enabled && !settings.watch_dir.empty()) {
          std::filesystem::create_directories(settings.watch_dir);
        }
      }
      if (update.watch_dir_enabled) {
        settings.watch_dir_enabled = *update.watch_dir_enabled;
        persist = true;
        if (settings.watch_dir_enabled && !settings.watch_dir.empty()) {
          std::filesystem::create_directories(settings.watch_dir);
        }
      }
      if (update.seed_ratio_limit) {
        settings.seed_ratio_limit = *update.seed_ratio_limit;
        persist = true;
      }
      if (update.seed_ratio_enabled) {
        settings.seed_ratio_enabled = *update.seed_ratio_enabled;
        persist = true;
      }
      if (update.seed_idle_limit) {
        settings.seed_idle_limit_minutes = *update.seed_idle_limit;
        persist = true;
      }
      if (update.seed_idle_enabled) {
        settings.seed_idle_enabled = *update.seed_idle_enabled;
        persist = true;
      }
      if (update.proxy_type) {
        settings.proxy_type = *update.proxy_type;
        proxy_changed = true;
        persist = true;
      }
      if (update.proxy_hostname) {
        settings.proxy_hostname = *update.proxy_hostname;
        proxy_changed = true;
        persist = true;
      }
      if (update.proxy_port) {
        settings.proxy_port = *update.proxy_port;
        proxy_changed = true;
        persist = true;
      }
      if (update.proxy_auth_enabled) {
        settings.proxy_auth_enabled = *update.proxy_auth_enabled;
        proxy_changed = true;
        persist = true;
      }
      if (update.proxy_username) {
        settings.proxy_username = *update.proxy_username;
        proxy_changed = true;
        persist = true;
      }
      if (update.proxy_password) {
        settings.proxy_password = *update.proxy_password;
        proxy_changed = true;
        persist = true;
      }
      if (update.proxy_peer_connections) {
        settings.proxy_peer_connections = *update.proxy_peer_connections;
        proxy_changed = true;
        persist = true;
      }
      if (update.history_enabled) {
        bool new_value = *update.history_enabled;
        if (settings.history_enabled != new_value) {
          if (!new_value) {
            flush_history_after = true;
          } else if (history_interval_seconds > 0) {
            configure_history_after = true;
          }
          settings.history_enabled = new_value;
          history_enabled = new_value;
          persist = true;
        }
      }
      if (update.history_interval_seconds) {
        int interval = normalized_history_interval(*update.history_interval_seconds);
        if (settings.history_interval_seconds != interval) {
          flush_history_after = true;
          configure_history_after = true;
          settings.history_interval_seconds = interval;
          history_interval_seconds = interval;
          persist = true;
        }
      }
      if (update.history_retention_days) {
        int retention = std::max(0, *update.history_retention_days);
        if (settings.history_retention_days != retention) {
          settings.history_retention_days = retention;
          history_retention_days = retention;
          next_history_retention = std::chrono::steady_clock::now();
          persist = true;
        }
      }
    }

    if (flush_history_after) {
      flush_history_if_due(std::chrono::steady_clock::now(), true);
    }
    if (configure_history_after) {
      configure_history_window(std::chrono::system_clock::now());
    }
    if (encryption_changed) {
      apply_encryption_settings();
    }
    if (network_changed) {
      apply_network_settings();
    }
    if (queue_changed) {
      apply_queue_settings();
    }
    if (alt_changed) {
      refresh_active_speed_limits(true);
    }
    if (proxy_changed) {
      apply_proxy_settings();
    }
    if (pex_changed) {
      apply_pex_flags();
    }
    if (persist) {
      mark_settings_dirty();
    }
  }

  void apply_encryption_settings() {
    if (!session) {
      return;
    }
    libtorrent::settings_pack pack;
    CoreSettings snapshot = settings_copy();
    configure_encryption(pack, snapshot.encryption);
    configure_encryption(current_settings, snapshot.encryption);
    session->apply_settings(pack);
  }

  void apply_network_settings() {
    if (!session) {
      return;
    }
    CoreSettings snapshot = settings_copy();
    libtorrent::settings_pack pack;
    pack.set_bool(libtorrent::settings_pack::enable_dht, snapshot.dht_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_lsd, snapshot.lpd_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_incoming_utp,
                  snapshot.utp_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_outgoing_utp,
                  snapshot.utp_enabled);
    current_settings.set_bool(libtorrent::settings_pack::enable_dht,
                              snapshot.dht_enabled);
    current_settings.set_bool(libtorrent::settings_pack::enable_lsd,
                              snapshot.lpd_enabled);
    current_settings.set_bool(libtorrent::settings_pack::enable_incoming_utp,
                              snapshot.utp_enabled);
    current_settings.set_bool(libtorrent::settings_pack::enable_outgoing_utp,
                              snapshot.utp_enabled);
    session->apply_settings(pack);
    apply_pex_flags();
  }

  void apply_proxy_settings() {
    if (!session) {
      return;
    }
    CoreSettings snapshot = settings_copy();
    libtorrent::settings_pack pack;
    pack.set_int(libtorrent::settings_pack::proxy_type, snapshot.proxy_type);
    pack.set_str(libtorrent::settings_pack::proxy_hostname,
                 snapshot.proxy_hostname);
    pack.set_int(libtorrent::settings_pack::proxy_port, snapshot.proxy_port);
    pack.set_bool(libtorrent::settings_pack::proxy_peer_connections,
                  snapshot.proxy_peer_connections);
    pack.set_bool(libtorrent::settings_pack::proxy_tracker_connections,
                  snapshot.proxy_peer_connections);
    pack.set_bool(libtorrent::settings_pack::proxy_hostnames,
                  !snapshot.proxy_hostname.empty());
    pack.set_str(libtorrent::settings_pack::proxy_username,
                 snapshot.proxy_auth_enabled ? snapshot.proxy_username : "");
    pack.set_str(libtorrent::settings_pack::proxy_password,
                 snapshot.proxy_auth_enabled ? snapshot.proxy_password : "");

    current_settings.set_int(libtorrent::settings_pack::proxy_type,
                             snapshot.proxy_type);
    current_settings.set_str(libtorrent::settings_pack::proxy_hostname,
                             snapshot.proxy_hostname);
    current_settings.set_int(libtorrent::settings_pack::proxy_port,
                             snapshot.proxy_port);
    current_settings.set_bool(libtorrent::settings_pack::proxy_peer_connections,
                              snapshot.proxy_peer_connections);
    current_settings.set_bool(libtorrent::settings_pack::proxy_tracker_connections,
                              snapshot.proxy_peer_connections);
    current_settings.set_bool(libtorrent::settings_pack::proxy_hostnames,
                              !snapshot.proxy_hostname.empty());
    current_settings.set_str(libtorrent::settings_pack::proxy_username,
                             snapshot.proxy_auth_enabled ? snapshot.proxy_username
                                                         : "");
    current_settings.set_str(libtorrent::settings_pack::proxy_password,
                             snapshot.proxy_auth_enabled ? snapshot.proxy_password
                                                         : "");

    session->apply_settings(pack);
  }

  void apply_queue_settings() {
    if (!session) {
      return;
    }
    CoreSettings snapshot = settings_copy();
    libtorrent::settings_pack pack;
    pack.set_int(libtorrent::settings_pack::active_downloads,
                 snapshot.download_queue_size);
    current_settings.set_int(libtorrent::settings_pack::active_downloads,
                             snapshot.download_queue_size);
    pack.set_int(libtorrent::settings_pack::active_seeds,
                 snapshot.seed_queue_size);
    current_settings.set_int(libtorrent::settings_pack::active_seeds,
                             snapshot.seed_queue_size);
    pack.set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                  snapshot.queue_stalled_enabled);
    current_settings.set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                              snapshot.queue_stalled_enabled);
    session->apply_settings(pack);
  }

  void apply_pex_flags() {
    if (!session) {
      return;
    }
    CoreSettings snapshot = settings_copy();
    auto handles = session->get_torrents();
    for (auto const &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      auto flag = libtorrent::torrent_flags::disable_pex;
      if (snapshot.pex_enabled) {
        handle.unset_flags(flag);
      } else {
        handle.set_flags(flag);
      }
    }
  }

  void add_torrent_trackers(std::vector<int> const &ids,
                            std::vector<TrackerEntry> const &entries) {
    if (entries.empty()) {
      return;
    }
    auto handles = resolve_handles(ids);
    for (auto &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      for (auto const &entry : entries) {
        libtorrent::announce_entry announce(entry.announce);
        announce.tier = entry.tier;
        handle.add_tracker(announce);
      }
      handle.force_reannounce();
    }
  }

  void remove_torrent_trackers(std::vector<int> const &ids,
                               std::vector<std::string> const &announces) {
    if (announces.empty()) {
      return;
    }
    std::unordered_set<std::string> to_remove;
    for (auto const &value : announces) {
      to_remove.insert(value);
    }
    auto handles = resolve_handles(ids);
    for (auto &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      auto current = handle.trackers();
      std::vector<libtorrent::announce_entry> filtered;
      filtered.reserve(current.size());
      for (auto const &entry : current) {
        if (to_remove.contains(entry.url)) {
          continue;
        }
        filtered.push_back(entry);
      }
      handle.replace_trackers(filtered);
      handle.force_reannounce();
    }
  }

  void replace_torrent_trackers(std::vector<int> const &ids,
                                std::vector<TrackerEntry> const &entries) {
    auto handles = resolve_handles(ids);
    std::vector<libtorrent::announce_entry> new_list;
    new_list.reserve(entries.size());
    for (auto const &entry : entries) {
      libtorrent::announce_entry announce(entry.announce);
      announce.tier = entry.tier;
      new_list.push_back(announce);
    }
    for (auto &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      handle.replace_trackers(new_list);
      handle.force_reannounce();
    }
  }

  void set_torrent_bandwidth_limits(
      std::vector<int> const &ids, std::optional<int> download_limit_kbps,
      std::optional<bool> download_limited,
      std::optional<int> upload_limit_kbps,
      std::optional<bool> upload_limited) {
    if (!session) {
      return;
    }
    auto handles = resolve_handles(ids);
    for (auto &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      if (download_limit_kbps || download_limited) {
        bool enabled = download_limited.value_or(download_limit_kbps.has_value());
        int limit = enabled ? download_limit_kbps.value_or(0) : 0;
        handle.set_download_limit(kbps_to_bytes(limit, enabled));
      }
      if (upload_limit_kbps || upload_limited) {
        bool enabled = upload_limited.value_or(upload_limit_kbps.has_value());
        int limit = enabled ? upload_limit_kbps.value_or(0) : 0;
        handle.set_upload_limit(kbps_to_bytes(limit, enabled));
      }
    }
  }

  void set_torrent_bandwidth_priority(std::vector<int> const &ids, int priority) {
    priority = std::clamp(priority, 0, 255);
    for (int id : ids) {
      torrent_priorities[id] = priority;
      mark_torrent_dirty(id);
    }
  }

  void set_torrent_labels(std::vector<int> const &ids,
                          std::vector<std::string> const &labels) {
    struct LabelUpdate {
      std::string hash;
      std::optional<std::vector<std::string>> value;
    };

    std::vector<LabelUpdate> updates;
    updates.reserve(ids.size());
    for (int id : ids) {
      if (auto handle = handle_for_id(id); handle) {
        auto hash = info_hash_to_hex(handle->status().info_hashes);
        if (hash.empty()) {
          continue;
        }
        if (labels.empty()) {
          updates.push_back({hash, std::nullopt});
        } else {
          updates.push_back({hash, labels});
        }
      }
    }
    if (updates.empty()) {
      return;
    }
    bool changed = false;
    std::vector<std::pair<std::string, std::string>> db_updates;
    {
      std::lock_guard<std::mutex> lock(state_mutex);
      for (auto const &update : updates) {
        auto it = persisted_torrents.find(update.hash);
        if (it == persisted_torrents.end()) {
          continue;
        }
        std::string new_payload;
        if (update.value && !update.value->empty()) {
          new_payload = tt::storage::serialize_label_list(*update.value);
        }
        if (it->second.labels == new_payload) {
          continue;
        }
        it->second.labels = new_payload;
        if (!it->second.labels.empty()) {
          torrent_labels[update.hash] =
              tt::storage::deserialize_label_list(it->second.labels);
        } else {
          torrent_labels.erase(update.hash);
        }
        db_updates.emplace_back(update.hash, it->second.labels);
        changed = true;
      }
    }
    if (database && database->is_valid()) {
      for (auto const &entry : db_updates) {
        database->update_labels(entry.first, entry.second);
      }
    }
    if (changed) {
      for (int id : ids) {
        mark_torrent_dirty(id);
      }
    }
  }

  void set_torrent_seed_limits(std::vector<int> const &ids,
                               TorrentSeedLimit const &limits) {
    auto now = libtorrent::clock_type::now();
    for (int id : ids) {
      auto &state = torrent_limits[id];
      if (limits.ratio_limit) {
        state.ratio_limit = limits.ratio_limit;
      }
      if (limits.ratio_enabled) {
        state.ratio_enabled = *limits.ratio_enabled;
        if (!state.ratio_enabled) {
          state.ratio_triggered = false;
        }
      }
      if (limits.ratio_mode) {
        state.ratio_mode = limits.ratio_mode;
      }
      if (limits.idle_limit) {
        state.idle_limit = limits.idle_limit;
      }
      if (limits.idle_enabled) {
        state.idle_enabled = *limits.idle_enabled;
        if (!state.idle_enabled) {
          state.idle_triggered = false;
        }
      }
      if (limits.idle_mode) {
        state.idle_mode = limits.idle_mode;
      }
      state.last_activity = now;
    }
  }

  void enforce_torrent_seed_limits(int id,
                                   libtorrent::torrent_handle const &handle,
                                   libtorrent::torrent_status const &status) {
    auto it = torrent_limits.find(id);
    if (it == torrent_limits.end()) {
      return;
    }
    auto &state = it->second;
    auto now = libtorrent::clock_type::now();
    bool active = status.upload_payload_rate > 0 || status.download_payload_rate > 0;
    bool idle_enabled = state.idle_enabled;
    int idle_limit = state.idle_limit.value_or(0);
    if (!idle_enabled && settings.seed_idle_enabled &&
        settings.seed_idle_limit_minutes > 0) {
      idle_enabled = true;
      idle_limit = settings.seed_idle_limit_minutes * 60;
    }
    if (active) {
      state.last_activity = now;
      state.idle_triggered = false;
    } else if (idle_enabled && idle_limit > 0 && !state.idle_triggered) {
      auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - state.last_activity);
      if (elapsed.count() >= idle_limit) {
        handle.pause();
        state.idle_triggered = true;
      }
    }
    bool ratio_enabled = state.ratio_enabled;
    double ratio_limit = state.ratio_limit.value_or(0.0);
    if (!ratio_enabled && settings.seed_ratio_enabled && settings.seed_ratio_limit > 0.0) {
      ratio_enabled = true;
      ratio_limit = settings.seed_ratio_limit;
    }
    if (ratio_enabled && ratio_limit > 0.0 && !state.ratio_triggered &&
        status.is_seeding) {
      double ratio = status.total_download > 0
                         ? static_cast<double>(status.total_upload) / status.total_download
                         : 0.0;
      if (ratio >= ratio_limit) {
        handle.pause();
        state.ratio_triggered = true;
      }
    }
  }

  void set_final_path(libtorrent::torrent_handle const &handle,
                      std::filesystem::path const &destination) {
    if (!handle.is_valid() || destination.empty()) {
      return;
    }
    auto hash = info_hash_to_hex(handle.status().info_hashes);
    if (hash.empty()) {
      return;
    }
    final_paths[hash] = destination;
  }

  void move_completed_from_incomplete(libtorrent::torrent_handle const &handle,
                                      libtorrent::torrent_status const &status) {
    if (!settings.incomplete_dir_enabled || !session) {
      return;
    }
    if (settings.download_path.empty() || settings.incomplete_dir.empty()) {
      return;
    }
    if (status.save_path != settings.incomplete_dir.string()) {
      return;
    }
    if (!status.is_seeding) {
      return;
    }
    if (settings.download_path == settings.incomplete_dir) {
      return;
    }
    auto default_path = settings.download_path;
    auto hash = info_hash_to_hex(status.info_hashes);
    if (hash.empty()) {
      return;
    }
    std::filesystem::path final_path;
    {
      std::lock_guard<std::mutex> guard(state_mutex);
      if (pending_move_paths.contains(hash)) {
        return;
      }
      auto it = final_paths.find(hash);
      final_path = it != final_paths.end() ? it->second : default_path;
    }
    if (final_path.empty() || final_path == settings.incomplete_dir) {
      return;
    }
    auto current_save = std::filesystem::path(status.save_path);
    auto candidate_name = status.name.empty() ? hash : status.name;
    auto handle_for_move = handle;
    auto source_path = status.save_path;
    schedule_io_task([this, final_path = std::move(final_path),
                      current_save = std::move(current_save),
                      candidate_name = std::move(candidate_name), hash,
                      source_path = std::move(source_path),
                      handle_for_move = std::move(handle_for_move)]() mutable {
      auto destination = determine_completion_destination(final_path, current_save,
                                                          candidate_name, hash);
      if (destination.empty()) {
        TT_LOG_INFO("move-complete skipped for {}: unable to determine safe destination",
                    hash);
        return;
      }
      if (destination == current_save) {
        return;
      }
      enqueue_task([this, handle = std::move(handle_for_move),
                    destination = std::move(destination), hash,
                    source_path = std::move(source_path)]() mutable {
        if (!handle.is_valid()) {
          return;
        }
        TT_LOG_INFO("moving {} from {} to {}", hash, source_path,
                    destination.string());
        queue_pending_move(hash, destination);
        handle.move_storage(destination.string());
      });
    });
  }

  std::filesystem::path determine_completion_destination(
      std::filesystem::path const &base, std::filesystem::path const &current,
      std::string const &name, std::string const &hash) {
    if (base.empty()) {
      return {};
    }
    std::error_code ec;
    bool base_exists = std::filesystem::exists(base, ec);
    if (ec) {
      TT_LOG_INFO("completion base unavailable {}: {}", base.string(), ec.message());
      return {};
    }
    auto candidate = base;
    if (base_exists && std::filesystem::is_directory(base, ec) && !ec) {
      auto safe_name = name.empty() ? hash : name;
      candidate /= safe_name;
    }
    return resolve_unique_completion_target(candidate, current);
  }

  std::filesystem::path resolve_unique_completion_target(
      std::filesystem::path const &target, std::filesystem::path const &current) {
    if (target.empty()) {
      return {};
    }
    if (target == current) {
      return target;
    }
    std::error_code ec;
    bool exists = std::filesystem::exists(target, ec);
    if (ec) {
      TT_LOG_INFO("failed to inspect {}: {}", target.string(), ec.message());
      return {};
    }
    if (!exists) {
      return target;
    }
    auto parent = target.parent_path();
    auto stem = target.stem().string();
    if (stem.empty()) {
      stem = target.filename().string();
    }
    auto extension = target.extension().string();
    static constexpr int kMaxCompletionAttempts = 1024;
    for (int index = 1; index <= kMaxCompletionAttempts; ++index) {
      std::string candidate_name = stem + " (" + std::to_string(index) + ")";
      if (!extension.empty()) {
        candidate_name += extension;
      }
      auto candidate = parent / candidate_name;
      std::error_code exists_ec;
      if (!std::filesystem::exists(candidate, exists_ec)) {
        if (exists_ec) {
          TT_LOG_INFO("failed to inspect {}: {}", candidate.string(), exists_ec.message());
          return {};
        }
        return candidate;
      }
    }
    TT_LOG_ERROR("unable to find unique completion destination for {} after {} attempts",
                 target.string(), kMaxCompletionAttempts);
    return {};
  }

  bool rename_path(int id, std::string const &current, std::string const &replacement) {
    if (!session) {
      return false;
    }
    if (replacement.empty() || current.empty()) {
      return false;
    }
    if (auto handle = handle_for_id(id); handle) {
      auto const *ti = handle->torrent_file().get();
      if (ti == nullptr) {
        return false;
      }
      auto const &files = ti->files();
      auto target = normalize_torrent_path(current);
      if (target.empty()) {
        return false;
      }
      for (int index = 0; index < files.num_files(); ++index) {
        libtorrent::file_index_t file_index(index);
        auto existing = normalize_torrent_path(files.file_path(file_index));
        if (existing != target) {
          continue;
        }
        std::filesystem::path base(target);
        auto parent = base.parent_path();
        std::filesystem::path new_path =
            parent.empty() ? std::filesystem::path(replacement)
                           : parent / replacement;
        handle->rename_file(file_index, new_path.generic_string());
        return true;
      }
    }
    return false;
  }

  bool schedule_blocklist_reload() {
    if (blocklist_path.empty()) {
      TT_LOG_INFO("blocklist path not configured; skipping reload");
      return false;
    }
    auto path = blocklist_path;
    schedule_io_task([this, path]() {
      libtorrent::ip_filter filter;
      std::size_t entries = 0;
      if (!load_blocklist(path, filter, entries)) {
        TT_LOG_INFO("failed to load blocklist from {}", path.string());
        return;
      }
      enqueue_task([this, filter = std::move(filter), entries, path]() mutable {
        if (session) {
          session->set_ip_filter(filter);
        }
        blocklist_entries = entries;
        blocklist_last_update = std::chrono::system_clock::now();
        TT_LOG_INFO("loaded blocklist ({} entries) from {}", entries,
                    path.string());
      });
    });
    return true;
  }

  TorrentSnapshot build_snapshot(int rpc_id, libtorrent::torrent_status const &status,
                                 std::uint64_t revision = 0) {
    TorrentSnapshot info;
    info.id = rpc_id;
    info.hash = info_hash_to_hex(status.info_hashes);
    info.name = status.name;
    info.state = to_state_string(status.state);
    info.progress = status.progress;
    info.total_wanted = status.total_wanted;
    info.total_done = status.total_wanted_done;
    info.total_size = status.total;
    info.downloaded = status.total_payload_download;
    info.uploaded = status.total_payload_upload;
    info.download_rate = status.download_payload_rate;
    info.upload_rate = status.upload_payload_rate;
    info.status = to_transmission_status(status);
    info.queue_position = static_cast<int>(status.queue_position);
    info.peers_connected = status.num_peers;
    info.seeds_connected = status.num_seeds;
    info.peers_sending_to_us = status.num_seeds;
    info.peers_getting_from_us =
        std::max(0, status.num_peers - status.num_seeds);
    info.eta = estimate_eta(status);
    info.total_wanted_done = status.total_wanted_done;
    info.added_time = status.added_time;
    info.ratio = status.total_download > 0
                     ? static_cast<double>(status.total_upload) / status.total_download
                     : 0.0;
    info.is_finished = status.is_finished;
    info.sequential_download =
        static_cast<bool>(status.flags & libtorrent::torrent_flags::sequential_download);
    info.super_seeding =
        static_cast<bool>(status.flags & libtorrent::torrent_flags::super_seeding);
    info.download_dir = status.save_path;
    info.error = status.errc.value();
    info.error_string = status.errc.message();
    if (auto override = torrent_error_string(hash); !override.empty()) {
      info.error_string = std::move(override);
    }
    info.left_until_done =
        std::max<std::int64_t>(0, status.total_wanted - status.total_wanted_done);
  info.size_when_done = status.total_wanted;
    if (revision == 0) {
      revision = ensure_torrent_revision(rpc_id);
    }
    info.revision = revision;
    return info;
  }

  TorrentDetail collect_detail(int rpc_id, libtorrent::torrent_handle const &handle,
                               libtorrent::torrent_status const &status) {
    TorrentDetail detail;
    detail.summary = build_snapshot(rpc_id, status);
    auto const hash = info_hash_to_hex(status.info_hashes);
    if (auto labels_it = torrent_labels.find(hash);
        labels_it != torrent_labels.end()) {
      detail.summary.labels = labels_it->second;
    }
    if (auto prio_it = torrent_priorities.find(rpc_id);
        prio_it != torrent_priorities.end()) {
      detail.summary.bandwidth_priority = prio_it->second;
    }
    detail.files = collect_files(handle);
    detail.trackers = collect_trackers(handle);
    detail.peers = collect_peers(handle);
    if (auto const *ti = handle.torrent_file().get()) {
      detail.piece_count = ti->num_pieces();
      detail.piece_size = ti->piece_length();
    } else {
      detail.piece_count = 0;
      detail.piece_size = 0;
    }

    detail.piece_states.clear();
    int const pieces = status.pieces.size();
    if (pieces > 0) {
      detail.piece_states.resize(pieces);
      for (int i = 0; i < pieces; ++i) {
        detail.piece_states[i] =
            status.pieces.get_bit(libtorrent::piece_index_t(i)) ? 1 : 0;
      }
    }

    std::vector<int> availability;
    handle.piece_availability(availability);
    detail.piece_availability = std::move(availability);
    return detail;
  }

  std::vector<TorrentFileInfo> collect_files(libtorrent::torrent_handle const &handle) {
    std::vector<TorrentFileInfo> files;
    if (!handle.is_valid()) {
      return files;
    }
    auto const *ti = handle.torrent_file().get();
    if (ti == nullptr) {
      return files;
    }

    std::vector<std::int64_t> progress = handle.file_progress();
    auto const &storage = ti->files();

    files.reserve(storage.num_files());
    for (int index = 0; index < storage.num_files(); ++index) {
      libtorrent::file_index_t file_index(index);
      TorrentFileInfo entry;
      entry.index = index;
      entry.name = storage.file_path(file_index);
      entry.length = storage.file_size(file_index);
      entry.bytes_completed =
          index < static_cast<int>(progress.size()) ? progress[index] : 0;
      entry.progress =
          entry.length > 0
              ? static_cast<double>(entry.bytes_completed) / entry.length
              : 0.0;
      auto priority = handle.file_priority(file_index);
      entry.priority = static_cast<int>(
          static_cast<std::uint8_t>(priority)); // explicit conversion
      entry.wanted = priority != libtorrent::dont_download;
      files.push_back(entry);
    }
    return files;
  }

  std::vector<TorrentTrackerInfo> collect_trackers(libtorrent::torrent_handle const &handle) {
    std::vector<TorrentTrackerInfo> trackers;
    if (!handle.is_valid()) {
      return trackers;
    }
    auto const *ti = handle.torrent_file().get();
    if (ti == nullptr) {
      return trackers;
    }
    auto const &entries = ti->trackers();
    for (auto const &entry : entries) {
      TorrentTrackerInfo info;
      info.announce = entry.url;
      info.tier = entry.tier;
      trackers.push_back(info);
    }
    return trackers;
  }

  std::vector<TorrentPeerInfo> collect_peers(libtorrent::torrent_handle const &handle) {
    std::vector<TorrentPeerInfo> peers;
    if (!handle.is_valid()) {
      return peers;
    }
    std::vector<libtorrent::peer_info> peer_list;
    handle.get_peer_info(peer_list);
    peers.reserve(peer_list.size());
    for (auto const &peer : peer_list) {
      TorrentPeerInfo info;
      info.client_name = peer.client;
      info.client_is_choking =
          static_cast<bool>(peer.flags & libtorrent::peer_info::choked);
      info.client_is_interested =
          static_cast<bool>(peer.flags & libtorrent::peer_info::interesting);
      info.peer_is_choking =
          !static_cast<bool>(peer.flags & libtorrent::peer_info::remote_interested);
      info.peer_is_interested =
          static_cast<bool>(peer.flags & libtorrent::peer_info::remote_interested);
      info.flag_str = std::to_string(static_cast<unsigned>(peer.flags));
      info.rate_to_client = peer.payload_down_speed;
      info.rate_to_peer = peer.payload_up_speed;
      info.progress = peer.progress;
      if (peer.ip.address().is_v4() || peer.ip.address().is_v6()) {
        info.address = peer.ip.address().to_string() + ":" +
                       std::to_string(peer.ip.port());
      } else {
        info.address = peer.ip.address().to_string();
      }
      peers.push_back(info);
    }
    return peers;
  }

  int to_transmission_status(libtorrent::torrent_status const &status) const {
    if (status.flags & libtorrent::torrent_flags::paused) {
      return 0;
    }
    switch (status.state) {
      case libtorrent::torrent_status::checking_files:
      case libtorrent::torrent_status::checking_resume_data:
        return 2;
      case libtorrent::torrent_status::downloading_metadata:
      case libtorrent::torrent_status::downloading:
        return 4;
      case libtorrent::torrent_status::finished:
      case libtorrent::torrent_status::seeding:
        return 6;
      default:
        return 0;
    }
  }
};

Core::~Core() = default;

Core::Core(CoreSettings settings) : impl_(std::make_unique<Impl>(std::move(settings))) {}

std::unique_ptr<Core> Core::create(CoreSettings settings) {
  return std::unique_ptr<Core>(new Core(settings));
}

void Core::run() {
  if (impl_) {
    impl_->run();
  }
}

void Core::stop() noexcept {
  if (impl_) {
    impl_->stop();
  }
}

bool Core::is_running() const noexcept {
  return impl_ ? impl_->running.load(std::memory_order_relaxed) : false;
}

Core::AddTorrentStatus Core::enqueue_add_torrent(TorrentAddRequest request) {
  if (!impl_) {
    return AddTorrentStatus::InvalidUri;
  }
  return impl_->enqueue_torrent(std::move(request));
}

std::shared_ptr<SessionSnapshot> Core::snapshot() const noexcept {
  if (!impl_) {
    return std::make_shared<SessionSnapshot>();
  }
  return impl_->snapshot_copy();
}

CoreSettings Core::settings() const noexcept {
  if (!impl_) {
    return CoreSettings{};
  }
  return impl_->settings_copy();
}

std::vector<TorrentSnapshot> Core::torrent_list() const {
  if (!impl_) {
    return {};
  }
  auto snap = impl_->snapshot_copy();
  return snap ? snap->torrents : std::vector<TorrentSnapshot>{};
}

std::optional<TorrentDetail> Core::torrent_detail(int id) {
  if (!impl_) {
    return std::nullopt;
  }
  try {
    return impl_->run_task([this, id]() { return impl_->detail_for_id(id); }).get();
  } catch (...) {
    return std::nullopt;
  }
}

void Core::start_torrents(std::vector<int> ids, bool now) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids), now]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      handle.resume();
    }
  }).get();
}

void Core::stop_torrents(std::vector<int> ids) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids)]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (handle.is_valid()) {
        handle.pause();
      }
    }
  }).get();
}

void Core::verify_torrents(std::vector<int> ids) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids)]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (handle.is_valid()) {
        handle.force_recheck();
      }
    }
  }).get();
}

void Core::remove_torrents(std::vector<int> ids, bool delete_data) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids), delete_data]() {
    if (!impl_->session) {
      return;
    }
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      auto flags = decltype(libtorrent::session::delete_files){};
      if (delete_data) {
        flags = libtorrent::session::delete_files;
      }
      auto status = handle.status();
      impl_->session->remove_torrent(handle, flags);
      impl_->remove_persisted_torrent(info_hash_to_hex(status.info_hashes));
    }
  }).get();
}

void Core::reannounce_torrents(std::vector<int> ids) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids)]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (handle.is_valid()) {
        handle.force_reannounce();
      }
    }
  }).get();
}

void Core::queue_move_top(std::vector<int> ids) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids)]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (handle.is_valid()) {
        handle.queue_position_top();
      }
    }
  }).get();
}

void Core::queue_move_bottom(std::vector<int> ids) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids)]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (handle.is_valid()) {
        handle.queue_position_bottom();
      }
    }
  }).get();
}

void Core::queue_move_up(std::vector<int> ids) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids)]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (handle.is_valid()) {
        handle.queue_position_up();
      }
    }
  }).get();
}

void Core::queue_move_down(std::vector<int> ids) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids)]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (handle.is_valid()) {
        handle.queue_position_down();
      }
    }
  }).get();
}

void Core::toggle_file_selection(std::vector<int> ids,
                                std::vector<int> file_indexes,
                                bool wanted) {
  if (!impl_ || ids.empty() || file_indexes.empty()) {
    return;
  }
  impl_->run_task(
      [this, ids = std::move(ids), file_indexes = std::move(file_indexes),
       wanted]() {
        auto handles = impl_->resolve_handles(ids);
        for (auto &handle : handles) {
          if (!handle.is_valid()) {
            continue;
          }
          for (int index : file_indexes) {
            libtorrent::file_index_t file_index(index);
            auto priority =
                wanted ? libtorrent::default_priority : libtorrent::dont_download;
            handle.file_priority(file_index, priority);
          }
        }
      }).get();
}

void Core::set_sequential(std::vector<int> ids, bool enabled) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids), enabled]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (handle.is_valid()) {
        auto flag = libtorrent::torrent_flags::sequential_download;
        if (enabled) {
          handle.set_flags(flag);
        } else {
          handle.unset_flags(flag);
        }
      }
    }
  }).get();
}

void Core::set_super_seeding(std::vector<int> ids, bool enabled) {
  if (!impl_ || ids.empty()) {
    return;
  }
  impl_->run_task([this, ids = std::move(ids), enabled]() {
    auto handles = impl_->resolve_handles(ids);
    for (auto &handle : handles) {
      if (handle.is_valid()) {
        auto flag = libtorrent::torrent_flags::super_seeding;
        if (enabled) {
          handle.set_flags(flag);
        } else {
          handle.unset_flags(flag);
        }
      }
    }
  }).get();
}

void Core::move_torrent_location(int id, std::string path, bool move) {
  if (!impl_) {
    return;
  }
  impl_->run_task([this, id, path = std::move(path), move]() {
    if (auto handle = impl_->handle_for_id(id); handle) {
      auto hash = info_hash_to_hex(handle->status().info_hashes);
      if (hash.empty()) {
        return;
      }
      std::filesystem::path destination(path);
      impl_->queue_pending_move(hash, destination);
      if (move) {
        handle->move_storage(path);
      } else {
        handle->move_storage(path, libtorrent::move_flags_t::reset_save_path);
      }
    }
  }).get();
}

void Core::set_download_path(std::filesystem::path path) {
  if (!impl_) {
    return;
  }
  try {
    impl_->run_task([this, path = std::move(path)]() mutable {
      impl_->update_download_path(std::move(path));
    }).get();
  } catch (...) {
  }
}

bool Core::set_listen_port(std::uint16_t port) {
  if (!impl_) {
    return false;
  }
  try {
    return impl_->run_task([this, port]() { return impl_->update_listen_port(port); }).get();
  } catch (...) {
    return false;
  }
}

bool Core::rename_torrent_path(int id, std::string const &path,
                               std::string const &name) {
  if (!impl_ || path.empty() || name.empty()) {
    return false;
  }
  try {
    auto current = path;
    auto target = name;
    return impl_->run_task([this, id, current = std::move(current),
                            target = std::move(target)]() mutable {
      return impl_->rename_path(id, current, target);
    }).get();
  } catch (...) {
    return false;
  }
}

void Core::set_speed_limits(std::optional<int> download_kbps,
                           std::optional<bool> download_enabled,
                           std::optional<int> upload_kbps,
                           std::optional<bool> upload_enabled) {
  if (!impl_) {
    return;
  }
  try {
    impl_->run_task(
        [this, download_kbps, download_enabled, upload_kbps, upload_enabled]() {
          impl_->apply_speed_limits(download_kbps, download_enabled, upload_kbps,
                                    upload_enabled);
        }).get();
  } catch (...) {
  }
}

void Core::set_peer_limits(std::optional<int> global_limit,
                          std::optional<int> per_torrent_limit) {
  if (!impl_) {
    return;
  }
  try {
    impl_->run_task([this, global_limit, per_torrent_limit]() {
      impl_->apply_peer_limits(global_limit, per_torrent_limit);
    }).get();
  } catch (...) {
  }
}

void Core::update_session_settings(SessionUpdate update) {
  if (!impl_) {
    return;
  }
  try {
    impl_->run_task(
        [this, update = std::move(update)]() mutable {
          impl_->apply_session_update(std::move(update));
        }).get();
  } catch (...) {
  }
}

void Core::add_trackers(std::vector<int> ids,
                       std::vector<TrackerEntry> const &entries) {
  if (!impl_ || ids.empty() || entries.empty()) {
    return;
  }
  try {
    auto entries_copy = entries;
    impl_->run_task([this, ids = std::move(ids),
                     entries = std::move(entries_copy)]() mutable {
      impl_->add_torrent_trackers(ids, entries);
    }).get();
  } catch (...) {
  }
}

void Core::remove_trackers(std::vector<int> ids,
                          std::vector<std::string> const &announces) {
  if (!impl_ || ids.empty() || announces.empty()) {
    return;
  }
  try {
    auto announces_copy = announces;
    impl_->run_task(
        [this, ids = std::move(ids),
         announces = std::move(announces_copy)]() mutable {
          impl_->remove_torrent_trackers(ids, announces);
        }).get();
  } catch (...) {
  }
}

void Core::replace_trackers(std::vector<int> ids,
                           std::vector<TrackerEntry> const &entries) {
  if (!impl_ || ids.empty()) {
    return;
  }
  try {
    auto entries_copy = entries;
    impl_->run_task([this, ids = std::move(ids),
                     entries = std::move(entries_copy)]() mutable {
      impl_->replace_torrent_trackers(ids, entries);
    }).get();
  } catch (...) {
  }
}

void Core::set_torrent_bandwidth_priority(std::vector<int> ids, int priority) {
  if (!impl_ || ids.empty()) {
    return;
  }
  try {
    impl_->run_task(
        [this, ids = std::move(ids), priority]() mutable {
          impl_->set_torrent_bandwidth_priority(ids, priority);
        }).get();
  } catch (...) {
  }
}

void Core::set_torrent_bandwidth_limits(
    std::vector<int> ids, std::optional<int> download_limit_kbps,
    std::optional<bool> download_limited, std::optional<int> upload_limit_kbps,
    std::optional<bool> upload_limited) {
  if (!impl_ || ids.empty()) {
    return;
  }
  try {
    impl_->run_task(
        [this, ids = std::move(ids), download_limit_kbps, download_limited,
         upload_limit_kbps, upload_limited]() mutable {
          impl_->set_torrent_bandwidth_limits(ids, download_limit_kbps,
                                               download_limited, upload_limit_kbps,
                                               upload_limited);
        }).get();
  } catch (...) {
  }
}

void Core::set_torrent_seed_limits(std::vector<int> ids,
                                   TorrentSeedLimit limits) {
  if (!impl_ || ids.empty()) {
    return;
  }
  try {
    impl_->run_task([this, ids = std::move(ids), limits = std::move(limits)]() mutable {
      impl_->set_torrent_seed_limits(ids, limits);
    }).get();
  } catch (...) {
  }
}

void Core::set_torrent_labels(std::vector<int> ids,
                              std::vector<std::string> const &labels) {
  if (!impl_ || ids.empty()) {
    return;
  }
  try {
    auto labels_copy = labels;
    impl_->run_task([this, ids = std::move(ids),
                     labels = std::move(labels_copy)]() mutable {
      impl_->set_torrent_labels(ids, labels);
    }).get();
  } catch (...) {
  }
}

bool Core::request_blocklist_reload() {
  if (!impl_) {
    return false;
  }
  try {
    return impl_->schedule_blocklist_reload();
  } catch (...) {
    return false;
  }
}

std::size_t Core::blocklist_entry_count() const noexcept {
  return impl_ ? impl_->blocklist_entries : 0;
}

std::optional<std::chrono::system_clock::time_point>
Core::blocklist_last_update() const noexcept {
  if (!impl_) {
    return std::nullopt;
  }
  return impl_->blocklist_last_update;
}

std::string Core::listen_error() const {
  if (!impl_) {
    return {};
  }
  return impl_->listen_error_impl();
}

HistoryConfig Core::history_config() const {
  if (!impl_) {
    return {};
  }
  return impl_->history_config_impl();
}

std::vector<HistoryBucket> Core::history_data(std::int64_t start, std::int64_t end,
                                               std::int64_t step) const {
  if (!impl_) {
    return {};
  }
  try {
    return impl_->run_task([this, start, end, step]() {
      return impl_->history_query(start, end, step);
    }).get();
  } catch (...) {
    return {};
  }
}

bool Core::history_clear(std::optional<std::int64_t> older_than) {
  if (!impl_) {
    return false;
  }
  try {
    return impl_
        ->run_task(
            [this, older_than]() { return impl_->history_clear(older_than); })
        .get();
  } catch (...) {
    return false;
  }
}

} // namespace tt::engine

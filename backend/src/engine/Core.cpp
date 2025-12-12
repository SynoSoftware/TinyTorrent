#include "engine/Core.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstddef>
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
#include <libtorrent/session_params.hpp>
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
#include "utils/StateStore.hpp"

#include <ctime>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <functional>
#include <future>
#include <limits>
#include <memory>
#include <optional>
#include <mutex>
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

constexpr int kSha1Bytes = static_cast<int>(libtorrent::sha1_hash::size());

struct SessionTotals {
  std::uint64_t uploaded = 0;
  std::uint64_t downloaded = 0;
};

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
  std::atomic<std::shared_ptr<SessionSnapshot>> snapshot{std::make_shared<SessionSnapshot>()};
  std::unordered_map<int, libtorrent::sha1_hash> id_to_hash;
  std::unordered_map<libtorrent::sha1_hash, int, Sha1HashHash> hash_to_id;
  int next_id = 1;
  std::filesystem::path state_path;
  std::filesystem::path resume_dir;
  std::chrono::steady_clock::time_point session_start_time =
      std::chrono::steady_clock::now();
  std::uint64_t session_start_downloaded = 0;
  std::uint64_t session_start_uploaded = 0;
  std::chrono::steady_clock::time_point stats_last_update =
      std::chrono::steady_clock::now();
  std::uint64_t last_total_downloaded = 0;
  std::uint64_t last_total_uploaded = 0;
  tt::storage::SessionState persisted_state;
  mutable std::mutex state_mutex;
  std::filesystem::path blocklist_path;
  std::size_t blocklist_entries = 0;
  std::optional<std::chrono::system_clock::time_point> blocklist_last_update;
  bool alt_speed_active = false;
  std::unordered_map<int, TorrentLimitState> torrent_limits;
  std::unordered_map<std::string, std::vector<std::string>> torrent_labels;
  std::unordered_map<std::string, std::filesystem::path> final_paths;
  std::unordered_map<int, int> torrent_priorities;
  std::unordered_map<int, std::uint64_t> torrent_revisions;
  std::uint64_t next_torrent_revision = 1;
  std::unordered_map<int, TorrentSnapshot> snapshot_cache;
  struct WatchFileSnapshot {
    std::uintmax_t size = 0;
    std::filesystem::file_time_type mtime;
  };
  std::unordered_map<std::filesystem::path, WatchFileSnapshot> watch_dir_snapshots;
  std::atomic_bool shutdown_requested{false};
  bool save_resume_in_progress = false;
  int pending_resume_requests = 0;
  int processed_resume_alerts = 0;
  std::chrono::steady_clock::time_point resume_deadline =
      std::chrono::steady_clock::now();
  std::chrono::steady_clock::time_point next_housekeeping =
      std::chrono::steady_clock::now();

  explicit Impl(CoreSettings settings) : settings(std::move(settings)) {
    std::filesystem::create_directories(this->settings.download_path);
    resume_dir = tt::utils::data_root() / "resume";
    std::filesystem::create_directories(resume_dir);
    if (this->settings.watch_dir_enabled && !this->settings.watch_dir.empty()) {
      std::filesystem::create_directories(this->settings.watch_dir);
    }

    state_path = this->settings.state_path;
    if (state_path.empty()) {
      state_path = tt::utils::data_root() / "state.json";
    }
    persisted_state = tt::storage::load_session_state(state_path);
    torrent_labels = persisted_state.labels;
    ++persisted_state.session_count;

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
    session = std::make_unique<libtorrent::session>(params);
    refresh_active_speed_limits(true);
    replay_saved_torrents();
    initialize_session_statistics();
    persist_state();
  }

  void run() {
    while (running.load(std::memory_order_relaxed)) {
      if (shutdown_requested.load(std::memory_order_relaxed) && !save_resume_in_progress) {
        persist_resume_data();
      }
      refresh_active_speed_limits();
      process_tasks();
      process_alerts();
      update_snapshot();
      perform_housekeeping();
      if (shutdown_requested.load(std::memory_order_relaxed)) {
        auto now = std::chrono::steady_clock::now();
        if (!save_resume_in_progress ||
            pending_resume_requests == 0 ||
            processed_resume_alerts >= pending_resume_requests ||
            now >= resume_deadline) {
          running.store(false, std::memory_order_relaxed);
          continue;
        }
      }
      std::unique_lock<std::mutex> lock(wake_mutex);
      wake_cv.wait_for(lock, std::chrono::milliseconds(settings.idle_sleep_ms),
                       [this] {
                         return !tasks.empty() ||
                                shutdown_requested.load(std::memory_order_relaxed);
                       });
    }
  }

  void stop() noexcept {
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
    std::vector<libtorrent::alert *> alerts;
    session->pop_alerts(&alerts);
    for (auto const *alert : alerts) {
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
      auto const &handle = metadata->handle;
      auto info = handle.info_hashes().get_best();
      TT_LOG_DEBUG("metadata received for {}", info_hash_to_hex(info));
    } else if (auto *state =
                   libtorrent::alert_cast<libtorrent::state_update_alert>(alert)) {
      for (auto const &status : state->status) {
        auto id = assign_rpc_id(status.info_hashes.get_best());
        mark_torrent_dirty(id);
      }
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

  void handle_save_resume_data_alert(libtorrent::save_resume_data_alert const &alert) {
    if (auto hash = info_hash_from_params(alert.params); hash) {
      write_resume_blob(*hash, alert.params);
    }
    ++processed_resume_alerts;
    resume_deadline = std::chrono::steady_clock::now() + kResumeAlertTimeout;
    if (processed_resume_alerts >= pending_resume_requests) {
      save_resume_in_progress = false;
    }
  }

  void handle_save_resume_data_failed_alert(
      libtorrent::save_resume_data_failed_alert const &alert) {
    TT_LOG_INFO("save resume data failed: {}", alert.error.message());
    ++processed_resume_alerts;
    resume_deadline = std::chrono::steady_clock::now() + kResumeAlertTimeout;
    if (processed_resume_alerts >= pending_resume_requests) {
      save_resume_in_progress = false;
    }
  }

  void persist_state() {
    std::lock_guard<std::mutex> lock(state_mutex);
    persist_state_unlocked();
  }

  void persist_resume_data() {
    if (!session) {
      return;
    }
    session->pause();
    pending_resume_requests = 0;
    processed_resume_alerts = 0;
    save_resume_in_progress = false;
    auto handles = session->get_torrents();
    for (auto const &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      handle.save_resume_data();
      ++pending_resume_requests;
    }
    save_resume_in_progress = pending_resume_requests > 0;
    resume_deadline = std::chrono::steady_clock::now() + kResumeAlertTimeout;
  }

  void persist_state_unlocked() {
    if (state_path.empty()) {
      return;
    }
    auto totals = capture_session_totals();
    auto now = std::chrono::steady_clock::now();
    accumulate_session_stats_locked(totals, now);
    persisted_state.listen_interface = settings.listen_interface;
    persisted_state.download_path = settings.download_path.string();
    persisted_state.speed_limit_down_kbps = settings.download_rate_limit_kbps;
    persisted_state.speed_limit_down_enabled = settings.download_rate_limit_enabled;
    persisted_state.speed_limit_up_kbps = settings.upload_rate_limit_kbps;
    persisted_state.speed_limit_up_enabled = settings.upload_rate_limit_enabled;
    persisted_state.peer_limit = settings.peer_limit;
    persisted_state.peer_limit_per_torrent = settings.peer_limit_per_torrent;
    persisted_state.alt_speed_down_kbps = settings.alt_download_rate_limit_kbps;
    persisted_state.alt_speed_up_kbps = settings.alt_upload_rate_limit_kbps;
    persisted_state.alt_speed_enabled = settings.alt_speed_enabled;
    persisted_state.alt_speed_time_enabled = settings.alt_speed_time_enabled;
    persisted_state.alt_speed_time_begin = settings.alt_speed_time_begin;
    persisted_state.alt_speed_time_end = settings.alt_speed_time_end;
    persisted_state.alt_speed_time_day = settings.alt_speed_time_day;
    persisted_state.encryption = static_cast<int>(settings.encryption);
    persisted_state.dht_enabled = settings.dht_enabled;
    persisted_state.pex_enabled = settings.pex_enabled;
    persisted_state.lpd_enabled = settings.lpd_enabled;
    persisted_state.utp_enabled = settings.utp_enabled;
    persisted_state.download_queue_size = settings.download_queue_size;
    persisted_state.seed_queue_size = settings.seed_queue_size;
    persisted_state.queue_stalled_enabled = settings.queue_stalled_enabled;
    persisted_state.incomplete_dir =
        settings.incomplete_dir.empty() ? std::string{} : settings.incomplete_dir.string();
    persisted_state.incomplete_dir_enabled = settings.incomplete_dir_enabled;
    persisted_state.watch_dir =
        settings.watch_dir.empty() ? std::string{} : settings.watch_dir.string();
    persisted_state.watch_dir_enabled = settings.watch_dir_enabled;
    persisted_state.seed_ratio_limit = settings.seed_ratio_limit;
    persisted_state.seed_ratio_enabled = settings.seed_ratio_enabled;
    persisted_state.seed_idle_limit = settings.seed_idle_limit_minutes;
    persisted_state.seed_idle_enabled = settings.seed_idle_enabled;
    persisted_state.proxy_type = settings.proxy_type;
    persisted_state.proxy_hostname = settings.proxy_hostname;
    persisted_state.proxy_port = settings.proxy_port;
    persisted_state.proxy_auth_enabled = settings.proxy_auth_enabled;
    persisted_state.proxy_username = settings.proxy_username;
    persisted_state.proxy_password = settings.proxy_password;
    persisted_state.proxy_peer_connections = settings.proxy_peer_connections;
    persisted_state.labels = torrent_labels;
    if (!tt::storage::save_session_state(state_path, persisted_state)) {
      TT_LOG_INFO("failed to persist session state to {}", state_path.string());
    }
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
        persisted_state.seconds_active += seconds;
      }
    }
    if (totals.uploaded >= last_total_uploaded) {
      persisted_state.uploaded_bytes += totals.uploaded - last_total_uploaded;
    } else {
      persisted_state.uploaded_bytes += totals.uploaded;
    }
    if (totals.downloaded >= last_total_downloaded) {
      persisted_state.downloaded_bytes += totals.downloaded - last_total_downloaded;
    } else {
      persisted_state.downloaded_bytes += totals.downloaded;
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
  }

  void scan_watch_directory() {
    if (!settings.watch_dir_enabled || settings.watch_dir.empty()) {
      return;
    }
    std::error_code ec;
    std::filesystem::create_directories(settings.watch_dir, ec);
    if (ec) {
      TT_LOG_INFO("failed to create watch-dir {}: {}", settings.watch_dir.string(),
                  ec.message());
      return;
    }
    std::unordered_set<std::filesystem::path> seen;
    for (auto const &entry :
         std::filesystem::directory_iterator(settings.watch_dir, ec)) {
      if (ec) {
        TT_LOG_INFO("watch-dir iteration failed: {}", ec.message());
        break;
      }
      auto path = entry.path();
      seen.insert(path);
      std::error_code file_ec;
      if (!entry.is_regular_file(file_ec) || file_ec) {
        continue;
      }
      if (path.extension() != ".torrent") {
        continue;
      }
      auto size = entry.file_size(file_ec);
      if (file_ec) {
        continue;
      }
      auto mtime = entry.last_write_time(file_ec);
      if (file_ec) {
        continue;
      }
      WatchFileSnapshot snapshot{size, mtime};
      auto existing = watch_dir_snapshots.find(path);
      bool stable = false;
      if (existing != watch_dir_snapshots.end()) {
        stable = existing->second.size == snapshot.size &&
                 existing->second.mtime == snapshot.mtime;
      }
      watch_dir_snapshots[path] = snapshot;
      if (!stable) {
        continue;
      }
      std::ifstream input(path, std::ios::binary);
      if (!input) {
        mark_watch_file(path, ".invalid");
        continue;
      }
      std::vector<std::uint8_t> buffer(
          (std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
      if (buffer.empty()) {
        mark_watch_file(path, ".invalid");
        continue;
      }
      TorrentAddRequest request;
      request.metainfo = std::move(buffer);
      request.download_path = settings.download_path;
      auto status = enqueue_torrent(std::move(request));
      if (status == Core::AddTorrentStatus::Ok) {
        mark_watch_file(path, ".added");
      } else {
        auto reason = status == Core::AddTorrentStatus::InvalidUri
                          ? "invalid torrent metadata"
                          : "failed to queue torrent";
        TT_LOG_INFO("watch-dir enqueue failed for {}: {}", path.string(), reason);
        mark_watch_file(path, ".invalid");
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

  std::filesystem::path resume_blob_path(std::string const &hash) const {
    if (hash.empty() || resume_dir.empty()) {
      return {};
    }
    return resume_dir / (hash + ".fastresume");
  }

  void write_resume_blob(std::string const &hash,
                         libtorrent::add_torrent_params const &params) {
    auto path = resume_blob_path(hash);
    if (path.empty()) {
      return;
    }
    std::error_code ec;
    std::filesystem::create_directories(resume_dir, ec);
    if (ec) {
      TT_LOG_INFO("failed to ensure resume directory {}: {}", resume_dir.string(),
                  ec.message());
      return;
    }
    auto buffer = libtorrent::write_resume_data_buf(params);
    std::ofstream output(path, std::ios::binary);
    if (!output) {
      TT_LOG_INFO("failed to serialize resume blob for {} ({})",
                  hash, path.string());
      return;
    }
    output.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
    output.flush();
  }

  std::optional<std::vector<std::uint8_t>> load_resume_blob(
      std::string const &hash) const {
    auto path = resume_blob_path(hash);
    if (path.empty()) {
      return std::nullopt;
    }
    std::ifstream input(path, std::ios::binary);
    if (!input) {
      return std::nullopt;
    }
    std::vector<std::uint8_t> blob(
        (std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
    if (blob.empty()) {
      return std::nullopt;
    }
    return blob;
  }

  void add_or_update_persisted(tt::storage::PersistedTorrent entry) {
    std::lock_guard<std::mutex> lock(state_mutex);
    auto it = std::find_if(
        persisted_state.torrents.begin(), persisted_state.torrents.end(),
        [&entry](tt::storage::PersistedTorrent const &existing) {
          return existing.hash == entry.hash;
        });
    if (it == persisted_state.torrents.end()) {
      persisted_state.torrents.push_back(std::move(entry));
    } else {
      *it = std::move(entry);
    }
    persist_state_unlocked();
  }

  void update_persisted_download_path(std::string const &hash,
                                      std::filesystem::path const &path) {
    if (hash.empty() || path.empty()) {
      return;
    }
    std::lock_guard<std::mutex> lock(state_mutex);
    auto it = std::find_if(
        persisted_state.torrents.begin(), persisted_state.torrents.end(),
        [&hash](tt::storage::PersistedTorrent const &entry) {
          return entry.hash == hash;
        });
    if (it == persisted_state.torrents.end()) {
      return;
    }
    it->download_path = path.string();
    persist_state_unlocked();
  }

  void remove_persisted_torrent(std::string const &hash) {
    if (hash.empty()) {
      return;
    }
    bool removed_entry = false;
    bool removed_label = false;
    {
      std::lock_guard<std::mutex> lock(state_mutex);
      auto it = std::remove_if(
          persisted_state.torrents.begin(), persisted_state.torrents.end(),
          [&hash](tt::storage::PersistedTorrent const &entry) {
            return entry.hash == hash;
          });
      if (it != persisted_state.torrents.end()) {
        persisted_state.torrents.erase(it, persisted_state.torrents.end());
        removed_entry = true;
      }
      if (persisted_state.labels.erase(hash) > 0) {
        removed_label = true;
      }
      torrent_labels.erase(hash);
      if (removed_entry || removed_label) {
        persist_state_unlocked();
      }
    }
    final_paths.erase(hash);
  }

  void register_persisted_torrent(std::string const &hash,
                                  TorrentAddRequest const &request) {
    if (hash.empty()) {
      return;
    }
    tt::storage::PersistedTorrent entry;
    entry.hash = hash;
    entry.download_path = request.download_path.string();
    entry.paused = request.paused;
    if (request.uri) {
      entry.uri = *request.uri;
    }
    if (!request.metainfo.empty()) {
      entry.metainfo = tt::utils::encode_base64(request.metainfo);
    }
    auto final_path = request.download_path.empty() ? settings.download_path
                                                    : request.download_path;
    final_paths[hash] = final_path;
    add_or_update_persisted(std::move(entry));
  }

  void replay_saved_torrents() {
    std::vector<TorrentAddRequest> pending;
    for (auto const &entry : persisted_state.torrents) {
      TorrentAddRequest request;
      request.download_path =
          entry.download_path.empty() ? settings.download_path
                                      : std::filesystem::path(entry.download_path);
      request.paused = entry.paused;
      if (!entry.uri.empty()) {
        request.uri = entry.uri;
      } else if (!entry.metainfo.empty()) {
        if (auto decoded = tt::utils::decode_base64(entry.metainfo);
            decoded && !decoded->empty()) {
          request.metainfo = std::move(*decoded);
        } else {
          continue;
        }
      } else {
        continue;
      }
      if (!entry.hash.empty()) {
        if (auto blob = load_resume_blob(entry.hash); blob) {
          request.resume_data = std::move(*blob);
        }
      }
      pending.push_back(std::move(request));
    }
    for (auto &request : pending) {
      enqueue_torrent(std::move(request));
    }
  }

  void update_snapshot() {
    if (!session) {
      return;
    }

    auto handles = session->get_torrents();
    auto new_snapshot = std::make_shared<SessionSnapshot>();
    auto totals = capture_session_totals();
    auto now = std::chrono::steady_clock::now();
    SessionStatistics cumulative_stats{};
    {
      std::lock_guard<std::mutex> lock(state_mutex);
      accumulate_session_stats_locked(totals, now);
      cumulative_stats.uploaded_bytes = persisted_state.uploaded_bytes;
      cumulative_stats.downloaded_bytes = persisted_state.downloaded_bytes;
      cumulative_stats.seconds_active = persisted_state.seconds_active;
      cumulative_stats.session_count = persisted_state.session_count;
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
    settings.download_path = std::move(path);
    persist_state();
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
    settings.listen_interface = host + ":" + std::to_string(port);
    TT_LOG_INFO("recorded listen interface {} for peer-port {}",
                settings.listen_interface, static_cast<unsigned>(port));
    persist_state();
    return true;
  }

  void apply_speed_limits(std::optional<int> download_kbps,
                          std::optional<bool> download_enabled,
                          std::optional<int> upload_kbps,
                          std::optional<bool> upload_enabled) {
    auto download_enabled_flag =
        download_enabled.value_or(settings.download_rate_limit_enabled);
    auto upload_enabled_flag =
        upload_enabled.value_or(settings.upload_rate_limit_enabled);
    auto download_value =
        download_kbps.value_or(settings.download_rate_limit_kbps);
    auto upload_value = upload_kbps.value_or(settings.upload_rate_limit_kbps);

    settings.download_rate_limit_enabled = download_enabled_flag;
    settings.upload_rate_limit_enabled = upload_enabled_flag;
    settings.download_rate_limit_kbps = download_value;
    settings.upload_rate_limit_kbps = upload_value;

    refresh_active_speed_limits(true);
    persist_state();
  }

  void refresh_active_speed_limits(bool force = false) {
    if (!session) {
      return;
    }
    bool active = should_use_alt_speed(settings);
    if (!force && active == alt_speed_active) {
      return;
    }
    alt_speed_active = active;
    int download_value = active ? settings.alt_download_rate_limit_kbps
                                : settings.download_rate_limit_kbps;
    bool download_enabled = active ? true : settings.download_rate_limit_enabled;
    int upload_value = active ? settings.alt_upload_rate_limit_kbps
                              : settings.upload_rate_limit_kbps;
    bool upload_enabled = active ? true : settings.upload_rate_limit_enabled;
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
    libtorrent::settings_pack pack;
    bool updated = false;
    if (global_limit) {
      int limit = std::max(0, *global_limit);
      settings.peer_limit = limit;
      pack.set_int(libtorrent::settings_pack::connections_limit, limit);
      current_settings.set_int(libtorrent::settings_pack::connections_limit, limit);
      updated = true;
    }
    if (per_torrent_limit) {
      int limit = std::max(0, *per_torrent_limit);
      settings.peer_limit_per_torrent = limit;
      pack.set_int(libtorrent::settings_pack::unchoke_slots_limit, limit);
      current_settings.set_int(libtorrent::settings_pack::unchoke_slots_limit, limit);
      updated = true;
    }
    if (updated && session) {
      session->apply_settings(pack);
      persist_state();
    }
  }

  void apply_session_update(SessionUpdate update) {
    bool persist = false;
    bool encryption_changed = false;
    bool network_changed = false;
    bool queue_changed = false;
    bool alt_changed = false;
    bool proxy_changed = false;

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
      apply_pex_flags();
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
    if (persist) {
      persist_state();
    }
  }

  void apply_encryption_settings() {
    if (!session) {
      return;
    }
    libtorrent::settings_pack pack;
    configure_encryption(pack, settings.encryption);
    configure_encryption(current_settings, settings.encryption);
    session->apply_settings(pack);
  }

  void apply_network_settings() {
    if (!session) {
      return;
    }
    libtorrent::settings_pack pack;
    pack.set_bool(libtorrent::settings_pack::enable_dht, settings.dht_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_lsd, settings.lpd_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_incoming_utp,
                  settings.utp_enabled);
    pack.set_bool(libtorrent::settings_pack::enable_outgoing_utp,
                  settings.utp_enabled);
    current_settings.set_bool(libtorrent::settings_pack::enable_dht,
                              settings.dht_enabled);
    current_settings.set_bool(libtorrent::settings_pack::enable_lsd,
                              settings.lpd_enabled);
    current_settings.set_bool(libtorrent::settings_pack::enable_incoming_utp,
                              settings.utp_enabled);
    current_settings.set_bool(libtorrent::settings_pack::enable_outgoing_utp,
                              settings.utp_enabled);
    session->apply_settings(pack);
    apply_pex_flags();
  }

  void apply_proxy_settings() {
    if (!session) {
      return;
    }
    libtorrent::settings_pack pack;
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

    current_settings.set_int(libtorrent::settings_pack::proxy_type,
                             settings.proxy_type);
    current_settings.set_str(libtorrent::settings_pack::proxy_hostname,
                             settings.proxy_hostname);
    current_settings.set_int(libtorrent::settings_pack::proxy_port,
                             settings.proxy_port);
    current_settings.set_bool(libtorrent::settings_pack::proxy_peer_connections,
                              settings.proxy_peer_connections);
    current_settings.set_bool(libtorrent::settings_pack::proxy_tracker_connections,
                              settings.proxy_peer_connections);
    current_settings.set_bool(libtorrent::settings_pack::proxy_hostnames,
                              !settings.proxy_hostname.empty());
    current_settings.set_str(libtorrent::settings_pack::proxy_username,
                             settings.proxy_auth_enabled ? settings.proxy_username
                                                         : "");
    current_settings.set_str(libtorrent::settings_pack::proxy_password,
                             settings.proxy_auth_enabled ? settings.proxy_password
                                                         : "");

    session->apply_settings(pack);
  }

  void apply_queue_settings() {
    if (!session) {
      return;
    }
    libtorrent::settings_pack pack;
    pack.set_int(libtorrent::settings_pack::active_downloads,
                 settings.download_queue_size);
    current_settings.set_int(libtorrent::settings_pack::active_downloads,
                             settings.download_queue_size);
    pack.set_int(libtorrent::settings_pack::active_seeds,
                 settings.seed_queue_size);
    current_settings.set_int(libtorrent::settings_pack::active_seeds,
                             settings.seed_queue_size);
    pack.set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                  settings.queue_stalled_enabled);
    current_settings.set_bool(libtorrent::settings_pack::dont_count_slow_torrents,
                              settings.queue_stalled_enabled);
    session->apply_settings(pack);
  }

  void apply_pex_flags() {
    if (!session) {
      return;
    }
    auto handles = session->get_torrents();
    for (auto const &handle : handles) {
      if (!handle.is_valid()) {
        continue;
      }
      auto flag = libtorrent::torrent_flags::disable_pex;
      if (settings.pex_enabled) {
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
    for (auto const &update : updates) {
      if (update.value) {
        torrent_labels[update.hash] = *update.value;
      } else {
        torrent_labels.erase(update.hash);
      }
    }
    {
      std::lock_guard<std::mutex> lock(state_mutex);
      for (auto const &update : updates) {
        if (update.value) {
          auto it = persisted_state.labels.find(update.hash);
          if (it == persisted_state.labels.end() ||
              it->second != *update.value) {
            changed = true;
          }
          persisted_state.labels[update.hash] = *update.value;
        } else if (persisted_state.labels.erase(update.hash) > 0) {
          changed = true;
        }
      }
    }
    if (changed) {
      for (int id : ids) {
        mark_torrent_dirty(id);
      }
      persist_state_unlocked();
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
    auto it = final_paths.find(hash);
    auto final_path = it != final_paths.end() ? it->second : default_path;
    if (final_path.empty() || final_path == settings.incomplete_dir) {
      return;
    }
    auto destination = determine_completion_destination(final_path, status, hash);
    if (destination.empty()) {
      TT_LOG_INFO("move-complete skipped for {}: unable to determine safe destination", hash);
      return;
    }
    std::filesystem::path current_save(status.save_path);
    if (destination == current_save) {
      return;
    }
    TT_LOG_INFO("moving {} from {} to {}", hash, status.save_path,
                destination.string());
    handle.move_storage(destination.string());
    final_paths[hash] = destination;
    update_persisted_download_path(hash, destination);
  }

  std::filesystem::path determine_completion_destination(
      std::filesystem::path const &base, libtorrent::torrent_status const &status,
      std::string const &hash) {
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
      auto name = status.name.empty() ? hash : status.name;
      candidate /= name;
    }
    std::filesystem::path current_save(status.save_path);
    return resolve_unique_completion_target(candidate, current_save);
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

  std::optional<std::size_t> reload_blocklist_internal() {
    if (blocklist_path.empty()) {
      TT_LOG_INFO("blocklist path not configured; skipping reload");
      return std::nullopt;
    }
    libtorrent::ip_filter filter;
    std::size_t entries = 0;
    if (!load_blocklist(blocklist_path, filter, entries)) {
      TT_LOG_INFO("failed to load blocklist from {}", blocklist_path.string());
      return std::nullopt;
    }
    if (session) {
      session->set_ip_filter(filter);
    }
    blocklist_entries = entries;
    blocklist_last_update = std::chrono::system_clock::now();
    TT_LOG_INFO("loaded blocklist ({} entries) from {}", entries,
                blocklist_path.string());
    return entries;
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
  return impl_->settings;
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
      if (move) {
        handle->move_storage(path);
      } else {
        handle->move_storage(path, libtorrent::move_flags_t::reset_save_path);
      }
      impl_->set_final_path(*handle, std::filesystem::path(path));
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

std::optional<std::size_t> Core::reload_blocklist() {
  if (!impl_) {
    return std::nullopt;
  }
  try {
    return impl_->run_task([this]() { return impl_->reload_blocklist_internal(); }).get();
  } catch (...) {
    return std::nullopt;
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

} // namespace tt::engine

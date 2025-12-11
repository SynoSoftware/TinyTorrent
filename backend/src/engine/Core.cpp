#include "engine/Core.hpp"

#include <array>
#include <cstddef>
#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/bdecode.hpp>
#include <libtorrent/alert.hpp>
#include <libtorrent/error_code.hpp>
#include <libtorrent/file_storage.hpp>
#include <libtorrent/magnet_uri.hpp>
#include <libtorrent/hex.hpp>
#include <libtorrent/peer_info.hpp>
#include <libtorrent/session.hpp>
#include <libtorrent/session_params.hpp>
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

#include "utils/Log.hpp"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <functional>
#include <future>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <type_traits>
#include <unordered_map>
#include <unordered_set>
#include <utility>

namespace tt::engine {

namespace {

constexpr char const *kUserAgent = "TinyTorrent/0.1.0";

constexpr int kSha1Bytes = static_cast<int>(libtorrent::sha1_hash::size());

std::string info_hash_to_hex(libtorrent::info_hash_t const &info) {
  auto hash = info.get_best();
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

} // namespace

struct Core::Impl {
  friend class Core;
  CoreSettings settings;
  std::unique_ptr<libtorrent::session> session;
  std::deque<std::function<void()>> tasks;
  mutable std::mutex task_mutex;
  std::condition_variable wake_cv;
  std::mutex wake_mutex;
  std::atomic_bool running{true};
  std::atomic<std::shared_ptr<SessionSnapshot>> snapshot{std::make_shared<SessionSnapshot>()};
  std::unordered_map<int, libtorrent::sha1_hash> id_to_hash;
  std::unordered_map<libtorrent::sha1_hash, int, Sha1HashHash> hash_to_id;
  int next_id = 1;

  explicit Impl(CoreSettings settings) : settings(std::move(settings)) {
    std::filesystem::create_directories(this->settings.download_path);

    libtorrent::settings_pack pack;
    pack.set_int(libtorrent::settings_pack::alert_mask, libtorrent::alert::all_categories);
    pack.set_str(libtorrent::settings_pack::user_agent, kUserAgent);
    pack.set_str(libtorrent::settings_pack::listen_interfaces,
                 this->settings.listen_interface);

    libtorrent::session_params params(pack);
    session = std::make_unique<libtorrent::session>(params);
  }

  void run() {
    while (running.load(std::memory_order_relaxed)) {
      process_tasks();
      update_snapshot();
      std::unique_lock<std::mutex> lock(wake_mutex);
      wake_cv.wait_for(lock, std::chrono::milliseconds(settings.idle_sleep_ms),
                       [this] {
                         return !tasks.empty() || !running.load(std::memory_order_relaxed);
                       });
    }
  }

  void stop() noexcept {
    running.store(false, std::memory_order_relaxed);
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
    params.save_path = save_path.string();
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

  void update_snapshot() {
    if (!session) {
      return;
    }

    auto handles = session->get_torrents();
    auto new_snapshot = std::make_shared<SessionSnapshot>();
    new_snapshot->torrents.reserve(handles.size());
    new_snapshot->torrent_count = handles.size();
    std::uint64_t total_download_rate = 0;
    std::uint64_t total_upload_rate = 0;
    std::size_t paused_count = 0;
    std::unordered_set<int> seen_ids;

    for (auto const &handle : handles) {
      auto status = handle.status();
      auto id = assign_rpc_id(status.info_hashes.get_best());
      seen_ids.insert(id);
      new_snapshot->torrents.push_back(build_snapshot(id, status));

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
        it = id_to_hash.erase(it);
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
    return true;
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

  TorrentSnapshot build_snapshot(int rpc_id, libtorrent::torrent_status const &status) {
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
    return info;
  }

  TorrentDetail collect_detail(int rpc_id, libtorrent::torrent_handle const &handle,
                               libtorrent::torrent_status const &status) {
    TorrentDetail detail;
    detail.summary = build_snapshot(rpc_id, status);
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
      impl_->session->remove_torrent(handle, flags);
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

} // namespace tt::engine

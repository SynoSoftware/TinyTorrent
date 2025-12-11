#include "engine/Core.hpp"
#include "rpc/Server.hpp"
#include "utils/FS.hpp"
#include "utils/Log.hpp"
#include "utils/StateStore.hpp"

#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <thread>
#include <utility>

std::atomic_bool keep_running{true};

int main() {
  std::signal(SIGINT, [](int) { keep_running.store(false, std::memory_order_relaxed); });
  std::signal(SIGTERM, [](int) { keep_running.store(false, std::memory_order_relaxed); });

  auto read_env = [](char const *key) -> std::optional<std::string> {
    auto value = std::getenv(key);
    if (value == nullptr) {
      return std::nullopt;
    }
    return std::string(value);
  };

  auto root = tt::utils::data_root();
  auto download_path = root / "downloads";

  auto state_path = root / "state.json";
  auto session_state = tt::storage::load_session_state(state_path);

  auto replace_endpoint_port = [](std::string value, std::string const &port) {
    if (value.empty() || port.empty()) {
      return value;
    }
    if (value.front() == '[') {
      auto closing = value.find(']');
      if (closing != std::string::npos) {
        auto colon = value.find(':', closing);
        if (colon != std::string::npos) {
          return value.substr(0, colon) + ":" + port;
        }
        return value + ":" + port;
      }
    }
    auto colon = value.find_last_of(':');
    if (colon != std::string::npos) {
      return value.substr(0, colon) + ":" + port;
    }
    return value + ":" + port;
  };

  auto replace_url_port = [&](std::string url, std::string const &port) {
    if (url.empty() || port.empty()) {
      return url;
    }
    auto scheme = url.find("://");
    auto host_start = (scheme == std::string::npos) ? 0 : scheme + 3;
    auto host_end = url.find('/', host_start);
    std::string host_port =
        host_end == std::string::npos ? url.substr(host_start)
                                      : url.substr(host_start, host_end - host_start);
    auto replaced = replace_endpoint_port(host_port, port);
    if (host_end == std::string::npos) {
      return url.substr(0, host_start) + replaced;
    }
    return url.substr(0, host_start) + replaced + url.substr(host_end);
  };

  std::string listen_interface =
      session_state.listen_interface.empty()
          ? "0.0.0.0:6881"
          : session_state.listen_interface;
  if (auto env = read_env("TT_PEER_INTERFACE"); env) {
    listen_interface = *env;
  }
  if (auto env_port = read_env("TT_PEER_PORT"); env_port) {
    listen_interface = replace_endpoint_port(listen_interface, *env_port);
  }
  session_state.listen_interface = listen_interface;

  std::string rpc_bind =
      session_state.rpc_bind.empty() ? "http://127.0.0.1:8080"
                                     : session_state.rpc_bind;
  if (auto env = read_env("TT_RPC_BIND"); env) {
    rpc_bind = *env;
  } else if (auto env_port = read_env("TT_RPC_PORT"); env_port) {
    rpc_bind = replace_url_port(rpc_bind, *env_port);
  }
  session_state.rpc_bind = rpc_bind;

  auto persisted_download =
      session_state.download_path.empty() ? download_path.string()
                                          : session_state.download_path;
  download_path = std::filesystem::path(persisted_download);
  session_state.download_path = persisted_download;
  std::filesystem::create_directories(download_path);
  tt::storage::save_session_state(state_path, session_state);

  auto blocklist_dir = root / "blocklists";
  std::filesystem::create_directories(blocklist_dir);

  TT_LOG_INFO("Data root: {}", root.string());
  TT_LOG_INFO("Download path: {}", download_path.string());

  tt::engine::CoreSettings settings;
  settings.download_path = download_path;
  settings.listen_interface = session_state.listen_interface;
  settings.blocklist_path = blocklist_dir / "blocklist.txt";
  settings.download_rate_limit_kbps = session_state.speed_limit_down_kbps;
  settings.download_rate_limit_enabled = session_state.speed_limit_down_enabled;
  settings.upload_rate_limit_kbps = session_state.speed_limit_up_kbps;
  settings.upload_rate_limit_enabled = session_state.speed_limit_up_enabled;
  settings.peer_limit = session_state.peer_limit;
  settings.peer_limit_per_torrent = session_state.peer_limit_per_torrent;
  settings.alt_download_rate_limit_kbps = session_state.alt_speed_down_kbps;
  settings.alt_upload_rate_limit_kbps = session_state.alt_speed_up_kbps;
  settings.alt_speed_enabled = session_state.alt_speed_enabled;
  settings.alt_speed_time_enabled = session_state.alt_speed_time_enabled;
  settings.alt_speed_time_begin = session_state.alt_speed_time_begin;
  settings.alt_speed_time_end = session_state.alt_speed_time_end;
  settings.alt_speed_time_day = session_state.alt_speed_time_day;
  switch (session_state.encryption) {
    case 1:
      settings.encryption = tt::engine::EncryptionMode::Preferred;
      break;
    case 2:
      settings.encryption = tt::engine::EncryptionMode::Required;
      break;
    default:
      settings.encryption = tt::engine::EncryptionMode::Tolerated;
      break;
  }
  settings.dht_enabled = session_state.dht_enabled;
  settings.pex_enabled = session_state.pex_enabled;
  settings.lpd_enabled = session_state.lpd_enabled;
  settings.utp_enabled = session_state.utp_enabled;
  settings.download_queue_size = session_state.download_queue_size;
  settings.seed_queue_size = session_state.seed_queue_size;
  settings.queue_stalled_enabled = session_state.queue_stalled_enabled;
  if (!session_state.incomplete_dir.empty()) {
    settings.incomplete_dir = std::filesystem::path(session_state.incomplete_dir);
  }
  settings.incomplete_dir_enabled = session_state.incomplete_dir_enabled;
  if (!session_state.watch_dir.empty()) {
    settings.watch_dir = std::filesystem::path(session_state.watch_dir);
  }
  settings.watch_dir_enabled = session_state.watch_dir_enabled;
  settings.seed_ratio_limit = session_state.seed_ratio_limit;
  settings.seed_ratio_enabled = session_state.seed_ratio_enabled;
  settings.seed_idle_limit_minutes = session_state.seed_idle_limit;
  settings.seed_idle_enabled = session_state.seed_idle_enabled;
  settings.proxy_type = session_state.proxy_type;
  settings.proxy_hostname = session_state.proxy_hostname;
  settings.proxy_port = session_state.proxy_port;
  settings.proxy_auth_enabled = session_state.proxy_auth_enabled;
  settings.proxy_username = session_state.proxy_username;
  settings.proxy_password = session_state.proxy_password;
  settings.proxy_peer_connections = session_state.proxy_peer_connections;
  settings.state_path = state_path;

  TT_LOG_INFO("Engine listen interface: {}", settings.listen_interface);

  auto engine = tt::engine::Core::create(settings);
  std::thread engine_thread([core = engine.get()] { core->run(); });
  TT_LOG_INFO("Engine thread started");

  tt::rpc::ServerOptions rpc_options;
  if (auto user = read_env("TT_RPC_BASIC_USERNAME");
      user.has_value()) {
    if (auto pass = read_env("TT_RPC_BASIC_PASSWORD"); pass.has_value()) {
      rpc_options.basic_auth = std::make_pair(*user, *pass);
    }
  }
  if (auto token = read_env("TT_RPC_TOKEN"); token.has_value()) {
    rpc_options.token = *token;
  }
  if (rpc_options.basic_auth || rpc_options.token) {
    TT_LOG_INFO("RPC authentication enabled");
  }
  tt::rpc::Server rpc(engine.get(), rpc_bind, rpc_options);
  rpc.start();
  TT_LOG_INFO("RPC layer ready; POST requests should hit {}/transmission/rpc",
              rpc_bind);

  tt::log::print_status("TinyTorrent daemon running; CTRL+C to stop.");

  while (keep_running.load(std::memory_order_relaxed)) {
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
  }

  TT_LOG_INFO("Shutdown requested; stopping RPC and engine...");
  rpc.stop();
  engine->stop();
  if (engine_thread.joinable()) {
    engine_thread.join();
  }

  tt::log::print_status("Shutdown complete.");
  TT_LOG_INFO("Shutdown complete.");
  return 0;
}

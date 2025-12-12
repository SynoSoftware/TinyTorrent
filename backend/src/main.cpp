#include "engine/Core.hpp"
#include "rpc/Server.hpp"
#include "utils/Endpoint.hpp"
#include "utils/FS.hpp"
#include "utils/Log.hpp"
#include "utils/Shutdown.hpp"
#include "utils/StateStore.hpp"

#include <algorithm>
#include <chrono>
#include <csignal>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <format>
#include <fstream>
#include <iterator>
#include <memory>
#include <optional>
#include <random>
#include <string>
#include <system_error>
#include <thread>
#include <utility>
#include <vector>

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#include <Aclapi.h>
#include <process.h>
#else
#include <unistd.h>
#endif

#if defined(_WIN32)
bool secure_connection_permissions(std::filesystem::path const &path) {
  if (path.empty()) {
    return false;
  }
  auto native_path = path.native();
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
    return false;
  }
  DWORD buffer_size = 0;
  GetTokenInformation(token, TokenUser, nullptr, 0, &buffer_size);
  if (buffer_size == 0) {
    CloseHandle(token);
    return false;
  }
  std::vector<BYTE> token_data(buffer_size);
  if (!GetTokenInformation(token, TokenUser, token_data.data(), buffer_size,
                           &buffer_size)) {
    CloseHandle(token);
    return false;
  }
  PSID user_sid = reinterpret_cast<PSID>(token_data.data());
  SID_IDENTIFIER_AUTHORITY nt_authority = SECURITY_NT_AUTHORITY;
  PSID system_sid = nullptr;
  if (!AllocateAndInitializeSid(&nt_authority, 1, SECURITY_LOCAL_SYSTEM_RID, 0, 0, 0,
                               0, 0, 0, 0, &system_sid)) {
    CloseHandle(token);
    return false;
  }
  EXPLICIT_ACCESSW entries[2];
  ZeroMemory(entries, sizeof(entries));
  entries[0].grfAccessPermissions = GENERIC_READ | GENERIC_WRITE | DELETE;
  entries[0].grfAccessMode = SET_ACCESS;
  entries[0].grfInheritance = NO_INHERITANCE;
  entries[0].Trustee.TrusteeForm = TRUSTEE_IS_SID;
  entries[0].Trustee.TrusteeType = TRUSTEE_IS_USER;
  entries[0].Trustee.ptstrName = reinterpret_cast<LPWSTR>(user_sid);
  entries[1].grfAccessPermissions = GENERIC_READ | GENERIC_WRITE | DELETE;
  entries[1].grfAccessMode = SET_ACCESS;
  entries[1].grfInheritance = NO_INHERITANCE;
  entries[1].Trustee.TrusteeForm = TRUSTEE_IS_SID;
  entries[1].Trustee.TrusteeType = TRUSTEE_IS_USER;
  entries[1].Trustee.ptstrName = reinterpret_cast<LPWSTR>(system_sid);
  PACL acl = nullptr;
  DWORD status =
      SetEntriesInAclW(2, entries, nullptr, &acl);
  if (status != ERROR_SUCCESS) {
    FreeSid(system_sid);
    CloseHandle(token);
    return false;
  }
  status = SetNamedSecurityInfoW(
      const_cast<LPWSTR>(native_path.c_str()), SE_FILE_OBJECT,
      DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, nullptr,
      nullptr, acl, nullptr);
  LocalFree(acl);
  FreeSid(system_sid);
  CloseHandle(token);
  return status == ERROR_SUCCESS;
}
#else
bool secure_connection_permissions(std::filesystem::path const &path) {
  std::error_code ec;
  std::filesystem::permissions(
      path,
      std::filesystem::perms::owner_read | std::filesystem::perms::owner_write,
      std::filesystem::perm_options::replace, ec);
  return !ec;
}
#endif

int main(int argc, char *argv[]) {
  std::signal(SIGINT, [](int) { tt::runtime::request_shutdown(); });
  std::signal(SIGTERM, [](int) { tt::runtime::request_shutdown(); });

  auto read_env = [](char const *key) -> std::optional<std::string> {
    auto value = std::getenv(key);
    if (value == nullptr) {
      return std::nullopt;
    }
    return std::string(value);
  };

  auto trim_whitespace = [](std::string value) -> std::string {
    auto begin = value.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos) {
      return {};
    }
    auto end = value.find_last_not_of(" \t\r\n");
    if (end == std::string::npos) {
      end = value.size() - 1;
    }
    return value.substr(begin, end - begin + 1);
  };

  auto parse_trusted_origins = [&](std::string const &raw) {
    std::vector<std::string> result;
    std::string buffer;
    buffer.reserve(raw.size());
    for (char ch : raw) {
      if (ch == ',' || ch == ';') {
        auto trimmed = trim_whitespace(buffer);
        if (!trimmed.empty()) {
          result.emplace_back(std::move(trimmed));
        }
        buffer.clear();
      } else {
        buffer.push_back(ch);
      }
    }
    auto trimmed = trim_whitespace(buffer);
    if (!trimmed.empty()) {
      result.emplace_back(std::move(trimmed));
    }
    return result;
  };

  auto generate_rpc_token = []() -> std::string {
    static constexpr char kHexDigits[] = "0123456789abcdef";
    std::mt19937_64 rng(static_cast<std::uint64_t>(
        std::chrono::high_resolution_clock::now().time_since_epoch().count()));
    std::uniform_int_distribution<std::uint64_t> dist;
    std::string token;
    token.reserve(32);
    while (token.size() < 32) {
      auto value = dist(rng);
      for (int bit = 0; bit < 16 && token.size() < 32; ++bit) {
        token.push_back(kHexDigits[value & 0xF]);
        value >>= 4;
      }
    }
    return token;
  };

  auto current_pid = []() -> std::uint64_t {
#if defined(_WIN32)
    return static_cast<std::uint64_t>(_getpid());
#else
    return static_cast<std::uint64_t>(getpid());
#endif
  };

  auto write_connection_file =
      [&](std::filesystem::path const &path,
          tt::rpc::ConnectionInfo const &info, std::uint64_t pid) {
        if (info.port == 0 || info.token.empty()) {
          return false;
        }
        auto payload = std::format(R"({{"port":{},"token":"{}","pid":{}}})",
                                   info.port, info.token, pid);
        auto tmp_path = path;
        tmp_path.replace_extension(".json.tmp");
        std::filesystem::create_directories(tmp_path.parent_path());
        std::ofstream output(tmp_path, std::ios::binary);
        if (!output) {
          return false;
        }
        output << payload;
        output.flush();
        output.close();
        std::error_code ec;
        std::filesystem::rename(tmp_path, path, ec);
        if (ec) {
          std::filesystem::remove(tmp_path, ec);
          return false;
        }
        return secure_connection_permissions(path);
      };

  auto root = tt::utils::data_root();
  auto download_path = root / "downloads";

  auto state_path = settings.state_path;
  if (state_path.empty()) {
    state_path = root / "tinytorrent.db";
  }
  settings.state_path = state_path;
  tt::storage::Database db(state_path);

  auto read_db_string = [&](char const *key) -> std::optional<std::string> {
    if (!db.is_valid()) {
      return std::nullopt;
    }
    return db.get_setting(key);
  };

  auto parse_int_value = [](std::optional<std::string> const &value) -> std::optional<int> {
    if (!value) {
      return std::nullopt;
    }
    try {
      return std::stoi(*value);
    } catch (...) {
      return std::nullopt;
    }
  };

  auto parse_double_value =
      [](std::optional<std::string> const &value) -> std::optional<double> {
    if (!value) {
      return std::nullopt;
    }
    try {
      return std::stod(*value);
    } catch (...) {
      return std::nullopt;
    }
  };

  auto parse_bool_value = [](std::optional<std::string> const &value) -> bool {
    if (!value) {
      return false;
    }
    auto const &content = *value;
    if (content == "1" || content == "true" || content == "True") {
      return true;
    }
    return false;
  };

  auto set_db_setting = [&](char const *key, std::string const &value) {
    if (db.is_valid()) {
      db.set_setting(key, value);
    }
  };

  std::string listen_interface =
      read_db_string("listenInterface").value_or("0.0.0.0:6881");
  if (auto env = read_env("TT_PEER_INTERFACE"); env) {
    listen_interface = *env;
  }
  if (auto env_port = read_env("TT_PEER_PORT"); env_port) {
    listen_interface = replace_endpoint_port(listen_interface, *env_port);
  }
  set_db_setting("listenInterface", listen_interface);

  std::string rpc_bind = read_db_string("rpcBind").value_or("http://127.0.0.1:0");
  if (auto env = read_env("TT_RPC_BIND"); env) {
    rpc_bind = *env;
  } else if (auto env_port = read_env("TT_RPC_PORT"); env_port) {
    rpc_bind = replace_url_port(rpc_bind, *env_port);
  }
  set_db_setting("rpcBind", rpc_bind);

  auto persisted_download =
      read_db_string("downloadPath").value_or(download_path.string());
  download_path = std::filesystem::path(persisted_download);
  std::filesystem::create_directories(download_path);
  set_db_setting("downloadPath", download_path.string());

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

  auto blocklist_dir = root / "blocklists";
  std::filesystem::create_directories(blocklist_dir);

  TT_LOG_INFO("Data root: {}", root.string());
  TT_LOG_INFO("Download path: {}", download_path.string());

  tt::engine::CoreSettings settings;
  settings.download_path = download_path;
  settings.listen_interface = listen_interface;
  settings.blocklist_path = blocklist_dir / "blocklist.txt";
  settings.download_rate_limit_kbps =
      parse_int_value(read_db_string("speedLimitDown")).value_or(0);
  settings.download_rate_limit_enabled =
      parse_bool_value(read_db_string("speedLimitDownEnabled"));
  settings.upload_rate_limit_kbps =
      parse_int_value(read_db_string("speedLimitUp")).value_or(0);
  settings.upload_rate_limit_enabled =
      parse_bool_value(read_db_string("speedLimitUpEnabled"));
  settings.peer_limit = parse_int_value(read_db_string("peerLimit")).value_or(0);
  settings.peer_limit_per_torrent =
      parse_int_value(read_db_string("peerLimitPerTorrent")).value_or(0);
  settings.alt_download_rate_limit_kbps =
      parse_int_value(read_db_string("altSpeedDown")).value_or(0);
  settings.alt_upload_rate_limit_kbps =
      parse_int_value(read_db_string("altSpeedUp")).value_or(0);
  settings.alt_speed_enabled =
      parse_bool_value(read_db_string("altSpeedEnabled"));
  settings.alt_speed_time_enabled =
      parse_bool_value(read_db_string("altSpeedTimeEnabled"));
  settings.alt_speed_time_begin =
      parse_int_value(read_db_string("altSpeedTimeBegin")).value_or(0);
  settings.alt_speed_time_end =
      parse_int_value(read_db_string("altSpeedTimeEnd")).value_or(0);
  settings.alt_speed_time_day =
      parse_int_value(read_db_string("altSpeedTimeDay")).value_or(0);
  switch (parse_int_value(read_db_string("encryption")).value_or(0)) {
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
  settings.dht_enabled = parse_bool_value(read_db_string("dhtEnabled"));
  settings.pex_enabled = parse_bool_value(read_db_string("pexEnabled"));
  settings.lpd_enabled = parse_bool_value(read_db_string("lpdEnabled"));
  settings.utp_enabled = parse_bool_value(read_db_string("utpEnabled"));
  settings.download_queue_size =
      parse_int_value(read_db_string("downloadQueueSize")).value_or(0);
  settings.seed_queue_size =
      parse_int_value(read_db_string("seedQueueSize")).value_or(0);
  settings.queue_stalled_enabled =
      parse_bool_value(read_db_string("queueStalledEnabled"));
  if (auto value = read_db_string("incompleteDir"); value && !value->empty()) {
    settings.incomplete_dir = std::filesystem::path(*value);
  }
  settings.incomplete_dir_enabled =
      parse_bool_value(read_db_string("incompleteDirEnabled"));
  if (auto value = read_db_string("watchDir"); value && !value->empty()) {
    settings.watch_dir = std::filesystem::path(*value);
  }
  settings.watch_dir_enabled =
      parse_bool_value(read_db_string("watchDirEnabled"));
  if (auto value = read_db_string("seedRatioLimit");
      auto parsed = parse_double_value(value)) {
    settings.seed_ratio_limit = *parsed;
  }
  settings.seed_ratio_enabled =
      parse_bool_value(read_db_string("seedRatioLimited"));
  settings.seed_idle_limit_minutes =
      parse_int_value(read_db_string("seedIdleLimit")).value_or(0);
  settings.seed_idle_enabled =
      parse_bool_value(read_db_string("seedIdleLimited"));
  settings.proxy_type = parse_int_value(read_db_string("proxyType")).value_or(0);
  if (auto value = read_db_string("proxyHost"); value) {
    settings.proxy_hostname = *value;
  }
  settings.proxy_port = parse_int_value(read_db_string("proxyPort")).value_or(0);
  settings.proxy_auth_enabled =
      parse_bool_value(read_db_string("proxyAuthEnabled"));
  if (auto value = read_db_string("proxyUsername"); value) {
    settings.proxy_username = *value;
  }
  if (auto value = read_db_string("proxyPassword"); value) {
    settings.proxy_password = *value;
  }
  settings.proxy_peer_connections =
      parse_bool_value(read_db_string("proxyPeerConnections"));
  settings.state_path = state_path;

  TT_LOG_INFO("Engine listen interface: {}", settings.listen_interface);

  auto engine = tt::engine::Core::create(settings);
  auto enqueue_startup_torrent = [&](std::string const &raw) {
    if (raw.empty()) {
      return;
    }
    std::string value(raw);
    std::string normalized(value);
    std::transform(normalized.begin(), normalized.end(), normalized.begin(),
                   [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
    tt::engine::TorrentAddRequest request;
    if (normalized.rfind("magnet:", 0) == 0) {
      request.uri = value;
    } else {
      std::filesystem::path candidate(value);
      if (candidate.empty()) {
        TT_LOG_INFO("startup torrent argument empty (ignored)");
        return;
      }
      if (!candidate.is_absolute()) {
        candidate = std::filesystem::absolute(candidate);
      }
      std::error_code ec;
      if (!std::filesystem::exists(candidate, ec) || ec) {
        TT_LOG_INFO("startup torrent {} not found ({})", candidate.string(),
                    ec.message());
        return;
      }
      std::ifstream input(candidate, std::ios::binary);
      if (!input) {
        TT_LOG_INFO("unable to read startup torrent {}", candidate.string());
        return;
      }
      std::vector<std::uint8_t> buffer(
          (std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
      if (buffer.empty()) {
        TT_LOG_INFO("startup torrent {} is empty", candidate.string());
        return;
      }
      request.metainfo = std::move(buffer);
    }
    request.download_path = settings.download_path;
    auto status = engine->enqueue_add_torrent(std::move(request));
    if (status != tt::engine::Core::AddTorrentStatus::Ok) {
      TT_LOG_INFO("startup torrent {} failed to queue", value);
    } else {
      TT_LOG_INFO("startup torrent queued from {}", value);
    }
  };
  auto enqueue_startup_args = [&](int argc, char *argv[]) {
    for (int index = 1; index < argc; ++index) {
      enqueue_startup_torrent(argv[index]);
    }
  };
  std::thread engine_thread([core = engine.get()] { core->run(); });
  TT_LOG_INFO("Engine thread started");
  if (argc > 1) {
    enqueue_startup_args(argc, argv);
  }

  tt::rpc::ServerOptions rpc_options;
  if (auto user = read_env("TT_RPC_BASIC_USERNAME"); user) {
    if (auto pass = read_env("TT_RPC_BASIC_PASSWORD"); pass) {
      rpc_options.basic_auth = std::make_pair(*user, *pass);
    }
  }
  std::string rpc_token;
  if (auto token = read_env("TT_RPC_TOKEN"); token) {
    rpc_token = *token;
  } else {
    rpc_token = generate_rpc_token();
  }
  rpc_options.token = rpc_token;
  if (auto origins = read_env("TT_RPC_TRUSTED_ORIGINS"); origins) {
    auto parsed = parse_trusted_origins(*origins);
    if (!parsed.empty()) {
      rpc_options.trusted_origins = std::move(parsed);
    }
  }
  TT_LOG_INFO("RPC authentication enforced; connection.json contains credentials.");
  tt::rpc::Server rpc(engine.get(), rpc_bind, rpc_options);
  rpc.start();
  auto connection_info = rpc.connection_info();
  auto connection_file = root / "connection.json";
  if (connection_info) {
    if (write_connection_file(connection_file, *connection_info, current_pid())) {
      TT_LOG_INFO("RPC listening on port {}; connection info saved to {}",
                  connection_info->port, connection_file.string());
    } else {
      TT_LOG_INFO("Failed to write connection info to {}",
                  connection_file.string());
    }
  } else {
    TT_LOG_INFO("Connection info unavailable; secure launcher cannot start.");
  }
  TT_LOG_INFO("RPC layer ready; POST requests should hit {}{}",
              rpc_bind, rpc_options.rpc_path);

  tt::log::print_status("TinyTorrent daemon running; CTRL+C to stop.");

  while (!tt::runtime::should_shutdown()) {
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

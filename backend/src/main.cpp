#include "app/DaemonMain.hpp"
#include "engine/Core.hpp"
#include "rpc/Server.hpp"
#include "utils/Endpoint.hpp"
#include "utils/FS.hpp"
#include "utils/Log.hpp"
#include "utils/Shutdown.hpp"
#include "utils/StateStore.hpp"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <csignal>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <exception>
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
#include <Aclapi.h>
#include <Windows.h>
#include <process.h>
#else
#include <unistd.h>
#endif

#ifdef max
#undef max
#endif
#ifdef min
#undef min
#endif

namespace
{

std::string replace_endpoint_port(std::string value, std::string const &port)
{
    if (value.empty() || port.empty())
    {
        return value;
    }
    auto parts = tt::net::parse_host_port(value);
    parts.port = port;
    return tt::net::format_host_port(parts);
}

std::string replace_url_port(std::string url, std::string const &port)
{
    if (url.empty() || port.empty())
    {
        return url;
    }
    auto scheme = url.find("://");
    auto host_start = (scheme == std::string::npos) ? 0 : scheme + 3;
    auto host_end = url.find('/', host_start);
    std::string host_port = host_end == std::string::npos
                                ? url.substr(host_start)
                                : url.substr(host_start, host_end - host_start);
    if (host_port.empty())
    {
        return url;
    }
    auto replaced = replace_endpoint_port(host_port, port);
    if (host_end == std::string::npos)
    {
        return url.substr(0, host_start) + replaced;
    }
    return url.substr(0, host_start) + replaced + url.substr(host_end);
}

std::string replace_rpc_bind_host(std::string bind, std::string const &host)
{
    if (bind.empty() || host.empty())
    {
        return bind;
    }
    auto scheme = bind.find("://");
    auto host_start = (scheme == std::string::npos) ? 0 : scheme + 3;
    auto host_end = bind.find('/', host_start);
    std::string prefix = bind.substr(0, host_start);
    std::string suffix =
        (host_end == std::string::npos) ? std::string() : bind.substr(host_end);
    std::string host_port;
    if (host_end == std::string::npos)
    {
        host_port = bind.substr(host_start);
    }
    else
    {
        host_port = bind.substr(host_start, host_end - host_start);
    }
    auto parts = tt::net::parse_host_port(host_port);
    tt::net::HostPort updated;
    updated.host = host;
    updated.port = parts.port;
    updated.bracketed = tt::net::is_ipv6_literal(host);
    return prefix + tt::net::format_host_port(updated) + suffix;
}

bool enforce_loopback_bind(std::string &bind)
{
    auto [host, port] = tt::net::parse_rpc_bind(bind);
    if (host.empty() || !tt::net::is_loopback_host(host))
    {
        constexpr char kFallbackHost[] = "127.0.0.1";
        if (host.empty())
        {
#if defined(TT_BUILD_DEBUG)
            TT_LOG_INFO("RPC bind missing host; defaulting to {}", kFallbackHost);
#else
            TT_LOG_INFO("RPC bind missing host; forcing {} for security",
                        kFallbackHost);
#endif
        }
#if defined(TT_BUILD_DEBUG)
        if (!host.empty())
        {
            TT_LOG_INFO("Allowing non-loopback RPC bind host {} in debug mode",
                        host);
            return true;
        }
#else
        if (!host.empty())
        {
            TT_LOG_INFO("RPC bind host {} is not loopback; forcing {} for security",
                        host, kFallbackHost);
        }
#endif
        bind = replace_rpc_bind_host(bind, kFallbackHost);
        return true;
    }
    return true;
}

} // namespace

#if defined(_WIN32)
bool secure_connection_permissions(std::filesystem::path const &path)
{
    if (path.empty())
    {
        return false;
    }
    auto native_path = path.native();
    HANDLE token = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token))
    {
        return false;
    }
    DWORD buffer_size = 0;
    GetTokenInformation(token, TokenUser, nullptr, 0, &buffer_size);
    if (buffer_size == 0)
    {
        CloseHandle(token);
        return false;
    }
    std::vector<BYTE> token_data(buffer_size);
    if (!GetTokenInformation(token, TokenUser, token_data.data(), buffer_size,
                             &buffer_size))
    {
        CloseHandle(token);
        return false;
    }
    PSID user_sid = reinterpret_cast<PSID>(token_data.data());
    EXPLICIT_ACCESSW entry{};
    entry.grfAccessPermissions = GENERIC_READ | GENERIC_WRITE | DELETE;
    entry.grfAccessMode = SET_ACCESS;
    entry.grfInheritance = NO_INHERITANCE;
    entry.Trustee.TrusteeForm = TRUSTEE_IS_SID;
    entry.Trustee.TrusteeType = TRUSTEE_IS_USER;
    entry.Trustee.ptstrName = reinterpret_cast<LPWSTR>(user_sid);
    PACL acl = nullptr;
    DWORD status = SetEntriesInAclW(1, &entry, nullptr, &acl);
    if (status != ERROR_SUCCESS)
    {
        CloseHandle(token);
        return false;
    }
    status = SetNamedSecurityInfoW(
        const_cast<LPWSTR>(native_path.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
        nullptr, nullptr, acl, nullptr);
    LocalFree(acl);
    CloseHandle(token);
    return status == ERROR_SUCCESS;
}
#else
bool secure_connection_permissions(std::filesystem::path const &path)
{
    std::error_code ec;
    std::filesystem::permissions(path,
                                 std::filesystem::perms::owner_read |
                                     std::filesystem::perms::owner_write,
                                 std::filesystem::perm_options::replace, ec);
    return !ec;
}
#endif

namespace tt::app
{

int daemon_main(int argc, char *argv[],
                std::promise<tt::rpc::ConnectionInfo> *ready_promise)
{
    try
    {
        std::signal(SIGINT, [](int) { tt::runtime::request_shutdown(); });
        std::signal(SIGTERM, [](int) { tt::runtime::request_shutdown(); });

        auto read_env = [](char const *key) -> std::optional<std::string>
        {
            auto value = std::getenv(key);
            if (value == nullptr)
            {
                return std::nullopt;
            }
            return std::string(value);
        };

        auto trim_whitespace = [](std::string value) -> std::string
        {
            auto begin = value.find_first_not_of(" \t\r\n");
            if (begin == std::string::npos)
            {
                return {};
            }
            auto end = value.find_last_not_of(" \t\r\n");
            if (end == std::string::npos)
            {
                end = value.size() - 1;
            }
            return value.substr(begin, end - begin + 1);
        };

        auto parse_trusted_origins = [&](std::string const &raw)
        {
            std::vector<std::string> result;
            std::string buffer;
            buffer.reserve(raw.size());
            for (char ch : raw)
            {
                if (ch == ',' || ch == ';')
                {
                    auto trimmed = trim_whitespace(buffer);
                    if (!trimmed.empty())
                    {
                        result.emplace_back(std::move(trimmed));
                    }
                    buffer.clear();
                }
                else
                {
                    buffer.push_back(ch);
                }
            }
            auto trimmed = trim_whitespace(buffer);
            if (!trimmed.empty())
            {
                result.emplace_back(std::move(trimmed));
            }
            return result;
        };

        auto generate_rpc_token = []() -> std::string
        {
            static constexpr char kHexDigits[] = "0123456789abcdef";
            thread_local std::mt19937_64 rng(std::random_device{}());
            std::uniform_int_distribution<std::uint64_t> dist;
            std::string token;
            token.reserve(32);
            while (token.size() < 32)
            {
                auto value = dist(rng);
                for (int bit = 0; bit < 16 && token.size() < 32; ++bit)
                {
                    token.push_back(kHexDigits[value & 0xF]);
                    value >>= 4;
                }
            }
            return token;
        };

        auto current_pid = []() -> std::uint64_t
        {
#if defined(_WIN32)
            return static_cast<std::uint64_t>(_getpid());
#else
            return static_cast<std::uint64_t>(getpid());
#endif
        };

        auto write_connection_file = [&](std::filesystem::path const &path,
                                         tt::rpc::ConnectionInfo const &info,
                                         std::uint64_t pid)
        {
#if defined(TT_BUILD_DEBUG)
            if (info.port == 0)
            {
                return false;
            }
#else
            if (info.port == 0 || info.token.empty())
            {
                return false;
            }
#endif
            auto payload = std::format(R"({{"port":{},"token":"{}","pid":{}}})",
                                       info.port, info.token, pid);
            auto tmp_path = path;
            tmp_path.replace_extension(".json.tmp");
            std::filesystem::create_directories(tmp_path.parent_path());
            std::ofstream output(tmp_path, std::ios::binary);
            if (!output)
            {
                return false;
            }
            if (!secure_connection_permissions(tmp_path))
            {
                TT_LOG_INFO("unable to secure {}", tmp_path.string());
                // Continue even if securing ACLs failed; fall back to writing
                // the file so developers can still connect in non-privileged
                // environments. This avoids hard-failing on platforms where
                // SetNamedSecurityInfoW may not succeed for new files.
            }
            output << payload;
            output.flush();
            output.close();
            if (!secure_connection_permissions(tmp_path))
            {
                TT_LOG_INFO("unable to secure {}", tmp_path.string());
                // Log and continue; do not remove the temp file.
            }
            std::error_code remove_ec;
            std::filesystem::remove(path, remove_ec);
            if (remove_ec && remove_ec != std::errc::no_such_file_or_directory)
            {
                TT_LOG_INFO("failed to remove stale connection file {}: {}",
                            path.string(), remove_ec.message());
            }
            std::error_code ec;
            std::filesystem::rename(tmp_path, path, ec);
            if (ec)
            {
                std::filesystem::remove(tmp_path, ec);
                return false;
            }
            if (!secure_connection_permissions(path))
            {
                TT_LOG_INFO("unable to secure {}", path.string());
            }
            return true;
         };

        auto root = tt::utils::data_root();
        auto download_path = root / "downloads";

        tt::engine::CoreSettings settings;

        auto state_path = settings.state_path;
        if (state_path.empty())
        {
            state_path = root / "tinytorrent.db";
        }
        settings.state_path = state_path;
        tt::storage::Database db(state_path);

        auto read_db_string = [&](char const *key) -> std::optional<std::string>
        {
            if (!db.is_valid())
            {
                return std::nullopt;
            }
            return db.get_setting(key);
        };

        auto parse_int_value =
            [](std::optional<std::string> const &value) -> std::optional<int>
        {
            if (!value)
            {
                return std::nullopt;
            }
            try
            {
                return std::stoi(*value);
            }
            catch (...)
            {
                return std::nullopt;
            }
        };

        auto parse_double_value =
            [](std::optional<std::string> const &value) -> std::optional<double>
        {
            if (!value)
            {
                return std::nullopt;
            }
            try
            {
                return std::stod(*value);
            }
            catch (...)
            {
                return std::nullopt;
            }
        };

        auto parse_bool_value =
            [](std::optional<std::string> const &value) -> bool
        {
            if (!value)
            {
                return false;
            }
            auto const &content = *value;
            if (content == "1" || content == "true" || content == "True")
            {
                return true;
            }
            return false;
        };

        auto path_to_utf8 = [](std::filesystem::path const &path) -> std::string
        {
            auto value = path.u8string();
            return std::string(value.begin(), value.end());
        };

        auto set_db_setting = [&](char const *key, std::string const &value)
        {
            if (db.is_valid())
            {
                db.set_setting(key, value);
            }
        };

        auto ensure_directory = [&](std::filesystem::path const &path,
                                    char const *description) -> bool
        {
            std::error_code ec;
            std::filesystem::create_directories(path, ec);
            if (ec)
            {
                TT_LOG_ERROR("Failed to create {} ({}): {}", description,
                             path.string(), ec.message());
                return false;
            }
            return true;
        };

        std::string listen_interface =
            read_db_string("listenInterface").value_or("0.0.0.0:6881");
        if (auto env = read_env("TT_PEER_INTERFACE"); env)
        {
            listen_interface = *env;
        }
        if (auto env_port = read_env("TT_PEER_PORT"); env_port)
        {
            listen_interface =
                replace_endpoint_port(listen_interface, *env_port);
        }
        set_db_setting("listenInterface", listen_interface);

        std::string rpc_bind =
            read_db_string("rpcBind").value_or("http://127.0.0.1:0");
        if (auto env = read_env("TT_RPC_BIND"); env)
        {
            rpc_bind = *env;
        }
        else if (auto env_port = read_env("TT_RPC_PORT"); env_port)
        {
            rpc_bind = replace_url_port(rpc_bind, *env_port);
        }
        enforce_loopback_bind(rpc_bind);
        set_db_setting("rpcBind", rpc_bind);

        auto persisted_download = read_db_string("downloadPath");
        if (persisted_download && !persisted_download->empty())
        {
            download_path = std::filesystem::u8path(*persisted_download);
        }
        if (!ensure_directory(download_path, "download path"))
        {
            download_path = root / "downloads";
            ensure_directory(download_path, "default download path");
        }
        set_db_setting("downloadPath", path_to_utf8(download_path));

        auto blocklist_dir = root / "blocklists";
        ensure_directory(blocklist_dir, "blocklist directory");

        TT_LOG_INFO("Data root: {}", root.string());
        TT_LOG_INFO("Download path: {}", download_path.string());

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
        settings.peer_limit =
            parse_int_value(read_db_string("peerLimit")).value_or(0);
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
        switch (parse_int_value(read_db_string("encryption")).value_or(0))
        {
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
        if (auto value = read_db_string("incompleteDir");
            value && !value->empty())
        {
            settings.incomplete_dir = std::filesystem::u8path(*value);
        }
        settings.incomplete_dir_enabled =
            parse_bool_value(read_db_string("incompleteDirEnabled"));
        if (auto value = read_db_string("watchDir"); value && !value->empty())
        {
            settings.watch_dir = std::filesystem::u8path(*value);
        }
        settings.watch_dir_enabled =
            parse_bool_value(read_db_string("watchDirEnabled"));
        settings.rename_partial_files =
            parse_bool_value(read_db_string("renamePartialFiles"));
        if (auto value = read_db_string("seedRatioLimit");
            auto parsed = parse_double_value(value))
        {
            settings.seed_ratio_limit = *parsed;
        }
        settings.seed_ratio_enabled =
            parse_bool_value(read_db_string("seedRatioLimited"));
        settings.seed_idle_limit_minutes =
            parse_int_value(read_db_string("seedIdleLimit")).value_or(0);
        settings.seed_idle_enabled =
            parse_bool_value(read_db_string("seedIdleLimited"));
        settings.proxy_type =
            parse_int_value(read_db_string("proxyType")).value_or(0);
        if (auto value = read_db_string("proxyHost"); value)
        {
            settings.proxy_hostname = *value;
        }
        settings.proxy_port =
            parse_int_value(read_db_string("proxyPort")).value_or(0);
        settings.proxy_auth_enabled =
            parse_bool_value(read_db_string("proxyAuthEnabled"));
        if (auto value = read_db_string("proxyUsername"); value)
        {
            settings.proxy_username = *value;
        }
        if (auto value = read_db_string("proxyPassword"); value)
        {
            settings.proxy_password = *value;
        }
        settings.proxy_peer_connections =
            parse_bool_value(read_db_string("proxyPeerConnections"));
        if (auto value = parse_int_value(read_db_string("engineDiskCache")))
        {
            settings.disk_cache_mb = std::max(1, *value);
        }
        if (auto value =
                parse_int_value(read_db_string("engineHashingThreads")))
        {
            settings.hashing_threads = std::max(1, *value);
        }
        if (auto value = parse_int_value(read_db_string("queueStalledMinutes")))
        {
            settings.queue_stalled_minutes = std::max(0, *value);
        }
        if (auto value = read_db_string("historyEnabled"); value)
        {
            settings.history_enabled = parse_bool_value(value);
        }
        if (auto value = parse_int_value(read_db_string("historyInterval")))
        {
            settings.history_interval_seconds = std::max(60, *value);
        }
        if (auto value =
                parse_int_value(read_db_string("historyRetentionDays")))
        {
            settings.history_retention_days = std::max(0, *value);
        }
        set_db_setting("historyEnabled", settings.history_enabled ? "1" : "0");
        set_db_setting("historyInterval",
                       std::to_string(settings.history_interval_seconds));
        set_db_setting("historyRetentionDays",
                       std::to_string(settings.history_retention_days));
        set_db_setting("renamePartialFiles",
                       settings.rename_partial_files ? "1" : "0");
        settings.state_path = state_path;

        TT_LOG_INFO("Engine listen interface: {}", settings.listen_interface);

        // Diagnostic: print key settings values before creating engine (helps
        // debug AddressSanitizer crashes during startup)

#if 0
    std::fprintf(stderr, "[diag] settings.listen_interface='%s' len=%zu\n",
                 settings.listen_interface.c_str(),
                 settings.listen_interface.size());
    std::fprintf(stderr, "[diag] settings.proxy_hostname='%s' len=%zu\n",
                 settings.proxy_hostname.c_str(),
                 settings.proxy_hostname.size());
    std::fprintf(stderr, "[diag] settings.proxy_username='%s' len=%zu\n",
                 settings.proxy_username.c_str(),
                 settings.proxy_username.size());
#endif

        auto engine = tt::engine::Core::create(settings);
        auto enqueue_startup_torrent = [&](std::string const &raw)
        {
            if (raw.empty())
            {
                return;
            }
            std::string value(raw);
            std::string normalized(value);
            std::transform(normalized.begin(), normalized.end(),
                           normalized.begin(), [](unsigned char ch)
                           { return static_cast<char>(std::tolower(ch)); });
            tt::engine::TorrentAddRequest request;
            if (normalized.rfind("magnet:", 0) == 0)
            {
                request.uri = value;
            }
            else
            {
                std::filesystem::path candidate(value);
                if (candidate.empty())
                {
                    TT_LOG_INFO("startup torrent argument empty (ignored)");
                    return;
                }
                if (!candidate.is_absolute())
                {
                    candidate = std::filesystem::absolute(candidate);
                }
                std::error_code ec;
                if (!std::filesystem::exists(candidate, ec) || ec)
                {
                    TT_LOG_INFO("startup torrent {} not found ({})",
                                candidate.string(), ec.message());
                    return;
                }
                std::ifstream input(candidate, std::ios::binary);
                if (!input)
                {
                    TT_LOG_INFO("unable to read startup torrent {}",
                                candidate.string());
                    return;
                }
                std::vector<std::uint8_t> buffer(
                    (std::istreambuf_iterator<char>(input)),
                    std::istreambuf_iterator<char>());
                if (buffer.empty())
                {
                    TT_LOG_INFO("startup torrent {} is empty",
                                candidate.string());
                    return;
                }
                request.metainfo = std::move(buffer);
            }
            request.download_path = settings.download_path;
            auto status = engine->enqueue_add_torrent(std::move(request));
            if (status != tt::engine::Core::AddTorrentStatus::Ok)
            {
                TT_LOG_INFO("startup torrent {} failed to queue", value);
            }
            else
            {
                TT_LOG_INFO("startup torrent queued from {}", value);
            }
        };
        auto enqueue_startup_args = [&](int argc, char *argv[])
        {
            for (int index = 1; index < argc; ++index)
            {
                // Skip CLI flags (e.g. --run-seconds=10) from being treated
                // as startup torrent arguments. Also skip arguments that
                // start with '/', or a stray '\' to be defensive on Windows.
                if (argv[index] &&
                    (argv[index][0] == '-' || argv[index][0] == '/' ||
                     argv[index][0] == '\\'))
                {
                    continue;
                }
                enqueue_startup_torrent(argv[index]);
            }
        };
        int run_seconds = 0;
        // Parse a debug flag: support both "--run-seconds=N" and
        // "--run-seconds N". If provided without a number, default to 5s.
        for (int index = 1; index < argc; ++index)
        {
            if (argv[index] == nullptr)
                continue;
            std::string arg = argv[index];
            if (arg.rfind("--run-seconds=", 0) == 0)
            {
                auto val = arg.substr(14);
                if (val.empty())
                {
                    run_seconds = 5;
                }
                else
                {
                    try
                    {
                        run_seconds = std::stoi(val);
                    }
                    catch (...)
                    {
                        run_seconds = 0;
                    }
                }
            }
            else if (arg == "--run-seconds")
            {
                if (index + 1 < argc && argv[index + 1] &&
                    argv[index + 1][0] != '-')
                {
                    try
                    {
                        run_seconds = std::stoi(argv[index + 1]);
                    }
                    catch (...)
                    {
                        run_seconds = 5;
                    }
                }
                else
                {
                    run_seconds = 5;
                }
            }
        }

        // (Timer will be started after RPC is ready to ensure predictable
        // behavior and to measure service run time from readiness.)
        std::thread engine_thread([core = engine.get()] { core->run(); });
        TT_LOG_INFO("Engine thread started");
        if (argc > 1)
        {
            enqueue_startup_args(argc, argv);
        }

        tt::rpc::ServerOptions rpc_options;
        if (auto user = read_env("TT_RPC_BASIC_USERNAME"); user)
        {
            if (auto pass = read_env("TT_RPC_BASIC_PASSWORD"); pass)
            {
                rpc_options.basic_auth = std::make_pair(*user, *pass);
            }
        }
#if defined(TT_BUILD_DEBUG)
        std::string rpc_token;
        if (auto token = read_env("TT_RPC_TOKEN"); token)
        {
            rpc_token = *token;
        }
        else
        {
            rpc_token = generate_rpc_token();
        }
#else
        std::string rpc_token = generate_rpc_token();
        if (auto token = read_env("TT_RPC_TOKEN"); token)
        {
            TT_LOG_INFO("Ignoring TT_RPC_TOKEN override in release mode for security");
        }
#endif
#if !defined(TT_BUILD_DEBUG)
        rpc_options.token = rpc_token;
#endif
        if (auto origins = read_env("TT_RPC_TRUSTED_ORIGINS"); origins)
        {
            auto parsed = parse_trusted_origins(*origins);
            if (!parsed.empty())
            {
                rpc_options.trusted_origins = std::move(parsed);
            }
        }
#if defined(TT_BUILD_DEBUG)
        rpc_options.force_debug_port = true;
#endif
        // In debug builds we avoid requiring an RPC token so developers can
        // connect locally without extra credentials. Production builds still
        // enforce token-based auth and will place credentials in
        // connection.json.
#if defined(TT_BUILD_DEBUG)
        TT_LOG_INFO(
            "RPC authentication disabled in debug build; no token required.");
#else
        TT_LOG_INFO("RPC authentication enforced; connection.json contains "
                    "credentials.");
#endif
        tt::rpc::Server rpc(engine.get(), rpc_bind, rpc_options);
        rpc.start();

        // Wait briefly for the RPC listener to pick an ephemeral port
        // (when binding to :0). The mongoose listener may finalize the
        // assigned port slightly after mg_http_listen returns; poll for up
        // to 1s for the server to fill in the connection info.
        std::optional<tt::rpc::ConnectionInfo> connection_info;
        for (int attempt = 0; attempt < 20 && !tt::runtime::should_shutdown();
             ++attempt)
        {
            connection_info = rpc.connection_info();
            if (connection_info && connection_info->port != 0)
            {
                break;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }
        auto connection_file = root / "connection.json";
        if (connection_info)
        {
            if (ready_promise)
            {
                ready_promise->set_value(*connection_info);
            }
            if (write_connection_file(connection_file, *connection_info,
                                      current_pid()))
            {
                TT_LOG_INFO(
                    "RPC listening on port {}; connection info saved to {}",
                    connection_info->port, connection_file.string());
            }
            else
            {
                TT_LOG_INFO("Failed to write connection info to {}",
                            connection_file.string());
            }
        }
        else
        {
            TT_LOG_INFO(
                "Connection info unavailable; secure launcher cannot start.");
        }

        // Log the actual RPC URL clients should use. If we obtained a
        // resolved port from the listener, replace the bind URL's port so
        // logs show the real, non-zero ephemeral port instead of ":0".
        std::string display_bind = rpc_bind;
        if (connection_info && connection_info->port != 0)
        {
            display_bind = replace_url_port(
                rpc_bind, std::to_string(connection_info->port));
        }
        TT_LOG_INFO("RPC layer ready; POST requests should hit {}{}",
                    display_bind, rpc_options.rpc_path);

        // Auto-shutdown for debugging when requested via --run-seconds=N.
        if (run_seconds > 0)
        {
            std::thread(
                [run_seconds]()
                {
                    std::this_thread::sleep_for(
                        std::chrono::seconds(run_seconds));
                    TT_LOG_INFO("Auto shutdown: run-seconds={} reached, "
                                "requesting shutdown",
                                run_seconds);
                    tt::runtime::request_shutdown();
                })
                .detach();
        }

        tt::log::print_status("TinyTorrent daemon running; CTRL+C to stop.");

        while (!tt::runtime::should_shutdown())
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }

        TT_LOG_INFO("Shutdown requested; stopping RPC and engine...");
        // 1. Stop accepting new network requests
        rpc.stop();

        // 2. Stop engine and DRAIN ALL TASKS while 'rpc' is still alive
        engine->stop();

        // 3. Explicitly destroy the engine now so its destructor runs while
        //    'rpc' (stack variable) is still valid. This avoids callbacks from
        //    engine tasks hitting a destroyed RPC object during shutdown.
        engine.reset();

        if (engine_thread.joinable())
        {
            engine_thread.join();
        }

        tt::log::print_status("Shutdown complete.");
        TT_LOG_INFO("Shutdown complete.");
        return 0;
    }
    catch (std::exception const &ex)
    {
        std::fprintf(stderr, "TinyTorrent daemon failed: %s\n", ex.what());
        tt::log::print_status("TinyTorrent daemon failed: %s", ex.what());
    }
    catch (...)
    {
        std::fprintf(stderr, "TinyTorrent daemon failed: unknown exception\n");
        tt::log::print_status("TinyTorrent daemon failed: unknown exception");
    }
    return 1;
}

} // namespace tt::app

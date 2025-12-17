#include "rpc/Server.hpp"

#include "rpc/Serializer.hpp"
#include "utils/Endpoint.hpp"
#include "utils/Log.hpp"
#include "utils/Shutdown.hpp"

#if defined(_WIN32)
#include <winsock2.h>
#else
#include <arpa/inet.h>
#endif

#include "vendor/mongoose.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <exception>
#include <future>
#include <limits>
#include <memory>
#include <optional>
#include <random>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

namespace
{
constexpr std::size_t kMaxHttpPayloadSize = 1 << 20;
constexpr std::uintmax_t kMaxWatchFileSize = 64ull * 1024 * 1024;

std::string generate_session_id()
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
}

std::optional<std::vector<std::uint8_t>> decode_base64(std::string_view input)
{
    static constexpr char kAlphabet[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    static const std::array<int8_t, 256> kLookup = []
    {
        std::array<int8_t, 256> table{};
        table.fill(-1);
        for (int i = 0; kAlphabet[i] != '\0'; ++i)
        {
            table[static_cast<std::size_t>(kAlphabet[i])] =
                static_cast<int8_t>(i);
        }
        return table;
    }();

    std::vector<std::uint8_t> result;
    result.reserve((input.size() * 3) / 4);
    unsigned buffer = 0;
    int bits_collected = 0;
    for (char ch : input)
    {
        if (std::isspace(static_cast<unsigned char>(ch)))
        {
            continue;
        }
        if (ch == '=')
        {
            break;
        }
        auto value = kLookup[static_cast<unsigned char>(ch)];
        if (value < 0)
        {
            return std::nullopt;
        }
        buffer = (buffer << 6) | static_cast<unsigned>(value);
        bits_collected += 6;
        if (bits_collected >= 8)
        {
            bits_collected -= 8;
            result.push_back(
                static_cast<std::uint8_t>((buffer >> bits_collected) & 0xFF));
        }
    }
    return result;
}

std::optional<std::string> decode_basic_credentials(std::string_view header)
{
    static constexpr std::string_view prefix = "Basic ";
    if (!header.starts_with(prefix))
    {
        return std::nullopt;
    }
    auto payload = header.substr(prefix.size());
    auto decoded = decode_base64(payload);
    if (!decoded)
    {
        return std::nullopt;
    }
    return std::string(decoded->begin(), decoded->end());
}

constexpr std::array<std::string_view, 5> kLoopbackHosts = {
    "127.0.0.1", "localhost", "[::1]", "::1", "0:0:0:0:0:0:0:1"};
constexpr char kLegacyTokenHeader[] = "X-TinyTorrent-Token";
constexpr auto kWebsocketPatchInterval = std::chrono::milliseconds(500);
constexpr auto kWebsocketPingInterval = std::chrono::seconds(15);

std::optional<std::string> header_value(struct mg_http_message *hm,
                                        char const *name)
{
    if (hm == nullptr)
    {
        return std::nullopt;
    }
    auto *header = mg_http_get_header(hm, name);
    if (header == nullptr)
    {
        return std::nullopt;
    }
    return std::string(header->buf, header->len);
}

std::string lowercase(std::string value)
{
    std::transform(value.begin(), value.end(), value.begin(),
                   [](unsigned char ch)
                   { return static_cast<char>(std::tolower(ch)); });
    return value;
}

std::string canonicalize_host(std::string host)
{
    auto start = host.find_first_not_of(" \t\r\n");
    if (start == std::string::npos)
    {
        return {};
    }
    auto end = host.find_last_not_of(" \t\r\n");
    host = host.substr(start, end - start + 1);
    if (host.empty())
    {
        return {};
    }
    if (host.front() == '[')
    {
        auto closing = host.find(']');
        if (closing != std::string::npos)
        {
            return lowercase(host.substr(0, closing + 1));
        }
        return lowercase(host);
    }
    auto colon = host.rfind(':');
    if (colon != std::string::npos && host.find(':') == colon)
    {
        host.resize(colon);
    }
    if (host.empty())
    {
        return {};
    }
    return lowercase(host);
}

std::optional<std::string> normalized_host(struct mg_http_message *hm)
{
    if (auto value = header_value(hm, "Host"))
    {
        auto normalized = canonicalize_host(std::move(*value));
        if (!normalized.empty())
        {
            return normalized;
        }
    }
    return std::nullopt;
}

bool host_allowed(std::string const &host,
                  std::vector<std::string> const &allowed_hosts)
{
    if (host.empty())
    {
        return false;
    }
    if (!allowed_hosts.empty())
    {
        return std::any_of(allowed_hosts.begin(), allowed_hosts.end(),
                           [&](std::string const &candidate)
                           { return host == candidate; });
    }
    return std::any_of(kLoopbackHosts.begin(), kLoopbackHosts.end(),
                       [&](std::string_view candidate)
                       { return host == candidate; });
}

bool origin_allowed(struct mg_http_message *hm,
                    tt::rpc::ServerOptions const &options)
{
    if (options.trusted_origins.empty())
    {
        return true;
    }
    auto origin = header_value(hm, "Origin");
    if (!origin)
    {
        return true;
    }
    for (auto const &candidate : options.trusted_origins)
    {
        if (origin->compare(candidate) == 0)
        {
            return true;
        }
    }
    return false;
}

std::optional<std::string> websocket_token(struct mg_http_message *hm)
{
    if (hm == nullptr)
    {
        return std::nullopt;
    }
    char buffer[128] = {};
    int len = mg_http_get_var(&hm->query, "token", buffer, sizeof(buffer));
    if (len <= 0)
    {
        return std::nullopt;
    }
    return std::string(buffer, static_cast<std::size_t>(len));
}

bool session_snapshot_equal(tt::engine::SessionSnapshot const &a,
                            tt::engine::SessionSnapshot const &b)
{
    return a.download_rate == b.download_rate &&
           a.upload_rate == b.upload_rate &&
           a.torrent_count == b.torrent_count &&
           a.active_torrent_count == b.active_torrent_count &&
           a.paused_torrent_count == b.paused_torrent_count &&
           a.dht_nodes == b.dht_nodes;
}

struct SnapshotDiff
{
    std::vector<int> removed;
    std::vector<tt::engine::TorrentSnapshot> added;
    std::vector<
        std::pair<tt::engine::TorrentSnapshot, tt::engine::TorrentSnapshot>>
        updated;
    std::vector<int> finished;
    bool session_changed = false;
};

SnapshotDiff compute_diff(tt::engine::SessionSnapshot const &previous,
                          tt::engine::SessionSnapshot const &current)
{
    SnapshotDiff diff;
    diff.session_changed = !session_snapshot_equal(previous, current);
    std::unordered_map<int, tt::engine::TorrentSnapshot> previous_map;
    previous_map.reserve(previous.torrents.size());
    for (auto const &torrent : previous.torrents)
    {
        previous_map.emplace(torrent.id, torrent);
    }
    std::unordered_map<int, tt::engine::TorrentSnapshot> current_map;
    current_map.reserve(current.torrents.size());
    for (auto const &torrent : current.torrents)
    {
        current_map.emplace(torrent.id, torrent);
    }
    for (auto const &torrent : previous.torrents)
    {
        if (current_map.find(torrent.id) == current_map.end())
        {
            diff.removed.push_back(torrent.id);
        }
    }
    for (auto const &torrent : current.torrents)
    {
        auto prev_it = previous_map.find(torrent.id);
        if (prev_it == previous_map.end())
        {
            diff.added.push_back(torrent);
        }
        else
        {
            if (!tt::rpc::torrent_snapshot_equal(prev_it->second, torrent))
            {
                diff.updated.emplace_back(prev_it->second, torrent);
            }
            if (!prev_it->second.is_finished && torrent.is_finished)
            {
                diff.finished.push_back(torrent.id);
            }
        }
    }
    return diff;
}

} // namespace

namespace tt::rpc
{

void send_ws_ping(struct mg_connection *conn);

Server::Server(engine::Core *engine, std::string bind_url,
               ServerOptions options)
    : bind_url_(std::move(bind_url)), engine_(engine),
      dispatcher_(engine, bind_url_), listener_(nullptr),
      session_id_(generate_session_id()), options_(std::move(options))
{
    rpc_path_ = options_.rpc_path;
    ws_path_ = options_.ws_path;
    auto add_allowed_host = [&](std::string host)
    {
        if (host.empty())
        {
            return;
        }
        if (std::find(allowed_hosts_.begin(), allowed_hosts_.end(), host) ==
            allowed_hosts_.end())
        {
            allowed_hosts_.push_back(std::move(host));
        }
    };
    auto host_segment = bind_url_;
    if (auto scheme = host_segment.find("://"); scheme != std::string::npos)
    {
        host_segment = host_segment.substr(scheme + 3);
    }
    auto slash = host_segment.find('/');
    if (slash != std::string::npos)
    {
        host_segment.resize(slash);
    }
    if (!host_segment.empty())
    {
        auto canonical = canonicalize_host(host_segment);
        add_allowed_host(canonical);
        if (canonical == "127.0.0.1" || canonical == "localhost" ||
            canonical == "[::1]" || canonical == "::1" ||
            canonical == "0:0:0:0:0:0:0:1")
        {
            for (auto const &loop : kLoopbackHosts)
            {
                add_allowed_host(std::string(loop));
            }
        }
    }
    last_ping_time_ = std::chrono::steady_clock::now();
    if (options_.token)
    {
        connection_info_.emplace();
        connection_info_->token = *options_.token;
    }
    if (engine_)
    {
        last_patch_snapshot_ = engine_->snapshot();
        last_blocklist_entries_ = engine_->blocklist_entry_count();
    }
    else
    {
        last_patch_snapshot_ = std::make_shared<engine::SessionSnapshot>();
    }
    last_patch_sent_time_ =
        std::chrono::steady_clock::now() - kWebsocketPatchInterval;
    mg_mgr_init(&mgr_);
    mgr_.userdata = this;
}

Server::~Server()
{
    // Set the destroying flag BEFORE stopping to prevent any callbacks
    // from accessing member variables during shutdown
    destroying_.store(true, std::memory_order_release);

    stop();

    // Clear connection-dependent state before mg_mgr_free
    // The destroying flag will prevent callbacks from running
    ws_clients_.clear();

    // Free the mongoose manager - callbacks are prevented by destroying flag
    mg_mgr_free(&mgr_);
}

void Server::start()
{
    if (running_.exchange(true))
    {
        return;
    }

    listener_ =
        mg_http_listen(&mgr_, bind_url_.c_str(), &Server::handle_event, this);
    if (listener_ == nullptr)
    {
        TT_LOG_INFO("Failed to bind RPC listener to {}", bind_url_);
    }
    else
    {
        refresh_connection_port();
        TT_LOG_INFO("RPC listener bound to {}, exposing {}", bind_url_,
                    rpc_path_);
    }
    worker_ = std::thread(&Server::run_loop, this);
    TT_LOG_INFO("RPC worker thread started");
}

void Server::stop()
{
    if (!running_.exchange(false))
    {
        return;
    }

    // Only broadcast shutdown event if we're not destroying the Server
    // During destruction, the destroying flag is already set and connections
    // will be closed by mg_mgr_free anyway
    if (!destroying_.load(std::memory_order_acquire))
    {
        broadcast_event(serialize_ws_event_app_shutdown());
    }

    TT_LOG_INFO("Stopping RPC worker thread");
    if (worker_.joinable())
    {
        worker_.join();
    }
}
void Server::run_loop()
{
    try
    {
        while (running_.load(std::memory_order_relaxed) &&
               !tt::runtime::should_shutdown())
        {
            // TT_LOG_DEBUG("Polling Mongoose event loop");
            mg_mgr_poll(&mgr_, 50);
            process_pending_tasks();
            broadcast_websocket_updates();
        }
    }
    catch (std::exception const &ex)
    {
        TT_LOG_INFO("RPC worker exception: {}", ex.what());
    }
    catch (...)
    {
        TT_LOG_INFO("RPC worker exception");
    }
    running_.store(false, std::memory_order_relaxed);
}

void Server::broadcast_websocket_updates()
{
    // Don't access ws_clients_ during destruction
    if (destroying_.load(std::memory_order_acquire))
    {
        return;
    }

    if (engine_ == nullptr)
    {
        return;
    }
    auto snapshot = engine_->snapshot();
    if (!snapshot)
    {
        snapshot = std::make_shared<engine::SessionSnapshot>();
    }
    auto blocklist_entries = engine_->blocklist_entry_count();
    bool blocklist_changed = blocklist_entries != last_blocklist_entries_;

    if (!last_patch_snapshot_)
    {
        last_patch_snapshot_ = snapshot;
        last_blocklist_entries_ = blocklist_entries;
    }

    auto now = std::chrono::steady_clock::now();
    bool ready = now - last_patch_sent_time_ >= kWebsocketPatchInterval;

    std::vector<WsClient> clients_snapshot;
    {
        std::lock_guard<std::mutex> lock(ws_clients_mtx_);
        clients_snapshot = ws_clients_;
    }

    bool has_clients = !clients_snapshot.empty();

    if (!has_clients)
    {
        pending_snapshot_.reset();
        last_patch_snapshot_ = snapshot;
    }
    else
    {
        bool snapshot_changed =
            !session_snapshot_equal(*last_patch_snapshot_, *snapshot);
        if (snapshot_changed)
        {
            pending_snapshot_ = snapshot;
        }
    }

    if (has_clients && ready && pending_snapshot_)
    {
        auto patch_diff =
            compute_diff(*last_patch_snapshot_, *pending_snapshot_);
        bool has_changes =
            patch_diff.session_changed || !patch_diff.added.empty() ||
            !patch_diff.updated.empty() || !patch_diff.removed.empty();
        if (has_changes)
        {
            auto payload =
                serialize_ws_patch(*pending_snapshot_, patch_diff.added,
                                   patch_diff.updated, patch_diff.removed);
            std::vector<struct mg_connection *> clients_to_update;
            {
                std::lock_guard<std::mutex> lock(ws_clients_mtx_);
                for (auto it = ws_clients_.begin(); it != ws_clients_.end();)
                {
                    auto &client = *it;
                    if (client.conn == nullptr)
                    {
                        it = ws_clients_.erase(it);
                        continue;
                    }
                    if (client.last_known_snapshot == last_patch_snapshot_)
                    {
                        clients_to_update.push_back(client.conn);
                        client.last_known_snapshot = pending_snapshot_;
                    }
                    ++it;
                }
            }
            // Send messages without holding the lock
            for (auto conn : clients_to_update)
            {
                send_ws_message(conn, payload);
            }
            last_patch_snapshot_ = pending_snapshot_;
            last_patch_sent_time_ = now;
            for (auto const &torrent : patch_diff.added)
            {
                broadcast_event(serialize_ws_event_torrent_added(torrent.id));
            }
            for (int id : patch_diff.finished)
            {
                broadcast_event(serialize_ws_event_torrent_finished(id));
            }
        }
        else
        {
            std::lock_guard<std::mutex> lock(ws_clients_mtx_);
            for (auto &client : ws_clients_)
            {
                if (client.last_known_snapshot == last_patch_snapshot_)
                {
                    client.last_known_snapshot = snapshot;
                }
            }
            last_patch_snapshot_ = snapshot;
        }
        pending_snapshot_.reset();
    }

    if (blocklist_changed)
    {
        last_blocklist_entries_ = blocklist_entries;
        broadcast_event(
            serialize_ws_event_blocklist_updated(blocklist_entries));
    }

    if (now - last_ping_time_ >= kWebsocketPingInterval)
    {
        last_ping_time_ = now;
        std::lock_guard<std::mutex> lock(ws_clients_mtx_);
        for (auto &client : ws_clients_)
        {
            send_ws_ping(client.conn);
        }
    }
}

void Server::dispatch(std::string_view payload,
                      std::function<void(std::string)> cb)
{
    dispatcher_.dispatch(payload, std::move(cb));
}

void Server::refresh_connection_port()
{
    if (!connection_info_ || listener_ == nullptr)
    {
        return;
    }
    connection_info_->port =
        static_cast<std::uint16_t>(ntohs(listener_->loc.port));
}

bool Server::authorize_request(struct mg_http_message *hm)
{
    if (!options_.basic_auth && !options_.token)
    {
        return true;
    }
    if (options_.token)
    {
        auto const &token = *options_.token;
        auto matches_token = [&](char const *header_name)
        {
            if (auto *header = mg_http_get_header(hm, header_name);
                header != nullptr)
            {
                std::string_view value(header->buf, header->len);
                return value == token;
            }
            return false;
        };
        if (matches_token(options_.token_header.c_str()) ||
            matches_token(kLegacyTokenHeader))
        {
            return true;
        }
        if (auto *header = mg_http_get_header(hm, "Authorization");
            header != nullptr)
        {
            std::string_view value(header->buf, header->len);
            static constexpr std::string_view bearer = "Bearer ";
            if (value.size() > bearer.size() && value.starts_with(bearer))
            {
                auto token_value = value.substr(bearer.size());
                if (token_value == token)
                {
                    return true;
                }
            }
        }
    }
    if (options_.basic_auth)
    {
        if (auto *header = mg_http_get_header(hm, "Authorization");
            header != nullptr)
        {
            if (auto credentials = decode_basic_credentials(
                    std::string_view(header->buf, header->len)))
            {
                auto expected = options_.basic_auth->first + ":" +
                                options_.basic_auth->second;
                if (*credentials == expected)
                {
                    return true;
                }
            }
        }
    }
    return false;
}

std::optional<ConnectionInfo> Server::connection_info() const
{
    return connection_info_;
}

bool Server::authorize_ws_upgrade(struct mg_http_message *hm,
                                  std::optional<std::string> const &token)
{
    if (!options_.basic_auth && !options_.token)
    {
        return true;
    }
    if (options_.token)
    {
        if (token && *token == *options_.token)
        {
            return true;
        }
        auto matches_header = [&](char const *header_name)
        {
            if (auto *header = mg_http_get_header(hm, header_name);
                header != nullptr)
            {
                std::string_view value(header->buf, header->len);
                return value == *options_.token;
            }
            return false;
        };
        if (matches_header(options_.token_header.c_str()) ||
            matches_header(kLegacyTokenHeader))
        {
            return true;
        }
        if (auto *header = mg_http_get_header(hm, "Authorization");
            header != nullptr)
        {
            std::string_view value(header->buf, header->len);
            static constexpr std::string_view bearer = "Bearer ";
            if (value.size() > bearer.size() && value.starts_with(bearer))
            {
                auto token_value = value.substr(bearer.size());
                if (token_value == *options_.token)
                {
                    return true;
                }
            }
        }
    }
    if (options_.basic_auth)
    {
        if (auto *header = mg_http_get_header(hm, "Authorization");
            header != nullptr)
        {
            if (auto credentials = decode_basic_credentials(
                    std::string_view(header->buf, header->len)))
            {
                auto expected = options_.basic_auth->first + ":" +
                                options_.basic_auth->second;
                if (*credentials == expected)
                {
                    return true;
                }
            }
        }
    }
    return false;
}

void Server::handle_event(struct mg_connection *conn, int ev, void *ev_data)
{
    if (conn == nullptr)
    {
        return;
    }

    auto *self = static_cast<Server *>(conn->fn_data);
    if (self == nullptr)
    {
        return;
    }

    // If the Server is being destroyed, do not access any member variables
    if (self->destroying_.load(std::memory_order_acquire))
    {
        return;
    }

    switch (ev)
    {
    case MG_EV_HTTP_MSG:
        self->handle_http_message(
            conn, static_cast<struct mg_http_message *>(ev_data));
        break;
    case MG_EV_WS_OPEN:
        self->handle_ws_open(conn,
                             static_cast<struct mg_http_message *>(ev_data));
        break;
    case MG_EV_WS_MSG:
        self->handle_ws_message(conn,
                                static_cast<struct mg_ws_message *>(ev_data));
        break;
    case MG_EV_CLOSE:
    case MG_EV_ERROR:
        self->handle_connection_closed(conn, ev);
        break;
    default:
        break;
    }
}

void Server::handle_http_message(struct mg_connection *conn,
                                 struct mg_http_message *hm)
{
    if (conn == nullptr || hm == nullptr)
    {
        return;
    }
    auto *self = static_cast<Server *>(conn->fn_data);
    if (self == nullptr)
    {
        return;
    }

    // Don't process HTTP requests during destruction
    if (self->destroying_.load(std::memory_order_acquire))
    {
        return;
    }
    std::string_view uri(hm->uri.buf, hm->uri.len);
    std::string_view method(hm->method.buf, hm->method.len);
    TT_LOG_DEBUG("HTTP request {} {}", method, uri);

    bool is_rpc = uri.size() == rpc_path_.size() &&
                  std::memcmp(uri.data(), rpc_path_.data(), uri.size()) == 0;
    bool is_ws = uri.size() == ws_path_.size() &&
                 std::memcmp(uri.data(), ws_path_.data(), uri.size()) == 0;

    if (is_ws)
    {
        auto normalized = normalized_host(hm);
        if (!normalized || !host_allowed(*normalized, allowed_hosts_))
        {
            TT_LOG_INFO(
                "WebSocket upgrade rejected; unsupported host header {}",
                normalized ? *normalized : "<missing>");
            auto payload = serialize_error("invalid host header");
            mg_http_reply(conn, 403, "Content-Type: application/json\r\n", "%s",
                          payload.c_str());
            return;
        }
        if (!origin_allowed(hm, options_))
        {
            auto origin_value = header_value(hm, "Origin");
            TT_LOG_INFO("WebSocket upgrade rejected; origin not allowed {}",
                        origin_value ? *origin_value : "<missing>");
            auto payload = serialize_error("origin not allowed");
            mg_http_reply(conn, 403, "Content-Type: application/json\r\n", "%s",
                          payload.c_str());
            return;
        }
        auto token = websocket_token(hm);
        if (!authorize_ws_upgrade(hm, token))
        {
            TT_LOG_INFO("WebSocket upgrade rejected; invalid token");
            auto payload = serialize_error("invalid token");
            mg_http_reply(conn, 403, "Content-Type: application/json\r\n", "%s",
                          payload.c_str());
            return;
        }
        mg_ws_upgrade(conn, hm, nullptr);
        return;
    }

    if (!is_rpc)
    {
        TT_LOG_INFO("HTTP request rejected; unsupported path {}", uri);
        mg_http_reply(conn, 404, "Content-Type: text/plain\r\n", "not found");
        return;
    }

    auto normalized = normalized_host(hm);
    if (!normalized || !host_allowed(*normalized, allowed_hosts_))
    {
        TT_LOG_INFO("RPC request rejected; unsupported host header {}",
                    normalized ? *normalized : "<missing>");
        auto payload = serialize_error("invalid host header");
        mg_http_reply(conn, 403, "Content-Type: application/json\r\n", "%s",
                      payload.c_str());
        return;
    }
    if (!origin_allowed(hm, options_))
    {
        auto origin_value = header_value(hm, "Origin");
        TT_LOG_INFO("RPC request rejected; origin not allowed {}",
                    origin_value ? *origin_value : "<missing>");
        auto payload = serialize_error("origin not allowed");
        mg_http_reply(conn, 403, "Content-Type: application/json\r\n", "%s",
                      payload.c_str());
        return;
    }

    if (!self->authorize_request(hm))
    {
        std::string headers = "Content-Type: text/plain\r\n";
        if (self->options_.basic_auth)
        {
            headers += "WWW-Authenticate: Basic realm=\"";
            headers += self->options_.basic_realm;
            headers += "\"\r\n";
        }
        mg_http_reply(conn, 401, headers.c_str(), "unauthorized");
        return;
    }

    auto const &session_header_name = self->options_.session_header;
    auto *session_header = mg_http_get_header(hm, session_header_name.c_str());
    bool session_ok = session_header != nullptr &&
                      static_cast<std::size_t>(session_header->len) ==
                          self->session_id_.size() &&
                      std::memcmp(session_header->buf, self->session_id_.data(),
                                  self->session_id_.size()) == 0;
    if (!session_ok)
    {
        std::string headers =
            std::string("Content-Type: application/json\r\n") +
            session_header_name + ": " + self->session_id_ + "\r\n";
        auto payload = serialize_error("session id required");
        mg_http_reply(conn, 409, headers.c_str(), "%s", payload.c_str());
        return;
    }

    if (hm->body.len == static_cast<size_t>(-1) ||
        hm->body.len > kMaxHttpPayloadSize)
    {
        TT_LOG_INFO("RPC payload too large: {} bytes", hm->body.len);
        auto payload = serialize_error("payload too large");
        mg_http_reply(conn, 413, "Content-Type: application/json\r\n", "%s",
                      payload.c_str());
        return;
    }

    std::string body;
    if (hm->body.len > 0 && hm->body.buf != nullptr)
    {
        body.assign(hm->body.buf, hm->body.len);
    }

    auto req_id = self->next_request_id_++;
    self->active_requests_[req_id] = conn;

    self->dispatch(body,
                   [self, req_id](std::string response)
                   {
                       self->enqueue_task(
                           [self, req_id, response = std::move(response)]
                           { self->send_response(req_id, response); });
                   });
}

void Server::handle_ws_open(struct mg_connection *conn,
                            struct mg_http_message * /*hm*/)
{
    // Don't accept new WebSocket connections during destruction
    if (destroying_.load(std::memory_order_acquire))
    {
        return;
    }

    if (conn == nullptr)
    {
        return;
    }
    auto snapshot = engine_ ? engine_->snapshot()
                            : std::make_shared<engine::SessionSnapshot>();
    send_ws_message(conn, serialize_ws_snapshot(*snapshot));
    {
        std::lock_guard<std::mutex> lock(ws_clients_mtx_);
        ws_clients_.push_back({conn, std::move(snapshot)});
    }
}

void Server::handle_ws_message(struct mg_connection * /*conn*/,
                               struct mg_ws_message * /*message*/)
{
    // WebSocket channel is read-only; ignore incoming messages.
}

void Server::handle_connection_closed(struct mg_connection *conn, int /*ev*/)
{
    // Don't modify ws_clients_ during destruction
    if (destroying_.load(std::memory_order_acquire))
    {
        return;
    }

    {
        std::lock_guard<std::mutex> lock(ws_clients_mtx_);
        ws_clients_.erase(std::remove_if(ws_clients_.begin(), ws_clients_.end(),
                                         [conn](WsClient const &client)
                                         { return client.conn == conn; }),
                          ws_clients_.end());
    }

    // Remove from active requests
    for (auto it = active_requests_.begin(); it != active_requests_.end();)
    {
        if (it->second == conn)
        {
            it = active_requests_.erase(it);
        }
        else
        {
            ++it;
        }
    }
}

void Server::send_ws_message(struct mg_connection *conn,
                             std::string const &payload)
{
    // Don't send messages during destruction
    if (destroying_.load(std::memory_order_acquire))
    {
        return;
    }

    if (conn == nullptr)
    {
        return;
    }
    // Try to send; if it fails, close the connection
    size_t sent =
        mg_ws_send(conn, payload.data(), payload.size(), WEBSOCKET_OP_TEXT);
    if (sent == 0)
    {
        // Connection is dead or closed; mongoose will handle cleanup
        // We don't need to manually mark it as closing
    }
}

void send_ws_ping(struct mg_connection *conn)
{
    if (conn == nullptr)
    {
        return;
    }
    // Send ping; if it fails, mongoose will handle cleanup
    size_t sent = mg_ws_send(conn, nullptr, 0, WEBSOCKET_OP_PING);
    (void)sent; // Mongoose handles connection closure on failure
}

void Server::enqueue_task(std::function<void()> task)
{
    std::lock_guard<std::mutex> lock(tasks_mtx_);
    pending_tasks_.push_back(std::move(task));
    mg_wakeup(&mgr_, 0, nullptr, 0);
}

void Server::process_pending_tasks()
{
    std::vector<std::function<void()>> tasks;
    {
        std::lock_guard<std::mutex> lock(tasks_mtx_);
        tasks.swap(pending_tasks_);
    }
    for (auto &task : tasks)
    {
        task();
    }
}

void Server::send_response(std::uint64_t req_id, std::string const &response)
{
    auto it = active_requests_.find(req_id);
    if (it != active_requests_.end())
    {
        mg_http_reply(it->second, 200, "Content-Type: application/json\r\n",
                      "%s", response.c_str());
        active_requests_.erase(it);
    }
}

void Server::broadcast_event(std::string const &payload)
{
    // Don't broadcast events during destruction
    if (destroying_.load(std::memory_order_acquire))
    {
        return;
    }

    std::vector<WsClient> clients_snapshot;
    {
        std::lock_guard<std::mutex> lock(ws_clients_mtx_);
        clients_snapshot = ws_clients_;
    }

    for (auto &client : clients_snapshot)
    {
        if (client.conn != nullptr)
        {
            send_ws_message(client.conn, payload);
        }
    }
}

} // namespace tt::rpc

#pragma once
#include "rpc/Dispatcher.hpp"
#include "vendor/mongoose.h"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <future>
#include <memory>
#include <optional>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace tt::engine
{
class Core;
}

namespace tt::rpc
{

struct ServerOptions
{
    std::optional<std::pair<std::string, std::string>> basic_auth;
    std::optional<std::string> token;
    std::string token_header = "X-TT-Auth";
    std::string basic_realm = "TinyTorrent RPC";
    std::vector<std::string> trusted_origins = {"tt://app",
                                                "http://localhost:3000"};
    std::string rpc_path = "/transmission/rpc";
    std::string ws_path = "/ws";
    std::string session_header = "X-Transmission-Session-Id";
};

struct ConnectionInfo
{
    std::string token;
    std::uint16_t port = 0;
};

class Server
{
  public:
    explicit Server(engine::Core *engine,
                    std::string bind_url = "http://127.0.0.1:8080",
                    ServerOptions options = {});
    ~Server();

    Server(Server const &) = delete;
    Server &operator=(Server const &) = delete;

    void start();
    void stop();

    std::optional<ConnectionInfo> connection_info() const;

  private:
    void run_loop();
    void handle_http_message(struct mg_connection *conn,
                             struct mg_http_message *hm);
    void handle_ws_open(struct mg_connection *conn, struct mg_http_message *hm);
    void handle_ws_message(struct mg_connection *conn,
                           struct mg_ws_message *message);
    void handle_connection_closed(struct mg_connection *conn, int ev);
    std::future<std::string> dispatch(std::string_view payload);
    static void handle_event(struct mg_connection *conn, int ev, void *ev_data);
    bool authorize_request(struct mg_http_message *hm);
    bool authorize_ws_upgrade(struct mg_http_message *hm,
                              std::optional<std::string> const &token);
    void refresh_connection_port();
    void broadcast_websocket_updates();
    void broadcast_event(std::string const &payload);
    void send_ws_message(struct mg_connection *conn,
                         std::string const &payload);
    void process_pending_http_responses();

    std::string bind_url_;
    std::string rpc_path_;
    engine::Core *engine_;
    Dispatcher dispatcher_;
    mg_mgr mgr_;
    struct mg_connection *listener_;
    std::string session_id_;
    std::optional<ConnectionInfo> connection_info_;
    std::atomic_bool running_{false};
    std::thread worker_;
    ServerOptions options_;
    std::string ws_path_ = "/ws";

    struct PendingHttpRequest
    {
        struct mg_connection *conn = nullptr;
        std::shared_ptr<std::future<std::string>> future;
    };

    struct WsClient
    {
        struct mg_connection *conn = nullptr;
        std::shared_ptr<engine::SessionSnapshot> last_known_snapshot;
    };
    std::vector<WsClient> ws_clients_;
    std::vector<PendingHttpRequest> pending_http_requests_;
    std::shared_ptr<engine::SessionSnapshot> last_patch_snapshot_;
    std::shared_ptr<engine::SessionSnapshot> pending_snapshot_;
    std::size_t last_blocklist_entries_ = 0;
    std::chrono::steady_clock::time_point last_patch_sent_time_;
    std::vector<std::string> allowed_hosts_;
    std::chrono::steady_clock::time_point last_ping_time_;
};

} // namespace tt::rpc

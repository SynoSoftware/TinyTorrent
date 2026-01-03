#pragma once
#include "services/SystemInstallService.hpp"
#include "rpc/Dispatcher.hpp"
#include "rpc/UiPreferences.hpp"
#include "vendor/mongoose.h"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <unordered_map>
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
    std::vector<std::string> trusted_origins = {"tt-app://local.ui",
                                                "http://localhost:3000"};
    std::string rpc_path = "/transmission/rpc";
    std::string ws_path = "/ws";
    std::string session_header = "X-Transmission-Session-Id";
    bool force_debug_port = false;
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
                    ServerOptions options = {},
                    std::shared_ptr<SystemInstallService> system_install_service =
                        {});
    ~Server();

    Server(Server const &) = delete;
    Server &operator=(Server const &) = delete;

    void start();
    void stop();

    std::optional<ConnectionInfo> connection_info() const;
    bool has_active_ws_clients() const;

  private:
    void run_loop();
    void handle_http_message(struct mg_connection *conn,
                             struct mg_http_message *hm);
    void handle_ws_open(struct mg_connection *conn, struct mg_http_message *hm);
    void handle_ws_message(struct mg_connection *conn,
                           struct mg_ws_message *message);
    void handle_connection_closed(struct mg_connection *conn, int ev);
    void dispatch(std::string_view payload,
                  std::function<void(std::string)> cb);
    static void handle_event(struct mg_connection *conn, int ev, void *ev_data);
    bool authorize_request(struct mg_http_message *hm);
    bool authorize_ws_upgrade(struct mg_http_message *hm,
                              std::optional<std::string> const &token);
    void refresh_connection_port();
    void broadcast_websocket_updates();
    void broadcast_event(std::string const &payload);
    bool send_ws_message(struct mg_connection *conn,
                         std::string const &payload);
    void schedule_ui_detach_check();
    void process_pending_tasks();
    void enqueue_task(std::function<void()> task);
    void drain_pending_responses();
    void send_response(std::uint64_t req_id, std::string const &response);

    std::string bind_url_;
    std::string rpc_path_;
    engine::Core *engine_;
    std::shared_ptr<UiPreferencesStore> ui_preferences_store_;
    std::shared_ptr<SystemInstallService> system_install_service_;
    Dispatcher dispatcher_;
    mg_mgr mgr_;
    struct mg_connection *listener_;
    std::string session_id_;
    std::optional<ConnectionInfo> connection_info_;
    std::atomic_bool running_{false};
    std::thread worker_;
    ServerOptions options_;
    std::string ws_path_ = "/ws";
    std::atomic_bool destroying_{false};
    std::atomic_bool ui_detach_timer_active_{false};
    // Synchronization for listener readiness (port resolved)
    mutable std::mutex ready_mtx_;
    mutable std::condition_variable ready_cv_;
    std::atomic_bool ready_{false};

  public:
    // Wait until the RPC listener has a resolved port and connection info.
    // Returns true if ready before timeout, false otherwise.
    bool wait_until_ready(std::chrono::milliseconds timeout) const;

    struct ActiveRequest
    {
        struct mg_connection *conn = nullptr;
        std::string headers;
    };
    using RequestId = std::uint64_t;
    RequestId next_request_id_ = 1;
    std::unordered_map<RequestId, ActiveRequest> active_requests_;

    std::vector<std::function<void()>> pending_tasks_;
    std::mutex tasks_mtx_;

    // Mongoose response queuing: responses produced on background threads
    // must be delivered on the mongoose poll thread. Buffer them here and
    // wake the mongoose manager to perform the actual HTTP reply.
    std::mutex response_mutex_;
    std::vector<std::pair<uint64_t, std::string>> pending_responses_;

    struct WsClient
    {
        struct mg_connection *conn = nullptr;
        std::shared_ptr<engine::SessionSnapshot> last_known_snapshot;
    };
    std::vector<WsClient> ws_clients_;
    mutable std::mutex ws_clients_mtx_; // Protects ws_clients_ from concurrent access
    std::shared_ptr<engine::SessionSnapshot> last_patch_snapshot_;
    std::shared_ptr<engine::SessionSnapshot> pending_snapshot_;
    std::size_t last_blocklist_entries_ = 0;
    std::chrono::steady_clock::time_point last_patch_sent_time_;
    std::vector<std::string> allowed_hosts_;
    std::chrono::steady_clock::time_point last_ping_time_;
};

bool origin_allowed(struct mg_http_message *hm,
                    ServerOptions const &options);

} // namespace tt::rpc

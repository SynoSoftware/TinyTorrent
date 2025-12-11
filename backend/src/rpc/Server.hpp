#pragma once
#include "rpc/Dispatcher.hpp"
#include "vendor/mongoose.h"

#include <atomic>
#include <optional>
#include <string>
#include <thread>
#include <utility>

namespace tt::engine {
class Core;
}

namespace tt::rpc {

struct ServerOptions {
  std::optional<std::pair<std::string, std::string>> basic_auth;
  std::optional<std::string> token;
  std::string token_header = "X-TinyTorrent-Token";
  std::string basic_realm = "TinyTorrent RPC";
};

class Server {
public:
  explicit Server(engine::Core *engine,
                  std::string bind_url = "http://127.0.0.1:8080",
                  ServerOptions options = {});
  ~Server();

  Server(Server const &) = delete;
  Server &operator=(Server const &) = delete;

  void start();
  void stop();

private:
  void run_loop();
  std::string dispatch(std::string_view payload);
  static void handle_event(struct mg_connection *conn, int ev, void *ev_data);
  bool authorize_request(struct mg_http_message *hm);

  std::string bind_url_;
  std::string rpc_path_;
  engine::Core *engine_;
  Dispatcher dispatcher_;
  mg_mgr mgr_;
  struct mg_connection *listener_;
  std::string session_id_;
  std::atomic_bool running_{false};
  std::thread worker_;
  ServerOptions options_;
};

} // namespace tt::rpc

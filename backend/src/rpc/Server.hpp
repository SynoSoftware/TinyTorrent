#pragma once
#include "rpc/Dispatcher.hpp"
#include "vendor/mongoose.h"

#include <atomic>
#include <string>
#include <thread>

namespace tt::engine {
class Core;
}

namespace tt::rpc {

class Server {
public:
  explicit Server(engine::Core *engine, std::string bind_url = "http://127.0.0.1:8080");
  ~Server();

  Server(Server const &) = delete;
  Server &operator=(Server const &) = delete;

  void start();
  void stop();

private:
  void run_loop();
  std::string dispatch(std::string_view payload);
  static void handle_event(struct mg_connection *conn, int ev, void *ev_data, void *fn_data);

  std::string bind_url_;
  std::string rpc_path_;
  engine::Core *engine_;
  Dispatcher dispatcher_;
  mg_mgr mgr_;
  struct mg_connection *listener_;
  std::atomic_bool running_{false};
  std::thread worker_;
};

} // namespace tt::rpc

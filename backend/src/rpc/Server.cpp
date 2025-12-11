#include "rpc/Server.hpp"

#include "utils/Log.hpp"
#include "vendor/mongoose.h"

#include <string_view>

namespace tt::rpc {

Server::Server(engine::Core *engine, std::string bind_url)
    : bind_url_(std::move(bind_url)),
      rpc_path_("/transmission/rpc"),
      engine_(engine),
      dispatcher_(engine),
      listener_(nullptr) {
  mg_mgr_init(&mgr_);
  mgr_.userdata = this;
}

Server::~Server() {
  stop();
  mg_mgr_free(&mgr_);
}

void Server::start() {
  if (running_.exchange(true)) {
    return;
  }

  listener_ = mg_http_listen(&mgr_, bind_url_.c_str(),
                             reinterpret_cast<mg_event_handler_t>(&Server::handle_event),
                             this);
  if (listener_ == nullptr) {
    TT_LOG_INFO("Failed to bind RPC listener to %s", bind_url_.c_str());
  } else {
    TT_LOG_INFO("RPC listener bound to %s, exposing %s", bind_url_.c_str(),
                rpc_path_.c_str());
  }
  worker_ = std::thread(&Server::run_loop, this);
  TT_LOG_INFO("RPC worker thread started");
}

void Server::stop() {
  if (!running_.exchange(false)) {
    return;
  }

  TT_LOG_INFO("Stopping RPC worker thread");
  if (worker_.joinable()) {
    worker_.join();
  }
}

void Server::run_loop() {
  while (running_.load(std::memory_order_relaxed)) {
    //TT_LOG_DEBUG("Polling Mongoose event loop");
    mg_mgr_poll(&mgr_, 50);
  }
}

std::string Server::dispatch(std::string_view payload) {
  return dispatcher_.dispatch(payload);
}

void Server::handle_event(struct mg_connection *conn, int ev, void *ev_data, void *fn_data) {
  if (ev != MG_EV_HTTP_MSG) {
    return;
  }

  auto *self = static_cast<Server *>(fn_data);
  if (self == nullptr) {
    return;
  }

  auto *hm = static_cast<struct mg_http_message *>(ev_data);
  std::string uri(hm->uri.buf, hm->uri.len);
  std::string method(hm->method.buf, hm->method.len);
  TT_LOG_DEBUG("RPC request %s %s", method.c_str(), uri.c_str());
  if (uri != self->rpc_path_) {
    TT_LOG_INFO("RPC request rejected; unsupported path %s", uri.c_str());
    mg_http_reply(conn, 404, "Content-Type: text/plain\r\n", "not found");
    return;
  }

  std::string body(hm->body.buf, hm->body.len);
  auto payload = self->dispatch(body);
  mg_http_reply(conn, 200, "Content-Type: application/json\r\n", "%s", payload.c_str());
}

} // namespace tt::rpc

#include "rpc/Server.hpp"

#include "rpc/Serializer.hpp"
#include "utils/Log.hpp"
#include "vendor/mongoose.h"

#include <chrono>
#include <limits>
#include <random>
#include <string>
#include <string_view>

namespace {
constexpr char kSessionHeaderName[] = "X-Transmission-Session-Id";

std::string generate_session_id() {
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
}
} // namespace

namespace tt::rpc {

Server::Server(engine::Core *engine, std::string bind_url)
    : bind_url_(std::move(bind_url)),
      rpc_path_("/transmission/rpc"),
      engine_(engine),
      dispatcher_(engine),
      listener_(nullptr),
      session_id_(generate_session_id()) {
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

  listener_ = mg_http_listen(&mgr_, bind_url_.c_str(), &Server::handle_event,
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

void Server::handle_event(struct mg_connection *conn, int ev, void *ev_data) {
  if (ev != MG_EV_HTTP_MSG) {
    return;
  }

  if (conn == nullptr) {
    return;
  }

  auto *self = static_cast<Server *>(conn->fn_data);
  if (self == nullptr) {
    return;
  }

  auto *hm = static_cast<struct mg_http_message *>(ev_data);
  std::string_view uri(hm->uri.buf, hm->uri.len);
  std::string_view method(hm->method.buf, hm->method.len);
  TT_LOG_DEBUG("RPC request %.*s %.*s", static_cast<int>(method.size()),
               method.data(), static_cast<int>(uri.size()), uri.data());
  if (uri.size() != self->rpc_path_.size() ||
      std::memcmp(uri.data(), self->rpc_path_.data(), uri.size()) != 0) {
    TT_LOG_INFO("RPC request rejected; unsupported path %.*s",
                static_cast<int>(uri.size()), uri.data());
    mg_http_reply(conn, 404, "Content-Type: text/plain\r\n", "not found");
    return;
  }

  auto *session_header = mg_http_get_header(hm, kSessionHeaderName);
  bool session_ok = session_header != nullptr &&
                    static_cast<std::size_t>(session_header->len) ==
                        self->session_id_.size() &&
                    std::memcmp(session_header->buf, self->session_id_.data(),
                                self->session_id_.size()) == 0;
  if (!session_ok) {
    std::string headers = std::string("Content-Type: application/json\r\n") +
                          kSessionHeaderName + ": " + self->session_id_ +
                          "\r\n";
    auto payload = serialize_error("session id required");
    mg_http_reply(conn, 409, headers.c_str(), "%s", payload.c_str());
    return;
  }

  std::string body;
  if (hm->body.len > 0 && hm->body.buf != nullptr) {
    body.assign(hm->body.buf, hm->body.len);
  }
  auto payload = self->dispatch(body);
  mg_http_reply(conn, 200, "Content-Type: application/json\r\n", "%s", payload.c_str());
}

} // namespace tt::rpc

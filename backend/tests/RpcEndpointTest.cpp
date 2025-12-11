#include "rpc/Server.hpp"
#include "RpcTestUtils.hpp"
#include "vendor/mongoose.h"

#include <atomic>
#include <chrono>
#include <exception>
#include <future>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>

#include <doctest/doctest.h>

namespace {

using namespace tt::tests;

constexpr std::string_view kRpcPath = "/transmission/rpc";
constexpr std::string_view kHostHeader = "127.0.0.1:8086";
constexpr std::string_view kServerUrl = "http://127.0.0.1:8086";

struct HttpTestContext {
  explicit HttpTestContext(std::string request_payload)
      : request(std::move(request_payload)), future(ready.get_future()) {}

  std::string request;
  std::string response;
  std::string session_id;
  int status_code = 0;
  bool request_sent = false;
  std::promise<void> ready;
  std::future<void> future;
  std::atomic<bool> completed{false};

  void signal_success() {
    bool expected = false;
    if (completed.compare_exchange_strong(expected, true)) {
      ready.set_value();
    }
  }

  void signal_failure(std::exception_ptr ep) {
    bool expected = false;
    if (completed.compare_exchange_strong(expected, true)) {
      ready.set_exception(ep);
    }
  }
};

void http_client_handler(struct mg_connection *conn, int ev, void *ev_data) {
  if (conn == nullptr) {
    return;
  }
  auto *ctx = static_cast<HttpTestContext *>(conn->fn_data);
  if (ctx == nullptr) {
    return;
  }

  if ((ev == MG_EV_OPEN || ev == MG_EV_CONNECT) && !ctx->request_sent) {
    mg_send(conn, ctx->request.c_str(), ctx->request.size());
    ctx->request_sent = true;
  } else if (ev == MG_EV_HTTP_MSG) {
    auto *hm = static_cast<struct mg_http_message *>(ev_data);
    ctx->response.assign(hm->body.buf, hm->body.len);
    ctx->status_code = mg_http_status(hm);
    if (auto *header = mg_http_get_header(hm, "X-Transmission-Session-Id")) {
      ctx->session_id.assign(header->buf, header->len);
    }
    ctx->signal_success();
    conn->is_closing = 1;
  } else if (ev == MG_EV_ERROR) {
    ctx->signal_failure(std::make_exception_ptr(
        std::runtime_error("RPC connection error")));
  } else if (ev == MG_EV_CLOSE) {
    if (ctx->completed.load(std::memory_order_acquire)) {
      return;
    }
    if (ctx->future.wait_for(std::chrono::seconds(0)) ==
        std::future_status::timeout) {
      ctx->signal_failure(std::make_exception_ptr(
          std::runtime_error("RPC request aborted before response")));
    }
  }
}

std::string build_http_request(std::string_view payload,
                               std::string const &session_id = {}) {
  std::string request;
  request.reserve(256 + payload.size());
  request += "POST ";
  request += kRpcPath;
  request += " HTTP/1.1\r\nHost: ";
  request += kHostHeader;
  request += "\r\nContent-Type: application/json\r\nContent-Length: ";
  request += std::to_string(payload.size());
  if (!session_id.empty()) {
    request += "\r\nX-Transmission-Session-Id: ";
    request += session_id;
  }
  request += "\r\nConnection: close\r\n\r\n";
  request.append(payload);
  return request;
}

struct RpcResponse {
  int status_code = 0;
  std::string body;
  std::string session_id;
};

RpcResponse send_rpc_request_once(std::string_view payload,
                                  std::string const &session_id = {}) {
  auto request = build_http_request(payload, session_id);
  HttpTestContext context(std::move(request));
  mg_mgr mgr;
  mg_mgr_init(&mgr);
  struct mg_connection *conn =
      mg_http_connect(&mgr, kServerUrl.data(), http_client_handler, &context);
  if (conn != nullptr) {
    conn->fn_data = &context;
  }
  if (conn == nullptr) {
    mg_mgr_free(&mgr);
    throw std::runtime_error("failed to connect to RPC endpoint");
  }

  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
  while (context.future.wait_for(std::chrono::milliseconds(0)) ==
             std::future_status::timeout &&
         std::chrono::steady_clock::now() < deadline) {
    mg_mgr_poll(&mgr, 50);
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }

  if (!context.completed.load(std::memory_order_acquire)) {
    context.signal_failure(std::make_exception_ptr(
        std::runtime_error("RPC response timed out")));
  }

  mg_mgr_free(&mgr);
  context.future.get();

  RpcResponse response;
  response.status_code = context.status_code;
  response.body = std::move(context.response);
  response.session_id = std::move(context.session_id);
  return response;
}

std::string send_rpc_request(std::string_view payload) {
  auto response = send_rpc_request_once(payload);
  if (response.status_code == 409) {
    if (response.session_id.empty()) {
      throw std::runtime_error("session handshake missing header");
    }
    response = send_rpc_request_once(payload, response.session_id);
  }
  if (response.status_code != 200) {
    throw std::runtime_error("unexpected RPC response status");
  }
  return response.body;
}

} // namespace

struct ServerGuard {
  explicit ServerGuard(tt::rpc::Server &srv) : server(srv) {}
  ~ServerGuard() { server.stop(); }
  tt::rpc::Server &server;
};

TEST_CASE("rpc endpoint handles session-set and unsupported method") {
  tt::rpc::Server server{nullptr, std::string{kServerUrl}};
  server.start();
  ServerGuard guard{server};
  std::this_thread::sleep_for(std::chrono::milliseconds(50));

  auto session_set_response =
      send_rpc_request(R"({"method":"session-set","arguments":{"download-dir":"."}})");
  ResponseView set_view{session_set_response};
  CHECK(set_view.result() == "success");

  auto unsupported_response =
      send_rpc_request(R"({"method":"does-not-exist","arguments":{}})");
  ResponseView unsupported_view{unsupported_response};
  CHECK(unsupported_view.result() == "error");
  expect_argument(unsupported_view, "message", "unsupported method");
}

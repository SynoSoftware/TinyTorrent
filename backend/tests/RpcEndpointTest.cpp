#include "RpcTestUtils.hpp"
#include "rpc/Server.hpp"
#include "vendor/mongoose.h"

#include <atomic>
#include <chrono>
#include <exception>
#include <future>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>

#include <doctest/doctest.h>
#include <yyjson.h>

namespace
{

using namespace tt::tests;

constexpr std::string_view kRpcPath = "/transmission/rpc";

// Support dynamic port via environment variable TT_TEST_PORT
// Defaults to 8086 for backward compatibility
std::string get_test_port()
{
    const char *env_port = std::getenv("TT_TEST_PORT");
    return env_port ? std::string(env_port) : "8086";
}

std::string kHostHeader = "127.0.0.1:" + get_test_port();
std::string kServerUrl = "http://127.0.0.1:" + get_test_port();

std::string get_ws_url(const std::string &path = "")
{
    return "ws://127.0.0.1:" + get_test_port() + "/ws" + path;
}

struct HttpTestContext
{
    explicit HttpTestContext(std::string request_payload)
        : request(std::move(request_payload)), future(ready.get_future())
    {
    }

    std::string request;
    std::string response;
    std::string session_id;
    int status_code = 0;
    bool request_sent = false;
    std::promise<void> ready;
    std::future<void> future;
    std::atomic<bool> completed{false};

    void signal_success()
    {
        bool expected = false;
        if (completed.compare_exchange_strong(expected, true))
        {
            ready.set_value();
        }
    }

    void signal_failure(std::exception_ptr ep)
    {
        bool expected = false;
        if (completed.compare_exchange_strong(expected, true))
        {
            ready.set_exception(ep);
        }
    }
};

void http_client_handler(struct mg_connection *conn, int ev, void *ev_data)
{
    if (conn == nullptr)
    {
        return;
    }
    auto *ctx = static_cast<HttpTestContext *>(conn->fn_data);
    if (ctx == nullptr)
    {
        return;
    }

    if ((ev == MG_EV_OPEN || ev == MG_EV_CONNECT) && !ctx->request_sent)
    {
        mg_send(conn, ctx->request.c_str(), ctx->request.size());
        ctx->request_sent = true;
    }
    else if (ev == MG_EV_HTTP_MSG)
    {
        auto *hm = static_cast<struct mg_http_message *>(ev_data);
        ctx->response.assign(hm->body.buf, hm->body.len);
        ctx->status_code = mg_http_status(hm);
        if (auto *header = mg_http_get_header(hm, "X-Transmission-Session-Id"))
        {
            ctx->session_id.assign(header->buf, header->len);
        }
        ctx->signal_success();
        conn->is_closing = 1;
    }
    else if (ev == MG_EV_ERROR)
    {
        ctx->signal_failure(std::make_exception_ptr(
            std::runtime_error("RPC connection error")));
    }
    else if (ev == MG_EV_CLOSE)
    {
        if (ctx->completed.load(std::memory_order_acquire))
        {
            return;
        }
        if (ctx->future.wait_for(std::chrono::seconds(0)) ==
            std::future_status::timeout)
        {
            ctx->signal_failure(std::make_exception_ptr(
                std::runtime_error("RPC request aborted before response")));
        }
    }
}

struct WsTestContext
{
    WsTestContext()
        : future(ready.get_future()), message_future(message_ready.get_future())
    {
    }

    std::promise<void> ready;
    std::future<void> future;
    std::atomic<bool> completed{false};
    bool handshake_success = false;

    std::promise<void> message_ready;
    std::future<void> message_future;
    std::atomic<bool> message_signaled{false};
    bool message_received = false;
    std::string message_payload;
    std::atomic<bool> connection_alive{false};

    void signal_completion(bool success)
    {
        bool expected = false;
        if (completed.compare_exchange_strong(expected, true))
        {
            handshake_success = success;
            ready.set_value();
        }
    }

    void signal_message()
    {
        bool expected = false;
        if (message_signaled.compare_exchange_strong(expected, true))
        {
            message_received = true;
            message_ready.set_value();
        }
    }
};

void ws_client_handler(struct mg_connection *conn, int ev, void *ev_data)
{
    if (conn == nullptr)
    {
        return;
    }
    auto *ctx = static_cast<WsTestContext *>(conn->fn_data);
    if (ctx == nullptr)
    {
        return;
    }
    if (ev == MG_EV_WS_OPEN)
    {
        ctx->connection_alive.store(true, std::memory_order_release);
        ctx->signal_completion(true);
    }
    else if (ev == MG_EV_WS_MSG)
    {
        auto *message = static_cast<struct mg_ws_message *>(ev_data);
        if (message && message->data.len > 0)
        {
            ctx->message_payload.assign(message->data.buf, message->data.len);
        }
        else
        {
            ctx->message_payload.clear();
        }
        ctx->signal_message();
    }
    else if (ev == MG_EV_CLOSE || ev == MG_EV_ERROR)
    {
        ctx->connection_alive.store(false, std::memory_order_release);
        ctx->signal_completion(false);
    }
}

std::string build_http_request(std::string_view payload,
                               std::string const &session_id = {},
                               std::string const &extra_headers = {})
{
    std::string request;
    request.reserve(256 + payload.size());
    request += "POST ";
    request += kRpcPath;
    request += " HTTP/1.1\r\nHost: ";
    request += kHostHeader;
    request += "\r\nContent-Type: application/json\r\nContent-Length: ";
    request += std::to_string(payload.size());
    if (!session_id.empty())
    {
        request += "\r\nX-Transmission-Session-Id: ";
        request += session_id;
    }
    if (!extra_headers.empty())
    {
        auto sanitized_headers = extra_headers;
        while (sanitized_headers.size() >= 2 &&
               sanitized_headers.substr(sanitized_headers.size() - 2) == "\r\n")
        {
            sanitized_headers.resize(sanitized_headers.size() - 2);
        }
        request += "\r\n";
        request += sanitized_headers;
    }
    request += "\r\nConnection: close\r\n\r\n";
    request.append(payload);
    return request;
}

struct RpcResponse
{
    int status_code = 0;
    std::string body;
    std::string session_id;
};

RpcResponse send_rpc_request_once(std::string_view payload,
                                  std::string const &session_id = {},
                                  std::string const &extra_headers = {})
{
    auto request = build_http_request(payload, session_id, extra_headers);
    HttpTestContext context(std::move(request));
    mg_mgr mgr;
    mg_mgr_init(&mgr);
    struct mg_connection *conn =
        mg_http_connect(&mgr, kServerUrl.data(), http_client_handler, &context);
    if (conn != nullptr)
    {
        conn->fn_data = &context;
    }
    if (conn == nullptr)
    {
        mg_mgr_free(&mgr);
        throw std::runtime_error("failed to connect to RPC endpoint");
    }

    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
    while (context.future.wait_for(std::chrono::milliseconds(0)) ==
               std::future_status::timeout &&
           std::chrono::steady_clock::now() < deadline)
    {
        mg_mgr_poll(&mgr, 50);
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }

    if (!context.completed.load(std::memory_order_acquire))
    {
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

std::string send_rpc_request(std::string_view payload,
                             std::string const &extra_headers = {})
{
    auto response = send_rpc_request_once(payload, {}, extra_headers);
    if (response.status_code == 409)
    {
        if (response.session_id.empty())
        {
            throw std::runtime_error("session handshake missing header");
        }
        response =
            send_rpc_request_once(payload, response.session_id, extra_headers);
    }
    if (response.status_code != 200)
    {
        throw std::runtime_error("unexpected RPC response status");
    }
    return response.body;
}

void run_ws_client(WsTestContext &context, std::string const &url,
                   std::optional<std::string> const &origin = std::nullopt,
                   bool wait_for_message = false)
{
    mg_mgr mgr;
    mg_mgr_init(&mgr);
    struct mg_connection *conn = nullptr;
    if (origin)
    {
        conn = mg_ws_connect(&mgr, url.c_str(), ws_client_handler, &context,
                             "Origin: %s\r\n", origin->c_str());
    }
    else
    {
        conn = mg_ws_connect(&mgr, url.c_str(), ws_client_handler, &context,
                             nullptr);
    }
    if (conn != nullptr)
    {
        conn->fn_data = &context;
    }

    auto handshake_deadline =
        std::chrono::steady_clock::now() + std::chrono::seconds(5);
    while (context.future.wait_for(std::chrono::milliseconds(0)) ==
               std::future_status::timeout &&
           std::chrono::steady_clock::now() < handshake_deadline)
    {
        mg_mgr_poll(&mgr, 50);
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    if (context.future.wait_for(std::chrono::milliseconds(0)) ==
        std::future_status::timeout)
    {
        context.signal_completion(false);
    }

    if (wait_for_message && context.handshake_success)
    {
        auto message_deadline =
            std::chrono::steady_clock::now() + std::chrono::seconds(5);
        while (context.message_future.wait_for(std::chrono::milliseconds(0)) ==
                   std::future_status::timeout &&
               std::chrono::steady_clock::now() < message_deadline)
        {
            mg_mgr_poll(&mgr, 50);
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
    }

    if (conn != nullptr && context.connection_alive.load(std::memory_order_acquire))
    {
        conn->is_closing = 1;
    }
    mg_mgr_poll(&mgr, 0);
    mg_mgr_free(&mgr);
    context.future.get();
}

} // namespace

struct ServerGuard
{
    explicit ServerGuard(tt::rpc::Server &srv) : server(srv)
    {
    }
    ~ServerGuard()
    {
        server.stop();
    }
    tt::rpc::Server &server;
};

TEST_CASE("rpc endpoint handles session-set and unsupported method")
{
    tt::rpc::Server server{nullptr, std::string{kServerUrl}};
    server.start();
    ServerGuard guard{server};
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    auto session_set_response = send_rpc_request(
        R"({"method":"session-set","arguments":{"download-dir":"."}})");
    ResponseView set_view{session_set_response};
    CHECK(set_view.result() == "success");

    auto unsupported_response =
        send_rpc_request(R"({"method":"does-not-exist","arguments":{}})");
    ResponseView unsupported_view{unsupported_response};
    CHECK(unsupported_view.result() == "error");
    expect_argument(unsupported_view, "message", "unsupported method");
}

TEST_CASE("rpc endpoint enforces token authentication when configured")
{
    tt::rpc::ServerOptions options;
    options.token = "rpc-secret";
    tt::rpc::Server server{nullptr, std::string{kServerUrl}, options};
    server.start();
    ServerGuard guard{server};
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    auto unauthenticated =
        send_rpc_request_once(R"({"method":"session-get","arguments":{}})");
    CHECK(unauthenticated.status_code == 401);

    auto authorized =
        send_rpc_request(R"({"method":"session-get","arguments":{}})",
                         std::string("X-TT-Auth: rpc-secret\r\n"));
    ResponseView auth_view{authorized};
    CHECK(auth_view.result() == "success");
}

TEST_CASE("websocket handshake enforces token authentication")
{
    tt::rpc::ServerOptions options;
    options.token = "rpc-secret";
    tt::rpc::Server server{nullptr, std::string{kServerUrl}, options};
    server.start();
    ServerGuard guard{server};
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    WsTestContext missing_token;
    run_ws_client(missing_token, get_ws_url());
    CHECK(!missing_token.handshake_success);

    WsTestContext with_token;
    run_ws_client(with_token, get_ws_url("?token=rpc-secret"));
    CHECK(with_token.handshake_success);
}

TEST_CASE("websocket snapshot is delivered on connect")
{
    tt::rpc::Server server{nullptr, std::string{kServerUrl}};
    server.start();
    ServerGuard guard{server};
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    WsTestContext ctx;
    run_ws_client(ctx, get_ws_url(), std::nullopt, true);
    CHECK(ctx.handshake_success);
    CHECK(ctx.message_received);

    auto *doc =
        yyjson_read(ctx.message_payload.data(), ctx.message_payload.size(), 0);
    REQUIRE(doc != nullptr);
    auto *root = yyjson_doc_get_root(doc);
    REQUIRE(root != nullptr);
    REQUIRE(yyjson_is_obj(root));
    auto *type = yyjson_obj_get(root, "type");
    REQUIRE(type != nullptr);
    REQUIRE(yyjson_is_str(type));
    std::string type_value = yyjson_get_str(type);
    CHECK(type_value == "sync-snapshot");
    yyjson_doc_free(doc);
}

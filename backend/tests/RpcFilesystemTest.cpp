#include "RpcTestUtils.hpp"
#include "rpc/FsHooks.hpp"
#include "rpc/Server.hpp"
#include "vendor/mongoose.h"

#include <atomic>
#include <chrono>
#include <exception>
#include <filesystem>
#include <future>
#include <optional>
#include <string>
#include <string_view>
#include <thread>

#include <doctest/doctest.h>
#include <yyjson.h>

namespace
{

using namespace tt::tests;

constexpr std::string_view kRpcPath = "/transmission/rpc";
constexpr std::string_view kHostHeader = "127.0.0.1:8092";
constexpr std::string_view kServerUrl = "http://127.0.0.1:8092";

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
        ctx->signal_completion(false);
    }
}

void run_ws_client(
    WsTestContext &context, std::string const &url,
    std::optional<std::string> const &origin = std::nullopt,
    bool wait_for_message = false,
    std::optional<std::string> const &extra_headers = std::nullopt)
{
    mg_mgr mgr;
    mg_mgr_init(&mgr);
    struct mg_connection *conn = nullptr;
    std::string headers;
    if (origin)
    {
        headers += "Origin: " + *origin + "\r\n";
    }
    if (extra_headers)
    {
        auto value = *extra_headers;
        if (!value.empty() && value.back() != '\n')
        {
            value += "\r\n";
        }
        headers += value;
    }
    if (!headers.empty())
    {
        conn = mg_ws_connect(&mgr, url.c_str(), ws_client_handler, &context,
                             "%s", headers.c_str());
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

    if (conn != nullptr)
    {
        conn->is_closing = 1;
    }
    mg_mgr_poll(&mgr, 0);
    mg_mgr_free(&mgr);
    context.future.get();
}

struct FilesystemOverride
{
    explicit FilesystemOverride(
        tt::rpc::filesystem::DirectoryEntriesFn entries = {},
        tt::rpc::filesystem::PathCheckFn exists = {},
        tt::rpc::filesystem::PathCheckFn is_dir = {},
        tt::rpc::filesystem::SpaceQueryFn space = {})
        : previous_entries(
              entries
                  ? tt::rpc::filesystem::set_directory_entries_handler(entries)
                  : tt::rpc::filesystem::DirectoryEntriesFn{}),
          previous_exists(
              exists ? tt::rpc::filesystem::set_path_exists_handler(exists)
                     : tt::rpc::filesystem::PathCheckFn{}),
          previous_is_directory(
              is_dir ? tt::rpc::filesystem::set_is_directory_handler(is_dir)
                     : tt::rpc::filesystem::PathCheckFn{}),
          previous_space(
              space ? tt::rpc::filesystem::set_space_query_handler(space)
                    : tt::rpc::filesystem::SpaceQueryFn{})
    {
        entries_overridden = static_cast<bool>(entries);
        exists_overridden = static_cast<bool>(exists);
        is_directory_overridden = static_cast<bool>(is_dir);
        space_overridden = static_cast<bool>(space);
    }

    ~FilesystemOverride()
    {
        if (entries_overridden)
        {
            tt::rpc::filesystem::set_directory_entries_handler(
                previous_entries);
        }
        if (exists_overridden)
        {
            tt::rpc::filesystem::set_path_exists_handler(previous_exists);
        }
        if (is_directory_overridden)
        {
            tt::rpc::filesystem::set_is_directory_handler(
                previous_is_directory);
        }
        if (space_overridden)
        {
            tt::rpc::filesystem::set_space_query_handler(previous_space);
        }
    }

    tt::rpc::filesystem::DirectoryEntriesFn previous_entries;
    tt::rpc::filesystem::PathCheckFn previous_exists;
    tt::rpc::filesystem::PathCheckFn previous_is_directory;
    tt::rpc::filesystem::SpaceQueryFn previous_space;
    bool entries_overridden = false;
    bool exists_overridden = false;
    bool is_directory_overridden = false;
    bool space_overridden = false;
};

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

} // namespace

TEST_CASE("fs-browse honors mocked directory entries")
{
    FilesystemOverride override(
        [](std::filesystem::path const &)
        {
            return std::vector<tt::rpc::FsEntry>{
                {{"fake.txt"}, {"file"}, 123}, {{"folder"}, {"directory"}, 0}};
        },
        [](std::filesystem::path const &) { return true; },
        [](std::filesystem::path const &) { return true; });

    tt::rpc::Server server{nullptr, std::string{kServerUrl}};
    server.start();
    ServerGuard guard{server};
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    auto response = send_rpc_request(
        R"({"method":"fs-browse","arguments":{"path":"C:\\fake"}})");
    ResponseView view{response};
    auto *arguments = view.arguments();
    REQUIRE(arguments != nullptr);
    auto *entries = yyjson_obj_get(arguments, "entries");
    REQUIRE(entries != nullptr);
    REQUIRE(yyjson_is_arr(entries));
    size_t idx, limit;
    yyjson_val *entry = nullptr;
    bool found_fake = false;
    yyjson_arr_foreach(entries, idx, limit, entry)
    {
        auto *name = yyjson_obj_get(entry, "name");
        if (name && yyjson_is_str(name) &&
            std::string_view(yyjson_get_str(name)) == "fake.txt")
        {
            found_fake = true;
        }
    }
    CHECK(found_fake);
}

TEST_CASE("fs-space reports mocked metrics")
{
    FilesystemOverride override(
        {}, [](std::filesystem::path const &) { return true; },
        [](std::filesystem::path const &) { return true; },
        [](std::filesystem::path const &)
        {
            std::filesystem::space_info info{};
            info.capacity = 2048;
            info.available = 512;
            return std::optional<std::filesystem::space_info>(info);
        });

    tt::rpc::Server server{nullptr, std::string{kServerUrl}};
    server.start();
    ServerGuard guard{server};
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    auto response = send_rpc_request(
        R"({"method":"fs-space","arguments":{"path":"C:\\fake"}})");
    ResponseView view{response};
    auto *arguments = view.arguments();
    REQUIRE(arguments != nullptr);
    auto *free_bytes = yyjson_obj_get(arguments, "freeBytes");
    auto *total_bytes = yyjson_obj_get(arguments, "totalBytes");
    REQUIRE(free_bytes);
    REQUIRE(total_bytes);
    CHECK(yyjson_is_uint(free_bytes));
    CHECK(yyjson_is_uint(total_bytes));
    CHECK(yyjson_get_uint(free_bytes) == 512);
    CHECK(yyjson_get_uint(total_bytes) == 2048);
}

TEST_CASE("websocket handshake accepts X-TT-Auth header")
{
    tt::rpc::ServerOptions options;
    options.token = "rpc-secret";
    tt::rpc::Server server{nullptr, std::string{kServerUrl}, options};
    server.start();
    ServerGuard guard{server};
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    WsTestContext ctx;
    run_ws_client(ctx, "ws://127.0.0.1:8092/ws", std::nullopt, false,
                  std::string("X-TT-Auth: rpc-secret\r\n"));
    CHECK(ctx.handshake_success);
}

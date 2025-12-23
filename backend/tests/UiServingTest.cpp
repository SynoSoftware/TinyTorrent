#include "utils/FS.hpp"

#include "vendor/mongoose.h"
#include <doctest/doctest.h>
#include <yyjson.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <future>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace
{

struct ConnectionInfo
{
    std::uint16_t port = 0;
    std::string token;
    std::uint64_t pid = 0;
};

struct HttpResponse
{
    int status_code = 0;
    std::string body;
    std::optional<std::size_t> content_length;
};

struct HttpClientContext
{
    explicit HttpClientContext(std::string request_payload)
        : request(std::move(request_payload)), future(ready.get_future())
    {
    }

    std::string request;
    std::string response;
    std::optional<std::size_t> content_length;
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
    auto *ctx = static_cast<HttpClientContext *>(conn->fn_data);
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
        if (auto *length = mg_http_get_header(hm, "Content-Length"))
        {
            try
            {
                ctx->content_length = static_cast<std::size_t>(
                    std::stoull(std::string(length->buf, length->len)));
            }
            catch (...)
            {
            }
        }
        ctx->signal_success();
        conn->is_closing = 1;
    }
    else if (ev == MG_EV_ERROR)
    {
        ctx->signal_failure(
            std::make_exception_ptr(std::runtime_error("HTTP error")));
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
                std::runtime_error("HTTP request aborted")));
        }
    }
}

HttpResponse fetch_url(std::string const &url)
{
    auto scheme_pos = url.find("//");
    auto host_start = (scheme_pos == std::string::npos) ? 0 : scheme_pos + 2;
    auto path_pos = url.find('/', host_start);
    auto host = path_pos == std::string::npos
                    ? url.substr(host_start)
                    : url.substr(host_start, path_pos - host_start);
    std::string path = (path_pos == std::string::npos) ? std::string("/")
                                                       : url.substr(path_pos);
    auto request = std::string("GET ") + path + " HTTP/1.1\r\nHost: " + host +
                   "\r\nConnection: close\r\n\r\n";

    HttpClientContext context(std::move(request));
    mg_mgr mgr;
    mg_mgr_init(&mgr);
    struct mg_connection *conn =
        mg_http_connect(&mgr, url.c_str(), http_client_handler, &context);
    if (conn != nullptr)
    {
        conn->fn_data = &context;
    }
    if (conn == nullptr)
    {
        mg_mgr_free(&mgr);
        throw std::runtime_error("failed to connect to HTTP endpoint");
    }

    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    while (context.future.wait_for(std::chrono::milliseconds(0)) ==
               std::future_status::timeout &&
           std::chrono::steady_clock::now() < deadline)
    {
        mg_mgr_poll(&mgr, 50);
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }

    if (!context.completed.load(std::memory_order_acquire))
    {
        context.signal_failure(std::make_exception_ptr(
            std::runtime_error("HTTP response timed out")));
    }

    mg_mgr_free(&mgr);
    context.future.get();

    HttpResponse response;
    response.status_code = context.status_code;
    response.body = std::move(context.response);
    response.content_length = context.content_length;
    return response;
}

std::optional<ConnectionInfo> parse_connection_json(std::string const &payload)
{
    auto *doc = yyjson_read(payload.data(), payload.size(), 0);
    if (doc == nullptr)
    {
        return std::nullopt;
    }
    auto *root = yyjson_doc_get_root(doc);
    if (root == nullptr || !yyjson_is_obj(root))
    {
        yyjson_doc_free(doc);
        return std::nullopt;
    }
    auto *port_val = yyjson_obj_get(root, "port");
    auto *token_val = yyjson_obj_get(root, "token");
    auto *pid_val = yyjson_obj_get(root, "pid");
    if (port_val == nullptr || !yyjson_is_int(port_val) || pid_val == nullptr ||
        !yyjson_is_int(pid_val))
    {
        yyjson_doc_free(doc);
        return std::nullopt;
    }
    ConnectionInfo info;
    info.port = static_cast<std::uint16_t>(yyjson_get_int(port_val));
    if (token_val != nullptr && yyjson_is_str(token_val))
    {
        info.token = yyjson_get_str(token_val);
    }
    info.pid = static_cast<std::uint64_t>(yyjson_get_int(pid_val));
    yyjson_doc_free(doc);
    if (info.port == 0)
    {
        return std::nullopt;
    }
    return info;
}

std::optional<ConnectionInfo>
wait_for_connection(std::filesystem::path const &path,
                    std::chrono::milliseconds timeout)
{
    auto deadline = std::chrono::steady_clock::now() + timeout;
    while (std::chrono::steady_clock::now() < deadline)
    {
        std::ifstream input(path, std::ios::binary);
        if (input)
        {
            std::string payload((std::istreambuf_iterator<char>(input)),
                                std::istreambuf_iterator<char>());
            if (auto info = parse_connection_json(payload); info)
            {
                return info;
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    return std::nullopt;
}

std::vector<std::string> extract_asset_paths(std::string const &html)
{
    std::vector<std::string> paths;
    auto add_unique = [&](std::string value)
    {
        if (value.empty())
        {
            return;
        }
        if (std::find(paths.begin(), paths.end(), value) == paths.end())
        {
            paths.emplace_back(std::move(value));
        }
    };

    std::string needle = "/assets/";
    std::size_t pos = 0;
    while ((pos = html.find(needle, pos)) != std::string::npos)
    {
        auto end = html.find_first_of("\"'<> \t\r\n", pos);
        if (end == std::string::npos)
        {
            end = html.size();
        }
        add_unique(html.substr(pos, end - pos));
        pos = end;
    }

    if (html.find("tinyTorrent.svg") != std::string::npos)
    {
        add_unique("/tinyTorrent.svg");
    }

    return paths;
}

class ThreadJoiner
{
  public:
    explicit ThreadJoiner(std::thread &&thread) : thread_(std::move(thread))
    {
    }
    ~ThreadJoiner()
    {
        if (thread_.joinable())
        {
            thread_.join();
        }
    }

    ThreadJoiner(ThreadJoiner const &) = delete;
    ThreadJoiner &operator=(ThreadJoiner const &) = delete;
    ThreadJoiner(ThreadJoiner &&) = delete;
    ThreadJoiner &operator=(ThreadJoiner &&) = delete;

  private:
    std::thread thread_;
};

std::filesystem::path resolve_engine_path()
{
    const char *env = std::getenv("TT_ENGINE_PATH");
    REQUIRE(env != nullptr);

    std::filesystem::path engine_path(env);
    REQUIRE(std::filesystem::exists(engine_path));

    return engine_path;
}

} // namespace

TEST_CASE("tt-engine serves packed UI assets")
{
    auto engine_path = resolve_engine_path();
    REQUIRE(std::filesystem::exists(engine_path));

    auto data_dir = engine_path.parent_path() / "data";
    std::filesystem::create_directories(data_dir);
    auto connection_file = data_dir / "connection.json";
    std::error_code remove_ec;
    std::filesystem::remove(connection_file, remove_ec);

    std::string command =
        std::string("\"") + engine_path.string() + "\" --run-seconds=4";
    [[maybe_unused]] ThreadJoiner engine_thread(std::thread(
        [cmd = std::move(command)]() { std::system(cmd.c_str()); }));

    auto info =
        wait_for_connection(connection_file, std::chrono::milliseconds(1500));
    REQUIRE(info.has_value());
    REQUIRE(info->port != 0);

    auto base_url =
        std::string("http://127.0.0.1:") + std::to_string(info->port);

    auto root = fetch_url(base_url + "/");
    CHECK(root.status_code == 200);
    CHECK_FALSE(root.body.empty());
    if (root.content_length)
    {
        CHECK(*root.content_length == root.body.size());
    }

    auto assets = extract_asset_paths(root.body);
    CHECK(assets.size() >= 2);

    bool saw_svg = false;
    for (auto const &path : assets)
    {
        if (path.find("tinyTorrent.svg") != std::string::npos)
        {
            saw_svg = true;
        }
        auto response = fetch_url(base_url + path);
        CHECK(response.status_code == 200);
        CHECK_FALSE(response.body.empty());
        if (response.content_length)
        {
            CHECK(*response.content_length == response.body.size());
        }
    }

    CHECK(saw_svg);
}

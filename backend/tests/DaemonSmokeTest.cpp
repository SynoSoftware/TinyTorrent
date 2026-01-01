#include "RpcTestUtils.hpp"
#include "engine/TorrentUtils.hpp"
#include "rpc/Server.hpp"
#include "utils/Base64.hpp"
#include "vendor/mongoose.h"

#include <doctest/doctest.h>
#include <yyjson.h>

#include <chrono>
#include <filesystem>
#include <fstream>
#include <functional>
#include <future>
#include <optional>
#include <string>
#include <thread>
#include <atomic>
#include <system_error>
#include <vector>

#include <libtorrent/bencode.hpp>
#include <libtorrent/create_torrent.hpp>
#include <libtorrent/file_storage.hpp>

namespace
{
using namespace tt::tests;

constexpr std::string_view kRpcPath = "/transmission/rpc";

struct HttpClientContext
{
    explicit HttpClientContext(std::string request_payload)
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

std::string build_http_request(std::string const &host_header,
                               std::string_view payload,
                               std::string const &session_id = {},
                               std::string const &extra_headers = {})
{
    std::string request;
    request.reserve(256 + payload.size());
    request += "POST ";
    request += kRpcPath;
    request += " HTTP/1.1\r\nHost: ";
    request += host_header;
    request += "\r\nContent-Type: application/json\r\nContent-Length: ";
    request += std::to_string(payload.size());
    if (!session_id.empty())
    {
        request += "\r\nX-Transmission-Session-Id: ";
        request += session_id;
    }
    if (!extra_headers.empty())
    {
        auto sanitized = extra_headers;
        while (sanitized.size() >= 2 &&
               sanitized.substr(sanitized.size() - 2) == "\r\n")
        {
            sanitized.resize(sanitized.size() - 2);
        }
        request += "\r\n";
        request += sanitized;
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

RpcResponse send_rpc_request_once(std::string const &server_url,
                                  std::string const &host_header,
                                  std::string_view payload,
                                  std::string const &session_id = {},
                                  std::string const &extra_headers = {})
{
    auto request = build_http_request(host_header, payload, session_id,
                                      extra_headers);
    HttpClientContext context(std::move(request));
    mg_mgr mgr;
    mg_mgr_init(&mgr);
    struct mg_connection *conn = mg_http_connect(
        &mgr, server_url.c_str(), http_client_handler, &context);
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

std::string send_rpc_request(std::string const &server_url,
                             std::string const &host_header,
                             std::string_view payload,
                             std::string const &extra_headers = {})
{
    auto response = send_rpc_request_once(server_url, host_header, payload, {},
                                          extra_headers);
    if (response.status_code == 409)
    {
        if (response.session_id.empty())
        {
            throw std::runtime_error("session handshake missing header");
        }
        response = send_rpc_request_once(server_url, host_header, payload,
                                         response.session_id, extra_headers);
    }
    if (response.status_code != 200)
    {
        throw std::runtime_error("unexpected RPC response status");
    }
    return response.body;
}

struct TorrentSummary
{
    int id = 0;
    std::string hash;
    std::string state;
    int status = 0;
    int error = 0;
    std::uint64_t tracker_announces = 0;
    std::uint64_t dht_replies = 0;
    std::uint64_t peer_connections = 0;
    std::uint64_t rehash_start_count = 0;
    std::uint64_t rehash_complete_count = 0;
    bool rehash_active = false;
};

std::optional<TorrentSummary> parse_torrent_summary(std::string const &payload)
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
    auto *arguments = yyjson_obj_get(root, "arguments");
    if (arguments == nullptr || !yyjson_is_obj(arguments))
    {
        yyjson_doc_free(doc);
        return std::nullopt;
    }
    auto *array = yyjson_obj_get(arguments, "torrents");
    if (array == nullptr || !yyjson_is_arr(array))
    {
        yyjson_doc_free(doc);
        return std::nullopt;
    }
    if (yyjson_arr_size(array) == 0)
    {
        yyjson_doc_free(doc);
        return std::nullopt;
    }
    auto *item = yyjson_arr_get(array, 0);
    if (item == nullptr || !yyjson_is_obj(item))
    {
        yyjson_doc_free(doc);
        return std::nullopt;
    }
    TorrentSummary summary;
    auto parse_int = [](yyjson_val *value) -> std::optional<int> {
        if (value == nullptr)
        {
            return std::nullopt;
        }
        if (yyjson_is_sint(value))
        {
            return static_cast<int>(yyjson_get_sint(value));
        }
        if (yyjson_is_uint(value))
        {
            return static_cast<int>(yyjson_get_uint(value));
        }
        return std::nullopt;
    };
    if (auto *id_val = yyjson_obj_get(item, "id"))
    {
        if (auto parsed = parse_int(id_val))
        {
            summary.id = *parsed;
        }
    }
    if (auto *hash_val = yyjson_obj_get(item, "hashString"); hash_val &&
        yyjson_is_str(hash_val))
    {
        summary.hash = yyjson_get_str(hash_val);
    }
    if (auto *state_val = yyjson_obj_get(item, "state"); state_val &&
        yyjson_is_str(state_val))
    {
        summary.state = yyjson_get_str(state_val);
    }
    if (auto *status_val = yyjson_obj_get(item, "status"); status_val)
    {
        if (auto parsed = parse_int(status_val))
        {
            summary.status = *parsed;
        }
    }
    if (auto *error_val = yyjson_obj_get(item, "error"); error_val)
    {
        if (auto parsed = parse_int(error_val))
        {
            summary.error = *parsed;
        }
    }
    if (auto *tracker_val = yyjson_obj_get(item, "trackerAnnounces");
        tracker_val && yyjson_is_uint(tracker_val))
    {
        summary.tracker_announces = yyjson_get_uint(tracker_val);
    }
    if (auto *dht_val = yyjson_obj_get(item, "dhtReplies"); dht_val &&
        yyjson_is_uint(dht_val))
    {
        summary.dht_replies = yyjson_get_uint(dht_val);
    }
    if (auto *peer_val = yyjson_obj_get(item, "peerConnections"); peer_val &&
        yyjson_is_uint(peer_val))
    {
        summary.peer_connections = yyjson_get_uint(peer_val);
    }
    if (auto *rehash_start = yyjson_obj_get(item, "rehashStartCount");
        rehash_start && yyjson_is_uint(rehash_start))
    {
        summary.rehash_start_count = yyjson_get_uint(rehash_start);
    }
    if (auto *rehash_complete =
            yyjson_obj_get(item, "rehashCompleteCount");
        rehash_complete && yyjson_is_uint(rehash_complete))
    {
        summary.rehash_complete_count = yyjson_get_uint(rehash_complete);
    }
    if (auto *rehash_active = yyjson_obj_get(item, "rehashActive");
        rehash_active && yyjson_is_bool(rehash_active))
    {
        summary.rehash_active = yyjson_get_bool(rehash_active);
    }
    yyjson_doc_free(doc);
    return summary;
}

std::optional<TorrentSummary> fetch_first_torrent(
    std::string const &server_url, std::string const &host_header,
    std::string const &extra_headers)
{
    auto payload =
        R"({"method":"torrent-get","arguments":{"fields":["id","hashString","state","status","error","trackerAnnounces","dhtReplies","peerConnections"]}})";
    auto response =
        send_rpc_request(server_url, host_header, payload, extra_headers);
    return parse_torrent_summary(response);
}

TorrentSummary wait_for_summary(std::string const &server_url,
                                std::string const &host_header,
                                std::string const &expected_hash,
                                std::string const &extra_headers,
                                std::function<bool(TorrentSummary const &)> predicate,
                                std::chrono::seconds timeout,
                                char const *message)
{
    auto deadline = std::chrono::steady_clock::now() + timeout;
    while (std::chrono::steady_clock::now() < deadline)
    {
        if (auto summary = fetch_first_torrent(server_url, host_header,
                                                extra_headers);
            summary && (expected_hash.empty() || summary->hash == expected_hash))
        {
            if (predicate(*summary))
            {
                return *summary;
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(25));
    }
    FAIL(message);
    return TorrentSummary{};
}

struct DaemonInstance
{
    std::unique_ptr<tt::engine::Core> core;
    std::thread engine_thread;
    std::unique_ptr<tt::rpc::Server> server;
    std::string server_url;
    std::string host_header;
    std::string token;
    DaemonInstance() = default;
    ~DaemonInstance();
    DaemonInstance(DaemonInstance &&) = default;
    DaemonInstance &operator=(DaemonInstance &&) = default;
};

DaemonInstance start_daemon(tt::engine::CoreSettings const &settings)
{
    DaemonInstance instance;
    instance.core = tt::engine::Core::create(settings);
    instance.engine_thread = std::thread([core = instance.core.get()] { core->run(); });
    auto server = std::make_unique<tt::rpc::Server>(instance.core.get(), "http://127.0.0.1:0");
    server->start();
    REQUIRE(server->wait_until_ready(std::chrono::seconds(5)));
    auto info = server->connection_info();
    REQUIRE(info);
    REQUIRE(info->port != 0);
    instance.token = info->token;
    auto port = info->port;
    instance.server_url = std::string("http://127.0.0.1:") + std::to_string(port);
    instance.host_header = std::string("127.0.0.1:") + std::to_string(port);
    instance.server = std::move(server);
    return instance;
}

void stop_daemon(DaemonInstance &instance)
{
    if (instance.server)
    {
        instance.server->stop();
    }
    if (instance.core)
    {
        instance.core->stop();
    }
    if (instance.engine_thread.joinable())
    {
        instance.engine_thread.join();
    }
    instance.server.reset();
    instance.core.reset();
}

DaemonInstance::~DaemonInstance()
{
    stop_daemon(*this);
}

bool parse_state_store_loaded(std::string const &payload)
{
    ResponseView view(payload);
    expect_result(view, "success", "session-store-status");
    auto *arguments = view.arguments();
    if (arguments == nullptr)
    {
        return false;
    }
    auto *value = yyjson_obj_get(arguments, "ready");
    return value && yyjson_is_bool(value) && yyjson_get_bool(value);
}

} // namespace

TEST_CASE("DaemonSmoke_Add_Persist_Rehash_Delete")
{
    auto temp_root = std::filesystem::temp_directory_path() /
                     ("tinytorrent-smoke-" +
                      std::to_string(std::chrono::steady_clock::now()
                                       .time_since_epoch()
                                       .count()));
    std::error_code ec;
    std::filesystem::remove_all(temp_root, ec);
    auto state_dir = temp_root / "state";
    auto download_dir = temp_root / "downloads";
    auto blocklist_dir = temp_root / "blocklists";
    std::filesystem::create_directories(state_dir, ec);
    std::filesystem::create_directories(download_dir, ec);
    std::filesystem::create_directories(blocklist_dir, ec);

    tt::engine::CoreSettings settings;
    settings.download_path = download_dir;
    settings.state_path = state_dir / "tinytorrent.db";
    settings.blocklist_path = blocklist_dir / "blocklist.txt";

    auto instance = start_daemon(settings);
    auto auth_header = std::string("X-TT-Auth: ") + instance.token;

    auto store_status_payload =
        R"({"method":"session-store-status","arguments":{}})";
    auto store_status_response =
        send_rpc_request(instance.server_url, instance.host_header,
                         store_status_payload, auth_header);
    REQUIRE(parse_state_store_loaded(store_status_response));

    auto list_payload =
        R"({"method":"torrent-get","arguments":{"fields":["hashString"]}})";
    auto list_response =
        send_rpc_request(instance.server_url, instance.host_header, list_payload,
                         auth_header);
    {
        ResponseView view(list_response);
        expect_result(view, "success", "torrent-get");
        auto *arguments = view.arguments();
        REQUIRE(arguments != nullptr);
        auto *torrents = yyjson_obj_get(arguments, "torrents");
        REQUIRE(torrents != nullptr);
        CHECK(yyjson_arr_size(torrents) == 0);
    }

    auto download_dir_json = escape_json_string(download_dir.string());
    auto session_set_payload =
        std::string(R"({"method":"session-set","arguments":{"download-dir":")") +
        download_dir_json + R"("}})";
    auto session_set_response = send_rpc_request(
        instance.server_url, instance.host_header, session_set_payload,
        auth_header);
    {
        ResponseView view(session_set_response);
        expect_result(view, "success", "session-set");
    }

    std::string expected_hash;

    auto sample_path = download_dir / "sample.bin";
    {
        std::vector<char> blob(4 * 1024 * 1024, 'T');
        std::ofstream output(sample_path, std::ios::binary);
        REQUIRE(output);
        output.write(blob.data(), static_cast<std::streamsize>(blob.size()));
    }

    libtorrent::file_storage storage;
    storage.add_file("sample.bin",
                     static_cast<std::int64_t>(
                         std::filesystem::file_size(sample_path)));
    libtorrent::create_torrent ct(storage, 256);
    ct.add_tracker("http://127.0.0.1:9999/announce");
    libtorrent::set_piece_hashes(ct, download_dir.string());
    libtorrent::entry info_entry = ct.generate();
    std::vector<char> encoded;
    libtorrent::bencode(std::back_inserter(encoded), info_entry);
    std::vector<std::uint8_t> metainfo(encoded.begin(), encoded.end());

    auto metainfo_base64 = tt::utils::encode_base64(metainfo);
    auto add_payload = std::string("{\"method\":\"torrent-add\",\"arguments\":{\"") +
                       "metainfo\":\"" + metainfo_base64 + "\"}}";
    auto add_response = send_rpc_request(instance.server_url,
                                        instance.host_header, add_payload,
                                        auth_header);
    {
        ResponseView view(add_response);
        expect_result(view, "success", "torrent-add");
    }

    auto summary = wait_for_summary(
        instance.server_url, instance.host_header, expected_hash, auth_header,
        [](TorrentSummary const &summary) {
            return summary.tracker_announces > 0 ||
                   summary.dht_replies > 0 ||
                   summary.peer_connections > 0;
        },
        std::chrono::seconds(30),
        "torrent never attempted network activity");
    expected_hash = summary.hash;
    REQUIRE(summary.hash == expected_hash);
    CHECK(summary.status != 0);
    CHECK(summary.status != 3);
    REQUIRE(summary.error == 0);
    bool summary_has_network_activity =
        summary.tracker_announces > 0 || summary.dht_replies > 0 ||
        summary.peer_connections > 0;
    CHECK(summary_has_network_activity);

    auto stored_id = summary.id;

    auto verify_payload = std::string("{\"method\":\"torrent-verify\",\"arguments\":{\"ids\":[") +
                          std::to_string(stored_id) + "]}}";
    auto verify_response = send_rpc_request(instance.server_url,
                                            instance.host_header, verify_payload,
                                            auth_header);
    {
        ResponseView view(verify_response);
        expect_result(view, "success", "torrent-verify");
    }

    stop_daemon(instance);

    auto instance2 = start_daemon(settings);
    auto auth_header2 = std::string("X-TT-Auth: ") + instance2.token;
    auto restart_store_status =
        send_rpc_request(instance2.server_url, instance2.host_header,
                         store_status_payload, auth_header2);
    REQUIRE(parse_state_store_loaded(restart_store_status));
    auto restarted = wait_for_summary(
        instance2.server_url, instance2.host_header, expected_hash,
        auth_header2, [](TorrentSummary const &summary) { return true; },
        std::chrono::seconds(30), "torrent dropped on restart");
    REQUIRE(restarted.hash == expected_hash);

    auto rehash_payload = std::string("{\"method\":\"torrent-verify\",\"arguments\":{\"ids\":[") +
                          std::to_string(restarted.id) + "]}}";
    auto rehash_response = send_rpc_request(instance2.server_url,
                                            instance2.host_header, rehash_payload,
                                            auth_header2);
    {
        ResponseView view(rehash_response);
        expect_result(view, "success", "torrent-verify");
    }

    auto rehash_start_before = restarted.rehash_start_count;
    auto rehash_complete_before = restarted.rehash_complete_count;
    bool rehash_started = false;
    bool rehash_completed = false;
    auto rehash_summary = wait_for_summary(
        instance2.server_url, instance2.host_header, expected_hash,
        auth_header2,
        [&](TorrentSummary const &summary) {
            if (!rehash_started &&
                summary.rehash_start_count > rehash_start_before)
            {
                rehash_started = true;
            }
            if (!rehash_completed &&
                summary.rehash_complete_count > rehash_complete_before)
            {
                rehash_completed = true;
            }
            return rehash_started && rehash_completed;
        },
        std::chrono::seconds(30), "rehash never completed");
    CHECK(rehash_started);
    CHECK(rehash_completed);
    REQUIRE(rehash_summary.hash == expected_hash);
    REQUIRE(rehash_summary.error == 0);
    CHECK(!rehash_summary.rehash_active);

    auto remove_payload = std::string("{\"method\":\"torrent-remove\",\"arguments\":{\"ids\":[") +
                          std::to_string(restarted.id) +
                          "],\"delete-local-data\":true}}";
    auto remove_response = send_rpc_request(instance2.server_url,
                                            instance2.host_header, remove_payload,
                                            auth_header2);
    {
        ResponseView view(remove_response);
        expect_result(view, "success", "torrent-remove");
    }

    stop_daemon(instance2);

    auto file_deadline =
        std::chrono::steady_clock::now() + std::chrono::seconds(10);
    while (std::chrono::steady_clock::now() < file_deadline)
    {
        if (!std::filesystem::exists(sample_path))
        {
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    CHECK(!std::filesystem::exists(sample_path));

    auto instance3 = start_daemon(settings);
    auto auth_header3 = std::string("X-TT-Auth: ") + instance3.token;
    auto restart_store_status2 =
        send_rpc_request(instance3.server_url, instance3.host_header,
                         store_status_payload, auth_header3);
    REQUIRE(parse_state_store_loaded(restart_store_status2));
    auto list_response_after_remove =
        send_rpc_request(instance3.server_url, instance3.host_header,
                         list_payload, auth_header3);
    {
        ResponseView view(list_response_after_remove);
        expect_result(view, "success", "torrent-get");
        auto *arguments = view.arguments();
        REQUIRE(arguments != nullptr);
        auto *torrents = yyjson_obj_get(arguments, "torrents");
        REQUIRE(torrents != nullptr);
        CHECK(yyjson_arr_size(torrents) == 0);
    }
    stop_daemon(instance3);
    std::filesystem::remove_all(temp_root, ec);
}

#include "rpc/Dispatcher.hpp"
#include "RpcTestUtils.hpp"
#include "utils/Version.hpp"

#include <doctest/doctest.h>

#include <filesystem>
#include <fstream>
#include <string_view>
#include <system_error>
#include <thread>
#include <yyjson.h>


namespace
{

using namespace tt::tests;

void expect_engine_unavailable(ResponseView const &response,
                               char const *context)
{
    expect_result(response, "error", context);
    expect_argument(response, "message", "engine unavailable");
}


} // namespace

TEST_CASE("empty payload")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(dispatcher, "");
    ResponseView view{response};
    expect_result(view, "error", "empty payload");
    expect_argument(view, "message", "empty RPC payload");
}

TEST_CASE("invalid json")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(dispatcher, "{");
    ResponseView view{response};
    expect_result(view, "error", "invalid json");
    expect_argument(view, "message", "invalid JSON");
}

TEST_CASE("session-set")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher,
        R"({"method":"session-set","arguments":{"download-dir":"."}})");
    ResponseView view{response};
    expect_result(view, "success", "session-set");
}

TEST_CASE("session-set creates missing download directory")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto temp_root =
        std::filesystem::temp_directory_path() / "tinytorrent-controls";
    auto download_dir = temp_root / "session-set" / "download";
    std::filesystem::remove_all(temp_root);
    auto request =
        std::string(
            R"({"method":"session-set","arguments":{"download-dir":")") +
        escape_json_string(download_dir.string()) + R"("}})";
    auto response = dispatch_sync(dispatcher, request);
    ResponseView view{response};
    expect_result(view, "success", "session-set auto-create");
    CHECK(std::filesystem::exists(download_dir));
    std::error_code remove_ec;
    std::filesystem::remove_all(temp_root, remove_ec);
}

TEST_CASE("session-test")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"session-test","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "session-test");
    expect_bool_argument(view, "portIsOpen", false);
}

TEST_CASE("tt-get-capabilities reports features")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"tt-get-capabilities","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "tt-get-capabilities");
    auto *arguments = view.arguments();
    CHECK(arguments != nullptr);
    auto *version = yyjson_obj_get(arguments, "server-version");
    CHECK(version != nullptr);
    CHECK(yyjson_is_str(version));
    CHECK(std::string_view(yyjson_get_str(version)) == "TinyTorrent 1.1.0");
    auto *features = yyjson_obj_get(arguments, "features");
    CHECK(features != nullptr);
    CHECK(yyjson_is_arr(features));
    auto has_feature = [&](std::string_view feature)
    {
        size_t idx, limit;
        yyjson_val *value = nullptr;
        yyjson_arr_foreach(features, idx, limit, value)
        {
            if (yyjson_is_str(value) &&
                std::string_view(yyjson_get_str(value)) == feature)
            {
                return true;
            }
        }
        return false;
    };
    CHECK(has_feature("session-tray-status"));
    CHECK(has_feature("labels"));
    CHECK(has_feature("labels-registry"));
    CHECK(has_feature("path-auto-creation"));
    CHECK(has_feature("metainfo-path-injection"));
    CHECK(has_feature("websocket-delta-sync"));
    CHECK(has_feature("sequence-sync"));
    CHECK(has_feature("proxy-configuration"));
    CHECK(has_feature("sequential-download"));
    CHECK(has_feature("super-seeding"));
    CHECK_FALSE(has_feature("fs-browse"));
    CHECK_FALSE(has_feature("system-open"));
}

TEST_CASE("session-stats")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"session-stats","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "session-stats");
    if (!yyjson_is_obj(view.arguments()))
    {
        throw std::runtime_error("session-stats: missing arguments object");
    }
}

TEST_CASE("session-close")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"session-close","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "session-close");
}

TEST_CASE("free-space missing path")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response =
        dispatch_sync(dispatcher, R"({"method":"free-space","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "free-space missing path");
    expect_argument(view, "message", "path argument required");
}

TEST_CASE("free-space success")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"free-space","arguments":{"path":"."}})");
    ResponseView view{response};
    expect_result(view, "success", "free-space success");
    expect_argument(view, "path", ".");
}

TEST_CASE("torrent-add engine unavailable")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response =
        dispatch_sync(dispatcher, R"({"method":"torrent-add","arguments":{}})");
    ResponseView view{response};
    expect_engine_unavailable(view, "torrent-add engine unavailable");
}

TEST_CASE("torrent-start missing ids")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"torrent-start","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "torrent-start missing ids");
    expect_argument(view, "message", "ids required");
}

TEST_CASE("torrent-remove missing ids")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"torrent-remove","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "torrent-remove missing ids");
    expect_argument(view, "message", "ids required");
}

TEST_CASE("torrent-set engine unavailable")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"torrent-set","arguments":{"ids":[1]}})");
    ResponseView view{response};
    expect_engine_unavailable(view, "torrent-set engine unavailable");
}

TEST_CASE("torrent-rename-path missing")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"torrent-rename-path","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "torrent-rename-path missing");
    expect_argument(view, "message", "ids, path and name required");
}

TEST_CASE("group-set no-op")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response =
        dispatch_sync(dispatcher, R"({"method":"group-set","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "group-set");
}

TEST_CASE("blocklist-update engine unavailable")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"blocklist-update","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "blocklist-update engine unavailable");
    expect_argument(view, "message", "engine unavailable");
}

TEST_CASE("unsupported method")
{
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"invalid-method","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "unsupported method");
    expect_argument(view, "message", "unsupported method");
}

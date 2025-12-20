#include "rpc/DialogHelpers.hpp"
#include "rpc/Dispatcher.hpp"
#include "RpcTestUtils.hpp"
#include "utils/Version.hpp"

#include <doctest/doctest.h>

#include <yyjson.h>
#include <filesystem>
#include <fstream>
#include <string_view>
#include <system_error>

using tt::rpc::DialogPathOutcome;
using tt::rpc::DialogPathsOutcome;
using tt::rpc::FolderDialogOptions;
using tt::rpc::OpenDialogOptions;
using tt::rpc::SaveDialogOptions;

namespace
{

using namespace tt::tests;

void expect_engine_unavailable(ResponseView const &response,
                               char const *context)
{
    expect_result(response, "error", context);
    expect_argument(response, "message", "engine unavailable");
}

#if defined(_WIN32)
struct DialogHandlerScope
{
    DialogHandlerScope()
    {
        tt::rpc::test::reset_dialog_handlers();
    }
    ~DialogHandlerScope()
    {
        tt::rpc::test::reset_dialog_handlers();
    }
};
#endif

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
    auto temp_root = std::filesystem::temp_directory_path() /
                     "tinytorrent-controls";
    auto download_dir = temp_root / "session-set" / "download";
    std::filesystem::remove_all(temp_root);
    auto request = std::string(
                       R"({"method":"session-set","arguments":{"download-dir":")") +
                   escape_json_string(download_dir.string()) +
                   R"("}})";
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
    CHECK(std::string_view(yyjson_get_str(version)) ==
          tt::version::kDisplayVersion);
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
    CHECK(has_feature("fs-browse"));
    CHECK(has_feature("fs-space"));
    CHECK(has_feature("fs-write-file"));
    CHECK(has_feature("system-open"));
    CHECK(has_feature("system-register-handler"));
#if defined(_WIN32)
    CHECK(has_feature("native-dialogs"));
#endif
}

#if defined(_WIN32)
TEST_CASE("dialog-open-file returns handler paths")
{
    DialogHandlerScope guard;
    tt::rpc::test::override_dialog_open_handler(
        [](OpenDialogOptions const &) -> DialogPathsOutcome
        {
            DialogPathsOutcome outcome;
            outcome.paths.push_back("C:\\Users\\user\\Downloads\\file.torrent");
            return outcome;
        });
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"dialog-open-file","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "dialog-open-file");
    auto *arguments = view.arguments();
    REQUIRE(arguments != nullptr);
    auto *paths = yyjson_obj_get(arguments, "paths");
    REQUIRE(paths != nullptr);
    REQUIRE(yyjson_is_arr(paths));
    size_t idx, limit;
    yyjson_val *entry = nullptr;
    bool found = false;
    yyjson_arr_foreach(paths, idx, limit, entry)
    {
        if (yyjson_is_str(entry) &&
            std::string_view(yyjson_get_str(entry)) ==
                "C:\\Users\\user\\Downloads\\file.torrent")
        {
            found = true;
            break;
        }
    }
    CHECK(found);
}

TEST_CASE("dialog-select-folder returns overridden path")
{
    DialogHandlerScope guard;
    tt::rpc::test::override_dialog_folder_handler(
        [](FolderDialogOptions const &) -> DialogPathOutcome
        {
            DialogPathOutcome outcome;
            outcome.path = "C:\\Users\\user\\Documents\\Torrents";
            return outcome;
        });
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"dialog-select-folder","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "dialog-select-folder");
    expect_argument(view, "path", "C:\\Users\\user\\Documents\\Torrents");
}

TEST_CASE("dialog-save-file cancellation returns null")
{
    DialogHandlerScope guard;
    tt::rpc::test::override_dialog_save_handler(
        [](SaveDialogOptions const &) -> DialogPathOutcome
        {
            DialogPathOutcome outcome;
            outcome.cancelled = true;
            return outcome;
        });
    tt::rpc::Dispatcher dispatcher{nullptr};
    auto response = dispatch_sync(
        dispatcher, R"({"method":"dialog-save-file","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "dialog-save-file");
    auto *arguments = view.arguments();
    REQUIRE(arguments != nullptr);
    auto *path = yyjson_obj_get(arguments, "path");
    REQUIRE(path != nullptr);
    CHECK(yyjson_is_null(path));
}
#endif

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

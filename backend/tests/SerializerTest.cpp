#include "rpc/Serializer.hpp"
#include "RpcTestUtils.hpp"
#include "engine/Core.hpp"
#include "rpc/Dispatcher.hpp"

#include <chrono>
#include <filesystem>
#include <string>
#include <thread>
#include <vector>

#include <doctest/doctest.h>
#include <yyjson.h>

namespace
{

using namespace tt::tests;

struct EngineRunner
{
    explicit EngineRunner(tt::engine::Core &core)
        : core_(core), thread_([&core]() { core.run(); })
    {
    }

    ~EngineRunner()
    {
        core_.stop();
        if (thread_.joinable())
        {
            thread_.join();
        }
    }

    tt::engine::Core &core_;
    std::thread thread_;
};

struct JsonDocGuard
{
    explicit JsonDocGuard(std::string const &payload)
    {
        doc = yyjson_read(payload.data(), payload.size(), 0);
    }

    ~JsonDocGuard()
    {
        if (doc)
        {
            yyjson_doc_free(doc);
        }
    }

    yyjson_val *root() const
    {
        if (!doc)
        {
            return nullptr;
        }
        return yyjson_doc_get_root(doc);
    }

    yyjson_doc *doc = nullptr;
};

} // namespace

TEST_CASE("session-get redacts proxy password after session-set updates it")
{
    tt::engine::CoreSettings settings;
    settings.listen_interface = "127.0.0.1:0";
    auto temp_root = std::filesystem::temp_directory_path() / "tinytest-state";
    std::filesystem::create_directories(temp_root);
    settings.download_path = temp_root / "downloads";
    settings.state_path = temp_root / "state.json";
    settings.proxy_auth_enabled = true;

    auto engine = tt::engine::Core::create(settings);
    EngineRunner runner(*engine);
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    tt::rpc::Dispatcher dispatcher(engine.get());
    auto set_response = tt::tests::dispatch_sync(
        dispatcher,
        R"({"method":"session-set","arguments":{"proxy-password":"hunter2","proxy-auth-enabled":true}})");
    ResponseView set_view{set_response};
    CHECK(set_view.result() == "success");

    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
    while (engine->settings().proxy_password != "hunter2" &&
           std::chrono::steady_clock::now() < deadline)
    {
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    REQUIRE(engine->settings().proxy_password == "hunter2");

    auto get_response = tt::tests::dispatch_sync(
        dispatcher, R"({"method":"session-get","arguments":{}})");
    ResponseView get_view{get_response};
    auto *password = get_view.argument("proxy-password");
    REQUIRE(password != nullptr);
    CHECK(to_view(password) == "<REDACTED>");
}

TEST_CASE("serialize_session_settings hides proxy password")
{
    tt::engine::CoreSettings settings;
    settings.proxy_auth_enabled = true;
    settings.proxy_password = "secret";
    auto payload = tt::rpc::serialize_session_settings(
        settings, 0, std::nullopt, {}, {}, tt::rpc::UiPreferences{});
    ResponseView view{payload};
    auto *password = view.argument("proxy-password");
    REQUIRE(password != nullptr);
    CHECK(to_view(password) == "<REDACTED>");
}

TEST_CASE("serialize_session_settings includes listen error when present")
{
    tt::engine::CoreSettings settings;
    auto listen_error = std::string("listen failed: port busy");
    auto payload = tt::rpc::serialize_session_settings(
        settings, 0, std::nullopt, {}, listen_error,
        tt::rpc::UiPreferences{});
    ResponseView view{payload};
    auto *value = view.argument("listen-error");
    REQUIRE(value != nullptr);
    CHECK(to_view(value) == listen_error);
}

TEST_CASE("serialize_ws_snapshot reports aggregated labels registry")
{
    tt::engine::SessionSnapshot snapshot;
    tt::engine::TorrentSnapshot torrent1;
    torrent1.labels = {"Movies", "Action"};
    tt::engine::TorrentSnapshot torrent2;
    torrent2.labels = {"Movies", "Drama"};
    snapshot.torrents = {torrent1, torrent2};

    auto payload = tt::rpc::serialize_ws_snapshot(snapshot, 0);
    JsonDocGuard guard(payload);
    auto *root = guard.root();
    REQUIRE(root != nullptr);
    auto *data = yyjson_obj_get(root, "data");
    REQUIRE(data != nullptr);
    auto *session = yyjson_obj_get(data, "session");
    REQUIRE(session != nullptr);
    auto *registry = yyjson_obj_get(session, "labels-registry");
    REQUIRE(registry != nullptr);
    REQUIRE(yyjson_is_obj(registry));
    auto *movies = yyjson_obj_get(registry, "Movies");
    REQUIRE(movies != nullptr);
    CHECK(yyjson_get_uint(movies) == 2);
    auto *action = yyjson_obj_get(registry, "Action");
    REQUIRE(action != nullptr);
    CHECK(yyjson_get_uint(action) == 1);
    auto *drama = yyjson_obj_get(registry, "Drama");
    REQUIRE(drama != nullptr);
    CHECK(yyjson_get_uint(drama) == 1);
}

TEST_CASE("serialize_ws_patch embeds sequence and labels registry")
{
    tt::engine::SessionSnapshot snapshot;
    tt::engine::TorrentSnapshot torrent;
    torrent.labels = {"Music"};
    snapshot.torrents = {torrent};
    std::vector<tt::engine::TorrentSnapshot> added = {torrent};

    auto payload = tt::rpc::serialize_ws_patch(snapshot, added, {}, {}, 37);
    JsonDocGuard guard(payload);
    auto *root = guard.root();
    REQUIRE(root != nullptr);
    auto *sequence = yyjson_obj_get(root, "sequence");
    REQUIRE(sequence != nullptr);
    CHECK(yyjson_get_uint(sequence) == 37);

    auto *data = yyjson_obj_get(root, "data");
    REQUIRE(data != nullptr);
    auto *session = yyjson_obj_get(data, "session");
    REQUIRE(session != nullptr);
    auto *registry = yyjson_obj_get(session, "labels-registry");
    REQUIRE(registry != nullptr);
    REQUIRE(yyjson_is_obj(registry));
    auto *music = yyjson_obj_get(registry, "Music");
    REQUIRE(music != nullptr);
    CHECK(yyjson_get_uint(music) == 1);
}

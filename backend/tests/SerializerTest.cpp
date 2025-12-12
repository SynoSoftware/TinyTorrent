#include "engine/Core.hpp"
#include "rpc/Dispatcher.hpp"
#include "rpc/Serializer.hpp"
#include "RpcTestUtils.hpp"

#include <chrono>
#include <filesystem>
#include <string>
#include <thread>

#include <doctest/doctest.h>
#include <yyjson.h>

namespace {

using namespace tt::tests;

struct EngineRunner {
  explicit EngineRunner(tt::engine::Core &core)
      : core_(core), thread_([&core]() { core.run(); }) {}

  ~EngineRunner() {
    core_.stop();
    if (thread_.joinable()) {
      thread_.join();
    }
  }

  tt::engine::Core &core_;
  std::thread thread_;
};

} // namespace

TEST_CASE("session-get redacts proxy password after session-set updates it") {
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
  auto set_response = dispatcher.dispatch(
      R"({"method":"session-set","arguments":{"proxy-password":"hunter2","proxy-auth-enabled":true}})").get();
  ResponseView set_view{set_response};
  CHECK(set_view.result() == "success");

  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
  while (engine->settings().proxy_password != "hunter2" &&
         std::chrono::steady_clock::now() < deadline) {
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
  }
  REQUIRE(engine->settings().proxy_password == "hunter2");

  auto get_response =
      dispatcher.dispatch(R"({"method":"session-get","arguments":{}})").get();
  ResponseView get_view{get_response};
  auto *password = get_view.argument("proxy-password");
  REQUIRE(password != nullptr);
  CHECK(to_view(password) == "<REDACTED>");
}

TEST_CASE("serialize_session_settings hides proxy password") {
  tt::engine::CoreSettings settings;
  settings.proxy_auth_enabled = true;
  settings.proxy_password = "secret";
  auto payload =
      tt::rpc::serialize_session_settings(settings, 0, std::nullopt, {});
  ResponseView view{payload};
  auto *password = view.argument("proxy-password");
  REQUIRE(password != nullptr);
  CHECK(to_view(password) == "<REDACTED>");
}

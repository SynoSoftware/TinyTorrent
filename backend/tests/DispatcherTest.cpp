#include "rpc/Dispatcher.hpp"
#include "RpcTestUtils.hpp"

#include <doctest/doctest.h>

#include <yyjson.h>

namespace {

using namespace tt::tests;

void expect_engine_unavailable(ResponseView const& response,
                               char const* context) {
  expect_result(response, "error", context);
  expect_argument(response, "message", "engine unavailable");
}

} // namespace

TEST_CASE("empty payload") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response = dispatcher.dispatch("");
  ResponseView view{response};
  expect_result(view, "error", "empty payload");
  expect_argument(view, "message", "empty RPC payload");
}

TEST_CASE("invalid json") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response = dispatcher.dispatch("{");
  ResponseView view{response};
  expect_result(view, "error", "invalid json");
  expect_argument(view, "message", "invalid JSON");
}

TEST_CASE("session-set") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"session-set","arguments":{"download-dir":"."}})");
  ResponseView view{response};
  expect_result(view, "success", "session-set");
}

TEST_CASE("session-test") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"session-test","arguments":{}})");
  ResponseView view{response};
  expect_result(view, "success", "session-test");
  expect_bool_argument(view, "portIsOpen", false);
}

TEST_CASE("session-stats") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"session-stats","arguments":{}})");
  ResponseView view{response};
  expect_result(view, "success", "session-stats");
  if (!yyjson_is_obj(view.arguments())) {
    throw std::runtime_error("session-stats: missing arguments object");
  }
}

TEST_CASE("session-close") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"session-close","arguments":{}})");
  ResponseView view{response};
  expect_result(view, "success", "session-close");
}

TEST_CASE("free-space missing path") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"free-space","arguments":{}})");
  ResponseView view{response};
  expect_result(view, "error", "free-space missing path");
  expect_argument(view, "message", "path argument required");
}

TEST_CASE("free-space success") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"free-space","arguments":{"path":"."}})");
  ResponseView view{response};
  expect_result(view, "success", "free-space success");
  expect_argument(view, "path", ".");
}

TEST_CASE("torrent-add engine unavailable") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"torrent-add","arguments":{}})");
  ResponseView view{response};
  expect_engine_unavailable(view, "torrent-add engine unavailable");
}

TEST_CASE("torrent-start missing ids") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"torrent-start","arguments":{}})");
  ResponseView view{response};
  expect_result(view, "error", "torrent-start missing ids");
  expect_argument(view, "message", "ids required");
}

TEST_CASE("torrent-remove missing ids") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"torrent-remove","arguments":{}})");
  ResponseView view{response};
  expect_result(view, "error", "torrent-remove missing ids");
  expect_argument(view, "message", "ids required");
}

TEST_CASE("torrent-set engine unavailable") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response = dispatcher.dispatch(R"({"method":"torrent-set","arguments":{"ids":[1]}})");
  ResponseView view{response};
  expect_engine_unavailable(view, "torrent-set engine unavailable");
}

TEST_CASE("torrent-rename-path missing") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"torrent-rename-path","arguments":{}})");
  ResponseView view{response};
  expect_result(view, "error", "torrent-rename-path missing");
  expect_argument(view, "message", "ids, path and name required");
}

TEST_CASE("group-set no-op") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response = dispatcher.dispatch(R"({"method":"group-set","arguments":{}})");
  ResponseView view{response};
  expect_result(view, "success", "group-set");
}

TEST_CASE("unsupported method") {
  tt::rpc::Dispatcher dispatcher{nullptr};
  auto response =
      dispatcher.dispatch(R"({"method":"does-not-exist","arguments":{}})");
  ResponseView view{response};
  expect_result(view, "error", "unsupported method");
  expect_argument(view, "message", "unsupported method");
}

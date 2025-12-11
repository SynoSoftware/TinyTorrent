#include "rpc/Dispatcher.hpp"
#include "RpcTestUtils.hpp"

#include <yyjson.h>

#include <cstdio>
#include <stdexcept>
#include <string>
#include <string_view>

namespace {

using namespace tt::tests;

void expect_engine_unavailable(ResponseView const& response, char const* context) {
  expect_result(response, "error", context);
  expect_argument(response, "message", "engine unavailable");
}

int run_case(std::string_view name, auto&& test) {
  try {
    test();
    std::printf("[PASS] %.*s\n", static_cast<int>(name.size()), name.data());
    return 0;
  } catch (std::exception const& ex) {
    std::fprintf(stderr, "[FAIL] %.*s: %s\n", static_cast<int>(name.size()), name.data(), ex.what());
    return 1;
  }
}

} // namespace

int main() {
  tt::rpc::Dispatcher dispatcher{nullptr};
  int failures = 0;

  failures += run_case("empty payload", [&] {
    auto response = dispatcher.dispatch("");
    ResponseView view{response};
    expect_result(view, "error", "empty payload");
    expect_argument(view, "message", "empty RPC payload");
  });

  failures += run_case("invalid json", [&] {
    auto response = dispatcher.dispatch("{");
    ResponseView view{response};
    expect_result(view, "error", "invalid json");
    expect_argument(view, "message", "invalid JSON");
  });

  failures += run_case("session-set", [&] {
    auto response = dispatcher.dispatch(R"({"method":"session-set","arguments":{"download-dir":"."}})");
    ResponseView view{response};
    expect_result(view, "success", "session-set");
  });

  failures += run_case("session-test", [&] {
    auto response = dispatcher.dispatch(R"({"method":"session-test","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "session-test");
    expect_bool_argument(view, "portIsOpen", false);
  });

  failures += run_case("session-stats", [&] {
    auto response = dispatcher.dispatch(R"({"method":"session-stats","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "session-stats");
    if (!yyjson_is_obj(view.arguments())) {
      throw std::runtime_error("session-stats: missing arguments object");
    }
  });

  failures += run_case("session-close", [&] {
    auto response = dispatcher.dispatch(R"({"method":"session-close","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "session-close");
  });

  failures += run_case("free-space missing path", [&] {
    auto response = dispatcher.dispatch(R"({"method":"free-space","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "free-space missing path");
    expect_argument(view, "message", "path argument required");
  });

  failures += run_case("free-space success", [&] {
    auto response = dispatcher.dispatch(R"({"method":"free-space","arguments":{"path":"."}})");
    ResponseView view{response};
    expect_result(view, "success", "free-space success");
    expect_argument(view, "path", ".");
  });

  failures += run_case("torrent-add engine unavailable", [&] {
    auto response = dispatcher.dispatch(R"({"method":"torrent-add","arguments":{}})");
    ResponseView view{response};
    expect_engine_unavailable(view, "torrent-add engine unavailable");
  });

  failures += run_case("torrent-start missing ids", [&] {
    auto response = dispatcher.dispatch(R"({"method":"torrent-start","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "torrent-start missing ids");
    expect_argument(view, "message", "ids required");
  });

  failures += run_case("torrent-remove missing ids", [&] {
    auto response = dispatcher.dispatch(R"({"method":"torrent-remove","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "torrent-remove missing ids");
    expect_argument(view, "message", "ids required");
  });

  failures += run_case("torrent-set engine unavailable", [&] {
    auto response = dispatcher.dispatch(R"({"method":"torrent-set","arguments":{"ids":[1]}})");
    ResponseView view{response};
    expect_engine_unavailable(view, "torrent-set engine unavailable");
  });

  failures += run_case("torrent-rename-path missing", [&] {
    auto response = dispatcher.dispatch(R"({"method":"torrent-rename-path","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "torrent-rename-path missing");
    expect_argument(view, "message", "ids, path and name required");
  });

  failures += run_case("group-set no-op", [&] {
    auto response = dispatcher.dispatch(R"({"method":"group-set","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "success", "group-set");
  });

  failures += run_case("unsupported method", [&] {
    auto response = dispatcher.dispatch(R"({"method":"does-not-exist","arguments":{}})");
    ResponseView view{response};
    expect_result(view, "error", "unsupported method");
    expect_argument(view, "message", "unsupported method");
  });

  return failures;
}

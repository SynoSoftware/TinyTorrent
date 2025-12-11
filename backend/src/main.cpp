#include "engine/Core.hpp"
#include "rpc/Server.hpp"
#include "utils/FS.hpp"
#include "utils/Log.hpp"

#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <filesystem>
#include <memory>
#include <thread>

std::atomic_bool keep_running{true};

int main() {
  std::signal(SIGINT, [](int) { keep_running.store(false, std::memory_order_relaxed); });
  std::signal(SIGTERM, [](int) { keep_running.store(false, std::memory_order_relaxed); });

  auto root = tt::utils::data_root();
  auto download_path = root / "downloads";
  std::filesystem::create_directories(download_path);

  TT_LOG_INFO("Data root: {}", root.string());
  TT_LOG_INFO("Download path: {}", download_path.string());

  tt::engine::CoreSettings settings;
  settings.download_path = download_path;
  settings.listen_interface = "0.0.0.0:6881";

  TT_LOG_INFO("Engine listen interface: {}", settings.listen_interface);

  auto engine = tt::engine::Core::create(settings);
  std::thread engine_thread([core = engine.get()] { core->run(); });
  TT_LOG_INFO("Engine thread started");

  tt::rpc::Server rpc(engine.get(), "http://127.0.0.1:8080");
  rpc.start();
  TT_LOG_INFO("RPC layer ready; POST requests should hit http://127.0.0.1:8080/transmission/rpc");

  tt::log::print_status("TinyTorrent daemon running; CTRL+C to stop.");

  while (keep_running.load(std::memory_order_relaxed)) {
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
  }

  TT_LOG_INFO("Shutdown requested; stopping RPC and engine...");
  rpc.stop();
  engine->stop();
  if (engine_thread.joinable()) {
    engine_thread.join();
  }

  tt::log::print_status("Shutdown complete.");
  TT_LOG_INFO("Shutdown complete.");
  return 0;
}

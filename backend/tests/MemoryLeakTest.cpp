#include "engine/Core.hpp"
#include "rpc/Dispatcher.hpp"

#include <doctest/doctest.h>

#include <atomic>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#if defined(_WIN32)
#include <process.h>
#else
#include <unistd.h>
#endif

namespace
{

constexpr int kStressIterations = 10;
constexpr int kRapidIterations = 20;

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

tt::engine::CoreSettings make_test_settings()
{
    tt::engine::CoreSettings settings;
    auto temp_root = std::filesystem::temp_directory_path();
    static std::atomic<std::uint64_t> unique_counter{0};
    auto now_value =
        std::chrono::steady_clock::now().time_since_epoch().count();
    auto thread_value =
        std::hash<std::thread::id>{}(std::this_thread::get_id());
    auto process_id = []() -> std::uint32_t
    {
#if defined(_WIN32)
        return static_cast<std::uint32_t>(_getpid());
#else
        return static_cast<std::uint32_t>(getpid());
#endif
    }();
    auto counter_value = unique_counter.fetch_add(1, std::memory_order_relaxed);
    auto unique_tag =
        std::to_string(now_value) + "_" + std::to_string(thread_value) + "_" +
        std::to_string(process_id) + "_" + std::to_string(counter_value);
    settings.download_path = temp_root / ("tt_test_" + unique_tag);
    settings.state_path = temp_root / ("tt_test_" + unique_tag + ".db");
    settings.download_rate_limit_kbps = 100;
    settings.upload_rate_limit_kbps = 50;
    settings.listen_interface = "127.0.0.1:0"; // Random port
    settings.dht_enabled = false;
    settings.lpd_enabled = false;
    settings.pex_enabled = false;
    return settings;
}

} // namespace

TEST_CASE("Core creation and destruction stress test")
{
    // Test for memory leaks and double-frees by creating and destroying
    // Core instances many times. Each iteration should properly clean up
    // all resources, including alert callbacks.

    for (int i = 0; i < kStressIterations; ++i)
    {
        CAPTURE(i);

        auto settings = make_test_settings();
        auto core = tt::engine::Core::create(std::move(settings));

        CHECK(core != nullptr);

        {
            // Run Core in its own thread
            EngineRunner runner(*core);

            // Let it run briefly to initialize
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            // Runner destructor will stop and join
        }
        // Core should be destroyed here - if there's a double-free
        // or use-after-free, sanitizers/debuggers will catch it
    }

    // If we got here without crashing, the test passed
    CHECK(true);
}

TEST_CASE("Core rapid creation and destruction")
{
    // Even more aggressive test - rapid creation/destruction
    // with minimal delay to stress the cleanup paths

    for (int i = 0; i < kRapidIterations; ++i)
    {
        CAPTURE(i);

        auto settings = make_test_settings();
        auto core = tt::engine::Core::create(std::move(settings));

        CHECK(core != nullptr);

        // Run Core in its own thread
        {
            EngineRunner runner(*core);
            // Minimal wait before destruction
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }

    CHECK(true);
}

TEST_CASE("Dispatcher with Core lifecycle stress")
{
    // Test Dispatcher interactions during Core lifecycle
    // This stresses the weak_ptr usage in Dispatcher

    for (int i = 0; i < kStressIterations; ++i)
    {
        CAPTURE(i);

        auto settings = make_test_settings();
        auto core = tt::engine::Core::create(std::move(settings));

        tt::rpc::Dispatcher dispatcher{core.get()};
        EngineRunner runner(*core);

        // Let it initialize
        std::this_thread::sleep_for(std::chrono::milliseconds(30));

        // Make some RPC calls
        auto response1 =
            dispatcher.dispatch(R"({"method":"session-stats","arguments":{}})")
                .get();
        CHECK(!response1.empty());

        auto response2 =
            dispatcher.dispatch(R"({"method":"session-get","arguments":{}})")
                .get();
        CHECK(!response2.empty());
    }

    CHECK(true);
}

TEST_CASE("Core with alert processing stress")
{
    // Stress test the alert callback cleanup by running the core
    // longer to ensure alerts are being processed

    for (int i = 0; i < 20; ++i)
    {
        CAPTURE(i);

        auto settings = make_test_settings();
        settings.dht_enabled = true; // Enable some features to generate alerts
        auto core = tt::engine::Core::create(std::move(settings));

        CHECK(core != nullptr);

        {
            EngineRunner runner(*core);
            // Run for a bit to generate alerts
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            // Runner destructor will stop and join
        } // If alert callbacks try to access freed memory, we'll crash here
    }

    CHECK(true);
}

TEST_CASE("Multiple Core instances lifecycle")
{
    // Test creating multiple Core instances and destroying them
    // in different orders to ensure no shared state issues

    auto settings1 = make_test_settings();
    settings1.state_path =
        std::filesystem::temp_directory_path() / "tt_test1.db";
    auto core1 = tt::engine::Core::create(std::move(settings1));

    auto settings2 = make_test_settings();
    settings2.state_path =
        std::filesystem::temp_directory_path() / "tt_test2.db";
    auto core2 = tt::engine::Core::create(std::move(settings2));

    CHECK(core1 != nullptr);
    CHECK(core2 != nullptr);

    {
        EngineRunner runner1(*core1);
        EngineRunner runner2(*core2);

        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        // Both will be stopped and joined when runners go out of scope
    }

    CHECK(true);
}

#include "engine/Core.hpp"

#include <filesystem>
#include <string>
#include <system_error>

#include <doctest/doctest.h>

namespace
{

std::filesystem::path make_temp_root(std::string_view tag)
{
    auto root = std::filesystem::temp_directory_path() / "tinytest" / tag;
    std::error_code ec;
    std::filesystem::remove_all(root, ec);
    std::filesystem::create_directories(root, ec);
    return root;
}

} // namespace

TEST_CASE("Core::listen_error reflects the last reported failure")
{
    tt::engine::CoreSettings settings{};
    auto temp_root = make_temp_root("core-listen-error");
    settings.download_path = temp_root / "downloads";
    settings.state_path = temp_root / "state.db";
    settings.listen_interface = "127.0.0.1:0";

    auto engine = tt::engine::Core::create(settings);
    auto const expected = std::string("listen failed: port busy");

    engine->set_listen_error_for_testing(expected);
    CHECK(engine->listen_error() == expected);
}

#include "engine/ConfigurationService.hpp"
#include "engine/Core.hpp"
#include "engine/EventBus.hpp"
#include "engine/PersistenceManager.hpp"
#include "utils/StateStore.hpp"

#include <filesystem>
#include <string>
#include <system_error>

#include <doctest/doctest.h>

TEST_CASE("ConfigurationService persists user settings")
{
    auto temp_root = std::filesystem::temp_directory_path() / "tinytest-config";
    std::error_code ec;
    std::filesystem::remove_all(temp_root, ec);
    std::filesystem::create_directories(temp_root, ec);

    auto db_path = temp_root / "state.db";
    {
        tt::engine::PersistenceManager persistence(db_path);
        REQUIRE(persistence.is_valid());

        tt::engine::EventBus bus;
        tt::engine::CoreSettings defaults;
        defaults.listen_interface = "0.0.0.0:6881";
        defaults.download_path = temp_root / "downloads";
        defaults.state_path = temp_root / "state.db";

        tt::engine::ConfigurationService config(&persistence, &bus, defaults);
        auto initial = config.get();
        CHECK(initial.listen_interface == defaults.listen_interface);
        CHECK(initial.download_path == defaults.download_path);

        auto const new_interface = std::string("127.0.0.1:9999");
        auto const expected_interface = new_interface;
        auto const new_path = temp_root / "downloads2";
        config.set_listen_interface(new_interface);
        config.set_download_path(new_path);

        auto modified = config.get();
        CHECK(modified.listen_interface == expected_interface);
        CHECK(modified.download_path == new_path);

        config.persist_if_dirty();

        tt::storage::Database reader(db_path);
        REQUIRE(reader.is_valid());
        auto persisted_interface = reader.get_setting("listenInterface");
        REQUIRE(persisted_interface);
        CHECK(*persisted_interface == expected_interface);
        auto persisted_path = reader.get_setting("downloadPath");
        REQUIRE(persisted_path);
        CHECK(*persisted_path == new_path.string());
    }

    std::filesystem::remove_all(temp_root, ec);
}

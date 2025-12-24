#pragma once

#include "utils/StateStore.hpp"

#include <filesystem>
#include <memory>
#include <string>

namespace tt::rpc
{

struct UiPreferences
{
    bool auto_open_ui = true;
    bool hide_ui_when_autorun = false;
    bool show_splash = true;
    std::string splash_message;
};

class UiPreferencesStore
{
public:
    explicit UiPreferencesStore(std::filesystem::path state_path);

    UiPreferences load() const;
    bool persist(UiPreferences const &preferences) const;
    bool is_valid() const noexcept;

private:
    std::shared_ptr<tt::storage::Database> db_;
};

} // namespace tt::rpc

#include "rpc/UiPreferences.hpp"

#include <algorithm>
#include <cctype>
#include <optional>

namespace tt::rpc
{

namespace
{
bool parse_bool(std::optional<std::string> const &value, bool fallback)
{
    if (!value)
    {
        return fallback;
    }
    if (value->empty())
    {
        return fallback;
    }
    if (*value == "1")
    {
        return true;
    }
    if (*value == "0")
    {
        return false;
    }
    std::string lowercase = *value;
    std::transform(lowercase.begin(), lowercase.end(), lowercase.begin(),
                   [](unsigned char ch)
                   {
                       return static_cast<char>(std::tolower(ch));
                   });
    if (lowercase == "true" || lowercase == "yes")
    {
        return true;
    }
    if (lowercase == "false" || lowercase == "no")
    {
        return false;
    }
    return fallback;
}

std::string bool_to_string(bool value)
{
    return value ? "1" : "0";
}

} // namespace

UiPreferencesStore::UiPreferencesStore(std::filesystem::path state_path)
{
    if (state_path.empty())
    {
        return;
    }
    db_ = std::make_shared<tt::storage::Database>(std::move(state_path));
}

UiPreferences UiPreferencesStore::load() const
{
    UiPreferences result;
    if (!is_valid())
    {
        return result;
    }
    result.auto_open_ui = parse_bool(db_->get_setting("uiAutoOpen"),
                                     result.auto_open_ui);
    result.hide_ui_when_autorun =
        parse_bool(db_->get_setting("uiAutorunHidden"),
                   result.hide_ui_when_autorun);
    result.show_splash =
        parse_bool(db_->get_setting("uiShowSplash"), result.show_splash);
    if (auto message = db_->get_setting("uiSplashMessage"); message)
    {
        result.splash_message = *message;
    }
    return result;
}

bool UiPreferencesStore::persist(UiPreferences const &preferences) const
{
    if (!is_valid())
    {
        return false;
    }
    bool success = true;
    success &= db_->set_setting("uiAutoOpen",
                                bool_to_string(preferences.auto_open_ui));
    success &= db_->set_setting(
        "uiAutorunHidden", bool_to_string(preferences.hide_ui_when_autorun));
    success &= db_->set_setting("uiShowSplash",
                                bool_to_string(preferences.show_splash));
    if (preferences.splash_message.empty())
    {
        success &= db_->remove_setting("uiSplashMessage");
    }
    else
    {
        success &= db_->set_setting("uiSplashMessage",
                                    preferences.splash_message);
    }
    return success;
}

bool UiPreferencesStore::is_valid() const noexcept
{
    return db_ != nullptr && db_->is_valid();
}

} // namespace tt::rpc

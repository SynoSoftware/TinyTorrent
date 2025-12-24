#pragma once

#include "engine/Core.hpp"
#include "rpc/UiPreferences.hpp"

#include <atomic>
#include <functional>
#include <future>
#include <memory>
#include <shared_mutex>
#include <string>
#include <string_view>
#include <unordered_map>

struct yyjson_val;

namespace tt::rpc
{
enum class HandlerAction
{
    None,
    Enable,
    Disable,
};

struct HandlerActionRequest
{
    HandlerAction action = HandlerAction::None;
    bool already_elevated = false;
};

struct SystemHandlerResult
{
    bool success = false;
    bool permission_denied = false;
    std::string message;
    bool requires_elevation = false;
};

HandlerActionRequest parse_handler_action(int argc, char *argv[]);
SystemHandlerResult perform_handler_action_impl(HandlerAction action,
                                                bool allow_elevation,
                                                bool already_elevated);
bool run_handler_action_elevated(HandlerAction action);

using ResponseCallback = std::function<void(std::string)>;
using DispatchHandler = std::function<void(yyjson_val *, ResponseCallback)>;
using ResponsePoster = std::function<void(std::function<void()>)>;
using EventPublisher = std::function<void(std::string const &)>;
using UiClientChecker = std::function<bool()>;

class Dispatcher
{
  public:
    Dispatcher(engine::Core *engine, std::string rpc_bind = {},
               ResponsePoster post_response = {},
               std::shared_ptr<UiPreferencesStore> ui_preferences = {},
               EventPublisher event_publisher = {},
               UiClientChecker has_ui_client = {});
    void dispatch(std::string_view payload, ResponseCallback cb);
    void set_ui_attached(bool attached);

  private:
    void register_handlers();
    UiPreferences ui_preferences() const;
    void set_ui_preferences(UiPreferences const &preferences);
    bool ui_attached() const;
    std::string handle_session_ui_focus();

    engine::Core *engine_;
    std::string rpc_bind_;
    std::unordered_map<std::string, DispatchHandler> handlers_;
    ResponsePoster post_response_;
    std::shared_ptr<UiPreferencesStore> ui_preferences_store_;
    UiPreferences ui_preferences_;
    mutable std::shared_mutex ui_preferences_mutex_;
    EventPublisher broadcast_event_;
    UiClientChecker has_ui_client_;
    std::atomic_bool ui_attached_{false};
};

} // namespace tt::rpc

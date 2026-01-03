#pragma once

#include "services/SystemInstallService.hpp"
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
               std::shared_ptr<SystemInstallService> install_service = {},
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
    std::shared_ptr<SystemInstallService> install_service_;
    UiPreferences ui_preferences_;
    mutable std::shared_mutex ui_preferences_mutex_;
    EventPublisher broadcast_event_;
    UiClientChecker has_ui_client_;
    std::atomic_bool ui_attached_{false};
};

} // namespace tt::rpc

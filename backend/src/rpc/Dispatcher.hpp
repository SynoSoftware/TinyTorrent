#pragma once

#include "engine/Core.hpp"

#include <functional>
#include <future>
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

class Dispatcher
{
  public:
    Dispatcher(engine::Core *engine, std::string rpc_bind = {},
               ResponsePoster post_response = {});
    void dispatch(std::string_view payload, ResponseCallback cb);

  private:
    void register_handlers();

    engine::Core *engine_;
    std::string rpc_bind_;
    std::unordered_map<std::string, DispatchHandler> handlers_;
    ResponsePoster post_response_;
};

} // namespace tt::rpc

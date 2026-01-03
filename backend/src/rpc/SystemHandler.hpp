#pragma once

#include <string>

namespace tt::rpc
{

struct SystemHandlerResult
{
    bool success = false;
    bool permission_denied = false;
    bool requires_elevation = false;
    std::string message;
};

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

} // namespace tt::rpc

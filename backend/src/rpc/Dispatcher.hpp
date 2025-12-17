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
using ResponseCallback = std::function<void(std::string)>;
using DispatchHandler = std::function<void(yyjson_val *, ResponseCallback)>;

class Dispatcher
{
  public:
    Dispatcher(engine::Core *engine, std::string rpc_bind = {});
    void dispatch(std::string_view payload, ResponseCallback cb);

  private:
    void register_handlers();

    engine::Core *engine_;
    std::string rpc_bind_;
    std::unordered_map<std::string, DispatchHandler> handlers_;
};

} // namespace tt::rpc

#pragma once

#include "engine/Core.hpp"

#include <functional>
#include <string>
#include <string_view>
#include <unordered_map>

struct yyjson_val;

namespace tt::rpc {
using DispatchHandler = std::function<std::string(yyjson_val *)>;

class Dispatcher {
public:
  Dispatcher(engine::Core *engine, std::string rpc_bind = {});
  std::string dispatch(std::string_view payload);

private:
  void register_handlers();

  engine::Core *engine_;
  std::string rpc_bind_;
  std::unordered_map<std::string, DispatchHandler> handlers_;
};

} // namespace tt::rpc

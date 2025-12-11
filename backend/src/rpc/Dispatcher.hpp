#pragma once

#include "engine/Core.hpp"

#include <string>
#include <string_view>

namespace tt::rpc {

class Dispatcher {
public:
  Dispatcher(engine::Core *engine, std::string rpc_bind = {});
  std::string dispatch(std::string_view payload);

private:
  engine::Core *engine_;
  std::string rpc_bind_;
};

} // namespace tt::rpc

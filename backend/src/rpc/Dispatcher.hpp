#pragma once

#include "engine/Core.hpp"

#include <string_view>

namespace tt::rpc {

class Dispatcher {
public:
  explicit Dispatcher(engine::Core *engine);
  std::string dispatch(std::string_view payload);

private:
  engine::Core *engine_;
};

} // namespace tt::rpc

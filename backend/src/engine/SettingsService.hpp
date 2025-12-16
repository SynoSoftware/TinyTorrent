#pragma once

#include "engine/Core.hpp"

#include <chrono>

namespace tt::engine
{

class PersistenceManager;

class SettingsService
{
  public:
    explicit SettingsService(PersistenceManager *persistence);

    void mark_dirty();
    void flush_if_due(std::chrono::steady_clock::time_point now);
    void flush_now();

  private:
    PersistenceManager *persistence_ = nullptr;
};

} // namespace tt::engine

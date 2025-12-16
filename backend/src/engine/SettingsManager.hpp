#pragma once

#include "engine/Core.hpp"

#include <libtorrent/settings_pack.hpp>

namespace tt::engine
{

class SettingsManager
{
  public:
    // Build a libtorrent settings_pack from CoreSettings
    static libtorrent::settings_pack build_settings_pack(CoreSettings const &s);
};

} // namespace tt::engine

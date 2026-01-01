#pragma once

#include <string>
#include <string_view>
#include <windows.h>

#include "tray/TrayState.hpp"

namespace tt::tray
{
namespace rpc
{
std::string post_rpc_request(TrayState &state, std::string const &payload);
bool response_success(std::string const &body);

bool request_ui_focus(TrayState &state);
void handle_dropped_torrent(TrayState &state, std::wstring const &path);
} // namespace rpc
} // namespace tt::tray

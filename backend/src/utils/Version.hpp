#pragma once

namespace tt::version
{

// Compile-time helpers derived from TT_BUILD_VERSION that keep user-facing
// strings consistent.
inline constexpr char const kSemanticVersion[] = TT_BUILD_VERSION;
inline constexpr char const kDisplayVersion[] =
    "TinyTorrent " TT_DISPLAY_VERSION;
inline constexpr char const kUserAgentVersion[] =
    "TinyTorrent/" TT_BUILD_VERSION;

} // namespace tt::version

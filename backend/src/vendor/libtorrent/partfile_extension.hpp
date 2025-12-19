#pragma once

#include <string>

namespace libtorrent
{
namespace tt
{

// TinyTorrent shim.
//
// Some historical builds relied on a patched libtorrent that exposed a
// configurable partfile extension. The vcpkg libtorrent package we consume
// does not ship this header or symbol, but TinyTorrent still wants to control
// the suffix for partial files.
//
// We provide a local implementation (compiled into our binaries) to preserve
// the existing TinyTorrent API usage without patching vcpkg or libtorrent.

std::string partfile_extension();
void set_partfile_extension(std::string extension);

} // namespace tt
} // namespace libtorrent

#pragma once

#include <future>

namespace tt::rpc
{
struct ConnectionInfo;
}

namespace tt::app
{

// Runs the TinyTorrent backend daemon (engine + RPC + HTTP server).
// If ready_promise is provided, it will be fulfilled once the RPC listener
// has a final port and token.
int daemon_main(int argc, char *argv[],
                std::promise<tt::rpc::ConnectionInfo> *ready_promise);

} // namespace tt::app

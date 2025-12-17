#pragma once

#include <chrono>
#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/torrent_status.hpp>

namespace tt::engine
{

struct TorrentFinishedEvent
{
    libtorrent::torrent_handle handle;
    libtorrent::v2::torrent_status status;
};

struct MetadataPersistedEvent
{
    std::string hash;
    std::filesystem::path path;
    std::vector<std::uint8_t> metadata;
};

struct ResumeDataAvailableEvent
{
    std::string hash;
    libtorrent::add_torrent_params params;
};

struct ResumeDataSavedEvent
{
    std::string hash;
};

struct ExtendResumeDeadlineEvent
{
};

struct StateUpdateEvent
{
    std::vector<libtorrent::v2::torrent_status> statuses;
};

struct ListenSucceededEvent
{
    std::string interface_name;
    int port;
    bool is_ipv6 = false;
};

struct ListenFailedEvent
{
    std::string interface_name;
    int port;
    std::string message;
    bool is_ipv6 = false;
};

struct StorageMovedEvent
{
    std::string hash;
    std::filesystem::path path;
    libtorrent::torrent_handle handle;
};

struct StorageMoveFailedEvent
{
    std::string hash;
    std::string message;
    libtorrent::torrent_handle handle;
};

struct TorrentErrorEvent
{
    std::string hash;
    std::string message;
    std::string source;
};

struct SettingsChangedEvent
{
};

} // namespace tt::engine

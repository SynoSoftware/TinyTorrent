#include "tray/rpc/RpcClient.hpp"

#include "tray/StringUtil.hpp"
#include "tray/TrayState.hpp"
#include "utils/Log.hpp"

#include <winhttp.h>
#include <yyjson.h>

#include <mutex>
#include <sstream>

namespace
{
bool ensure_http_handles(tt::tray::TrayState &state)
{
    if (state.port == 0)
    {
        return false;
    }
    if (state.http_session && state.http_connect)
    {
        return true;
    }

    state.http_session =
        WinHttpOpen(L"TinyTorrentTray/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                    NULL, NULL, 0);
    if (!state.http_session)
    {
        return false;
    }

    state.http_connect =
        WinHttpConnect(state.http_session, L"127.0.0.1", state.port, 0);
    return state.http_connect != nullptr;
}

std::string post_rpc_request_impl(tt::tray::TrayState &state,
                                  std::string const &payload)
{
    std::lock_guard<std::mutex> guard(state.http_mutex);
    if (!ensure_http_handles(state))
    {
        return {};
    }

    HINTERNET hRequest =
        WinHttpOpenRequest(state.http_connect, L"POST", L"/transmission/rpc",
                           nullptr, nullptr, nullptr,
                           WINHTTP_FLAG_BYPASS_PROXY_CACHE);
    if (!hRequest)
    {
        return {};
    }

    std::wstring headers = L"Content-Type: application/json\r\nX-TT-Auth: " +
                           widen(state.token) + L"\r\n";
    std::string result;

    if (WinHttpSendRequest(hRequest, headers.c_str(), (DWORD)-1,
                           (LPVOID)payload.data(), (DWORD)payload.size(),
                           (DWORD)payload.size(), 0))
    {
        if (WinHttpReceiveResponse(hRequest, nullptr))
        {
            DWORD dwSize = 0;
            do
            {
                if (!WinHttpQueryDataAvailable(hRequest, &dwSize) ||
                    dwSize == 0)
                {
                    break;
                }
                std::string buffer(dwSize, '\0');
                DWORD dwRead = 0;
                if (WinHttpReadData(hRequest, buffer.data(), dwSize, &dwRead))
                {
                    result.append(buffer.data(), dwRead);
                }
            } while (dwSize > 0);
        }
    }
    WinHttpCloseHandle(hRequest);
    return result;
}

bool response_success_impl(std::string const &body)
{
    if (body.empty())
    {
        return false;
    }
    yyjson_doc *doc = yyjson_read(body.c_str(), body.size(), 0);
    if (!doc)
    {
        return false;
    }
    bool success = false;
    if (auto *root = yyjson_doc_get_root(doc); root && yyjson_is_obj(root))
    {
        if (auto *result = yyjson_obj_get(root, "result");
            result && yyjson_is_str(result))
        {
            success = std::string_view(yyjson_get_str(result)) ==
                      std::string_view("success");
        }
    }
    yyjson_doc_free(doc);
    return success;
}
} // namespace

namespace tt::tray::rpc
{
std::string post_rpc_request(TrayState &state, std::string const &payload)
{
    return post_rpc_request_impl(state, payload);
}

bool response_success(std::string const &body)
{
    return response_success_impl(body);
}

void handle_dropped_torrent(TrayState &state, std::wstring const &path)
{
    if (state.shutting_down.load())
    {
        return;
    }
    std::string payload =
        std::string(R"({"method":"torrent-add","arguments":{"metainfo-path":")") +
        escape_json_string(narrow(path)) + "\"";
    {
        std::string download_dir;
        {
            std::lock_guard<std::mutex> l(state.download_dir_mutex);
            download_dir = state.download_dir_cache;
        }
        if (!download_dir.empty())
        {
            payload += ",\"download-dir\":\"" +
                       escape_json_string(download_dir) + "\"";
        }
    }
    payload += "}}";
    auto response = post_rpc_request(state, payload);
    if (response.empty() || !response_success(response))
    {
        TT_LOG_INFO("tray drop: torrent-add request failure");
    }
}

bool request_ui_focus(TrayState &state)
{
    auto body = post_rpc_request(state, R"({"method":"session-ui-focus"})");
    if (body.empty() || !response_success(body))
    {
        post_rpc_request(state, R"({"method":"session-ui-detach"})");
        state.ui_attached.store(false);
        return false;
    }
    return true;
}
} // namespace tt::tray::rpc

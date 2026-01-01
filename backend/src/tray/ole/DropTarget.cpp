#include "tray/ole/DropTarget.hpp"

#include <algorithm>
#include <array>
#include <cwctype>
#include <iterator>
#include <filesystem>
#include <shellapi.h>

TrayDropTarget::TrayDropTarget(DropCallback callback)
    : callback_(std::move(callback))
{
}

HRESULT TrayDropTarget::DragEnter(IDataObject *data, DWORD, POINTL,
                                  DWORD *pdwEffect)
{
    if (!pdwEffect)
    {
        return E_INVALIDARG;
    }
    can_drop_ = can_accept_drop(data);
    *pdwEffect = can_drop_ ? DROPEFFECT_COPY : DROPEFFECT_NONE;
    return S_OK;
}

HRESULT TrayDropTarget::DragOver(DWORD, POINTL, DWORD *pdwEffect)
{
    if (!pdwEffect)
    {
        return E_INVALIDARG;
    }
    *pdwEffect = can_drop_ ? DROPEFFECT_COPY : DROPEFFECT_NONE;
    return S_OK;
}

HRESULT TrayDropTarget::DragLeave()
{
    can_drop_ = false;
    return S_OK;
}

HRESULT TrayDropTarget::Drop(IDataObject *data, DWORD, POINTL,
                             DWORD *pdwEffect)
{
    if (pdwEffect)
    {
        *pdwEffect = DROPEFFECT_NONE;
    }
    std::vector<std::wstring> paths;
    if (!extract_paths(data, paths))
    {
        can_drop_ = false;
        return S_OK;
    }
    bool handled = false;
    for (auto const &candidate : paths)
    {
        if (is_torrent_file(candidate))
        {
            callback_(candidate);
            handled = true;
        }
    }
    can_drop_ = handled;
    if (pdwEffect)
    {
        *pdwEffect = handled ? DROPEFFECT_COPY : DROPEFFECT_NONE;
    }
    return S_OK;
}

bool TrayDropTarget::can_accept_drop(IDataObject *data)
{
    std::vector<std::wstring> paths;
    if (!extract_paths(data, paths))
    {
        return false;
    }
    for (auto const &path : paths)
    {
        if (is_torrent_file(path))
        {
            return true;
        }
    }
    return false;
}

bool TrayDropTarget::extract_paths(IDataObject *data,
                                   std::vector<std::wstring> &paths)
{
    if (data == nullptr)
    {
        return false;
    }
    FORMATETC format{CF_HDROP, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL};
    STGMEDIUM medium{};
    if (FAILED(data->GetData(&format, &medium)))
    {
        return false;
    }
    HDROP drop = static_cast<HDROP>(GlobalLock(medium.hGlobal));
    if (!drop)
    {
        ReleaseStgMedium(&medium);
        return false;
    }
    UINT count = DragQueryFileW(drop, 0xFFFFFFFF, nullptr, 0);
    std::array<wchar_t, MAX_PATH> buffer{};
    for (UINT i = 0; i < count; ++i)
    {
        UINT length = DragQueryFileW(drop, i, buffer.data(),
                                     static_cast<UINT>(buffer.size()));
        if (length > 0 && length < buffer.size())
        {
            paths.emplace_back(buffer.data(), buffer.data() + length);
        }
    }
    GlobalUnlock(medium.hGlobal);
    ReleaseStgMedium(&medium);
    return !paths.empty();
}

bool TrayDropTarget::is_torrent_file(std::wstring const &path)
{
    if (path.empty())
    {
        return false;
    }
    std::filesystem::path candidate(path);
    auto extension = candidate.extension().wstring();
    if (extension.empty())
    {
        return false;
    }
    std::wstring normalized;
    normalized.reserve(extension.size());
    std::transform(extension.begin(), extension.end(),
                   std::back_inserter(normalized),
                   [](wchar_t ch) { return std::towlower(ch); });
    return normalized == L".torrent";
}

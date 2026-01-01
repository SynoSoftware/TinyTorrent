#pragma once

#include <functional>
#include <string>
#include <vector>
#include <windows.h>
#include <oleidl.h>
#include <wrl/implements.h>
#include <wrl/client.h>

class TrayDropTarget
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<
              Microsoft::WRL::ClassicCom>,
          IDropTarget>
{
public:
    using DropCallback = std::function<void(std::wstring const &)>;

    explicit TrayDropTarget(DropCallback callback);

    HRESULT STDMETHODCALLTYPE DragEnter(IDataObject *data, DWORD keyState,
                                        POINTL clientPt,
                                        DWORD *pdwEffect) override;
    HRESULT STDMETHODCALLTYPE DragOver(DWORD keyState, POINTL clientPt,
                                       DWORD *pdwEffect) override;
    HRESULT STDMETHODCALLTYPE DragLeave() override;
    HRESULT STDMETHODCALLTYPE Drop(IDataObject *data, DWORD keyState,
                                   POINTL clientPt,
                                   DWORD *pdwEffect) override;

private:
    bool can_accept_drop(IDataObject *data);
    bool extract_paths(IDataObject *data, std::vector<std::wstring> &paths);
    static bool is_torrent_file(std::wstring const &path);

    DropCallback callback_;
    bool can_drop_ = false;
};

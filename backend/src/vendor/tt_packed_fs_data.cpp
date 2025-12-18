#include "tt_packed_fs_data.h"

#if defined(_WIN32)
#include <Windows.h>
#include <mutex>

#include "tt_packed_fs_resource.h"

namespace
{
std::once_flag load_once;
const unsigned char *data_ptr = nullptr;
size_t data_size = 0;

void load_packed_fs_resource()
{
    auto const kResourceType = MAKEINTRESOURCEW(10);
    HMODULE module = GetModuleHandleW(nullptr);
    if (!module)
    {
        return;
    }
    HRSRC res = FindResourceW(module, MAKEINTRESOURCEW(IDR_TT_PACKED_FS),
                              kResourceType);
    if (!res)
    {
        return;
    }
    HGLOBAL global = LoadResource(module, res);
    if (!global)
    {
        return;
    }
    data_size = static_cast<size_t>(SizeofResource(module, res));
    data_ptr = reinterpret_cast<const unsigned char *>(LockResource(global));
}
} // namespace

const unsigned char *tt_packed_fs_data(void)
{
    std::call_once(load_once, load_packed_fs_resource);
    return data_ptr;
}

size_t tt_packed_fs_data_size(void)
{
    std::call_once(load_once, load_packed_fs_resource);
    return data_size;
}

#else

#if defined(TT_PACKED_FS_HAS_INC)
#include "tt_packed_fs_data.inc"
extern "C" {
extern const unsigned char tt_packed_fs_blob[];
extern const unsigned char tt_packed_fs_blob_end[];
}
#endif

const unsigned char *tt_packed_fs_data(void)
{
#if defined(TT_PACKED_FS_HAS_INC)
    return tt_packed_fs_blob;
#else
    return nullptr;
#endif
}

size_t tt_packed_fs_data_size(void)
{
#if defined(TT_PACKED_FS_HAS_INC)
    return static_cast<size_t>(tt_packed_fs_blob_end - tt_packed_fs_blob);
#else
    return 0;
#endif
}

#endif

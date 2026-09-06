#include "Association.h"
#include "Log.h"

#include <shlobj.h>
#include <stdio.h>
#include <string.h>

static BOOL Write(const wchar_t *subkey, const wchar_t *name, const wchar_t *value)
{
    HKEY key;
    LSTATUS status;

    status = RegCreateKeyExW(HKEY_CURRENT_USER, subkey, 0, NULL, 0, KEY_SET_VALUE, NULL, &key, NULL);
    if (status != ERROR_SUCCESS)
    {
        Log(L"could not open HKCU\\%s (error %d)", subkey, status);
        return FALSE;
    }

    status = RegSetValueExW(key, name, 0, REG_SZ, (const BYTE *)value,
                            (DWORD)((wcslen(value) + 1) * sizeof(wchar_t)));
    RegCloseKey(key);

    if (status != ERROR_SUCCESS)
        Log(L"could not write HKCU\\%s (error %d)", subkey, status);

    return status == ERROR_SUCCESS;
}

static BOOL Matches(const wchar_t *subkey, const wchar_t *expected)
{
    wchar_t current[MAX_PATH * 2];
    DWORD size = sizeof current;

    if (RegGetValueW(HKEY_CURRENT_USER, subkey, NULL, RRF_RT_REG_SZ, NULL, current, &size) != ERROR_SUCCESS)
        return FALSE;

    return wcscmp(current, expected) == 0;
}

void RegisterAssociations(void)
{
    wchar_t exe[MAX_PATH];
    wchar_t command[MAX_PATH + 8];
    BOOL written;

    if (GetModuleFileNameW(NULL, exe, MAX_PATH) == 0)
        return;

    swprintf_s(command, MAX_PATH + 8, L"\"%s\" \"%%1\"", exe);

    /* Explorer caches associations, so re-announcing them on every launch shows the user a
       stale-icon refresh for no reason. Both commands already naming us means all five
       values are ours. */
    if (Matches(L"Software\\Classes\\magnet\\shell\\open\\command", command) &&
        Matches(L"Software\\Classes\\TinyTorrent.torrent\\shell\\open\\command", command))
    {
        return;
    }

    written = Write(L"Software\\Classes\\magnet", NULL, L"URL:magnet Protocol") &&
              Write(L"Software\\Classes\\magnet", L"URL Protocol", L"") &&
              Write(L"Software\\Classes\\magnet\\shell\\open\\command", NULL, command) &&
              Write(L"Software\\Classes\\.torrent", NULL, L"TinyTorrent.torrent") &&
              Write(L"Software\\Classes\\TinyTorrent.torrent\\shell\\open\\command", NULL, command);

    /* Without this Explorer shows stale icons and keeps sending .torrent to the old handler
       for minutes. */
    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, NULL, NULL);

    Log(L"registered .torrent and magnet: to %s -- %s", exe, written ? L"all five values written" : L"incomplete");
}

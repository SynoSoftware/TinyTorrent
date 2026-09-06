#include "Setting.h"

static const wchar_t Key[] = L"Software\\TinyTorrent";

DWORD Setting(const wchar_t *name, DWORD fallback)
{
    DWORD value = 0;
    DWORD size = sizeof value;

    if (RegGetValueW(HKEY_CURRENT_USER, Key, name, RRF_RT_REG_DWORD, NULL, &value, &size) != ERROR_SUCCESS)
        return fallback;

    return value;
}

void SetSetting(const wchar_t *name, DWORD value)
{
    HKEY key;

    if (RegCreateKeyExW(HKEY_CURRENT_USER, Key, 0, NULL, 0, KEY_SET_VALUE, NULL, &key, NULL) != ERROR_SUCCESS)
        return;

    RegSetValueExW(key, name, 0, REG_DWORD, (const BYTE *)&value, sizeof value);
    RegCloseKey(key);
}

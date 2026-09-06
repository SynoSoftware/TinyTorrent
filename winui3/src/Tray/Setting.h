#pragma once
#include <windows.h>

/* HKCU\Software\TinyTorrent. The interface writes these values too, which is why they are
   registry values rather than a file: the OS owns the format, so neither process parses
   anything. The names below are the whole contract between the two. */

#define SettingPort            L"Port"             /* the engine's RPC port, chosen by the OS */
#define SettingExitStopsEngine L"ExitStopsEngine"  /* 0: Exit leaves the engine running */
#define SettingAddBalloon      L"AddBalloon"       /* 0: a torrent is added silently */

DWORD Setting(const wchar_t *name, DWORD fallback);
void SetSetting(const wchar_t *name, DWORD value);

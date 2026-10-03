#pragma once
#include <windows.h>

/* HKCU\Software\TinyTorrent. The interface writes these values too, which is why they are
   registry values rather than a file: the OS owns the format, so neither process parses
   anything. The names below are the whole contract between the two. */

#define SettingPort            L"Port"             /* the engine's RPC port, chosen by the OS */
#define SettingExitStopsEngine L"ExitStopsEngine"  /* 0: Exit leaves the engine running */
#define SettingExitBehavior    L"ExitBehavior"     /* 0: leave, 1: stop, 2: ask */
#define SettingAddBalloon      L"AddBalloon"       /* 0: a torrent is added silently */
#define SettingSilentAdd       L"SilentAdd"        /* 1: add without starting the interface */

DWORD Setting(const wchar_t *name, DWORD fallback);
void SetSetting(const wchar_t *name, DWORD value);

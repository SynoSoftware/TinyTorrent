#pragma once
#include <windows.h>

/* Three processes, one of them invisible, and for most of a session no interface at all.
   Without somewhere to look, a failure is a torrent that quietly does not start. */

/* Resolves %LOCALAPPDATA%\TinyTorrent\, creates it, and rolls tray.log if it has grown
   past the cap. Everything else here is inert until this has been called. */
void LogOpen(void);

/* One timestamped line. UTF-8, no levels. */
void Log(const wchar_t *format, ...);

/* %LOCALAPPDATA%\TinyTorrent\, with a trailing backslash, or an empty string if
   LOCALAPPDATA was not set. */
const wchar_t *LogFolder(void);

/* Renames path to path + ".1" once it passes the cap, so at most two files survive.
   The engine's own output file is rolled with this too. */
void LogRoll(const wchar_t *path);

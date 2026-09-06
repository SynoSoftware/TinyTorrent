#include "Log.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

/* A file a person reads when something is wrong, not an observability system. The cap
   bounds only how much history survives; this writes a handful of lines per session. */
#define CapBytes (1024 * 1024)

static wchar_t g_folder[MAX_PATH];
static wchar_t g_path[MAX_PATH];

const wchar_t *LogFolder(void)
{
    return g_folder;
}

void LogRoll(const wchar_t *path)
{
    WIN32_FILE_ATTRIBUTE_DATA attributes;
    wchar_t previous[MAX_PATH];

    if (!GetFileAttributesExW(path, GetFileExInfoStandard, &attributes))
        return;
    if (attributes.nFileSizeHigh == 0 && attributes.nFileSizeLow < CapBytes)
        return;

    swprintf_s(previous, MAX_PATH, L"%s.1", path);
    DeleteFileW(previous);
    MoveFileW(path, previous);
}

void LogOpen(void)
{
    if (GetEnvironmentVariableW(L"LOCALAPPDATA", g_folder, MAX_PATH) == 0)
        return;

    /* LOCALAPPDATA is not a length this code controls, and this runs before there is a log:
       truncating leaves a path that fails to open, where the checked forms would abort the
       process with nothing written anywhere to say why. */
    wcsncat_s(g_folder, MAX_PATH, L"\\TinyTorrent\\", _TRUNCATE);
    CreateDirectoryW(g_folder, NULL);

    _snwprintf_s(g_path, MAX_PATH, _TRUNCATE, L"%stray.log", g_folder);
    LogRoll(g_path);
}

void Log(const wchar_t *format, ...)
{
    wchar_t line[2048];
    char utf8[4096];
    SYSTEMTIME now;
    va_list arguments;
    int prefix;
    int bytes;
    HANDLE file;
    DWORD written;

    if (g_path[0] == 0)
        return;

    GetLocalTime(&now);
    prefix = swprintf_s(line, 2048, L"%04d-%02d-%02d %02d:%02d:%02d  ",
                        now.wYear, now.wMonth, now.wDay, now.wHour, now.wMinute, now.wSecond);

    /* Two characters short of the buffer, so the line ending below always has room. The
       arguments include magnet URIs and paths, which are longer than this line on their own,
       and wcscat_s onto a full buffer would abort the process. */
    va_start(arguments, format);
    _vsnwprintf_s(line + prefix, 2048 - prefix - 2, _TRUNCATE, format, arguments);
    va_end(arguments);

    wcscat_s(line, 2048, L"\r\n");

    bytes = WideCharToMultiByte(CP_UTF8, 0, line, -1, utf8, sizeof utf8, NULL, NULL);
    if (bytes <= 1)
        return;

    file = CreateFileW(g_path, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
                       OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE)
        return;

    WriteFile(file, utf8, (DWORD)(bytes - 1), &written, NULL);
    CloseHandle(file);
}

#include "Association.h"
#include "Engine.h"
#include "Icon.h"
#include "Log.h"
#include "Rpc.h"
#include "Setting.h"

#include <windowsx.h>
#include <shellapi.h>
#include <commctrl.h>
#include <tlhelp32.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const wchar_t ClassName[] = L"TinyTorrent.Tray";

#define TrayIconMessage (WM_APP + 200)
#define ActivationArgument 1
#define ActivationShutdown 2
#define IconRetryTimer 1

/* NIM_ADD legitimately fails when the shell is not ready yet at logon, which is exactly the
   autostart case. TaskbarCreated is the shell telling us it is ready and is the main path
   back; this timer only covers a transient failure, and its value decides nothing but how
   soon the icon appears. */
#define IconRetryMs 1000

#define IdStatus 1
#define IdOpen   2
#define IdPause  3
#define IdResume 4
#define IdTurtle 5
#define IdLogs   6
#define IdExit   7

static const char MenuStats[] =
    "[{\"jsonrpc\":\"2.0\",\"method\":\"session_stats\",\"id\":1},"
    "{\"jsonrpc\":\"2.0\",\"method\":\"session_get\",\"params\":{\"fields\":[\"alt_speed_enabled\"]},\"id\":2}]";
static const char PauseAll[] = "{\"jsonrpc\":\"2.0\",\"method\":\"torrent_stop\",\"id\":1}";
static const char ResumeAll[] = "{\"jsonrpc\":\"2.0\",\"method\":\"torrent_start\",\"id\":1}";

static NOTIFYICONDATAW g_icon;
static HMENU g_menu;
static UINT g_taskbarCreated;
static UINT g_enginePortMessage;

#pragma comment(linker, "/manifestdependency:\"type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")

static BOOL InterfacePath(wchar_t *path, DWORD capacity)
{
    wchar_t *name;
    DWORD length = GetModuleFileNameW(NULL, path, capacity);
    if (length == 0 || length >= capacity)
        return FALSE;
    name = wcsrchr(path, L'\\');
    if (!name)
        return FALSE;
    return wcscpy_s(name + 1, capacity - (name + 1 - path), L"TinyTorrent.Ui.exe") == 0;
}

static BOOL CALLBACK CloseProcessWindow(HWND hwnd, LPARAM processId)
{
    DWORD owner;
    GetWindowThreadProcessId(hwnd, &owner);
    if (owner == (DWORD)processId && GetWindow(hwnd, GW_OWNER) == NULL)
        PostMessageW(hwnd, WM_CLOSE, 0, 0);
    return TRUE;
}

static BOOL CloseInterface(void)
{
    wchar_t path[MAX_PATH];
    PROCESSENTRY32W entry = {0};
    HANDLE snapshot;
    BOOL closed = TRUE;
    DWORD sessionId;

    if (!InterfacePath(path, ARRAYSIZE(path)))
        return FALSE;
    if (!ProcessIdToSessionId(GetCurrentProcessId(), &sessionId))
        return FALSE;
    snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE)
        return FALSE;
    entry.dwSize = sizeof entry;
    if (Process32FirstW(snapshot, &entry))
    {
        do
        {
            HANDLE process;
            wchar_t executable[MAX_PATH];
            DWORD capacity = ARRAYSIZE(executable);
            DWORD ownerSession;
            if (_wcsicmp(entry.szExeFile, L"TinyTorrent.Ui.exe") != 0)
                continue;
            if (!ProcessIdToSessionId(entry.th32ProcessID, &ownerSession) || ownerSession != sessionId)
                continue;
            process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, entry.th32ProcessID);
            if (!process)
            {
                closed = FALSE;
                continue;
            }
            if (!QueryFullProcessImageNameW(process, 0, executable, &capacity))
                closed = FALSE;
            else if (_wcsicmp(path, executable) == 0)
            {
                /* HungAppTimeout is Windows' allowance for an unresponsive desktop app. */
                wchar_t timeoutText[32];
                DWORD size = sizeof timeoutText;
                DWORD timeout = 5000;
                if (RegGetValueW(HKEY_CURRENT_USER, L"Control Panel\\Desktop", L"HungAppTimeout",
                                 RRF_RT_REG_SZ, NULL, timeoutText, &size) == ERROR_SUCCESS)
                {
                    DWORD configured = wcstoul(timeoutText, NULL, 10);
                    if (configured != 0)
                        timeout = configured;
                }
                WaitForInputIdle(process, timeout);
                EnumWindows(CloseProcessWindow, (LPARAM)entry.th32ProcessID);
                if (WaitForSingleObject(process, timeout) != WAIT_OBJECT_0)
                {
                    Log(L"the interface (pid %u) did not close; leaving the engine running", entry.th32ProcessID);
                    closed = FALSE;
                }
            }
            CloseHandle(process);
        } while (Process32NextW(snapshot, &entry));
    }
    CloseHandle(snapshot);
    return closed;
}

static BOOL StopEngine(void)
{
    return CloseInterface() && EngineStop();
}

/* A Win32 popup menu does not follow the system theme on its own. SetPreferredAppMode is
   uxtheme's own switch for it: undocumented and reached by ordinal, so it can stop working,
   but its failure mode is a light menu, which is what we would have had anyway. The
   alternative is owner-drawing, which means a second implementation of menu chrome with its
   own colours, and losing high contrast along with it. */
static void AllowDarkMenus(void)
{
    typedef int(WINAPI * PreferredAppMode)(int);
    typedef void(WINAPI * FlushThemes)(void);

    HMODULE uxtheme = LoadLibraryExW(L"uxtheme.dll", NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
    PreferredAppMode setMode;
    FlushThemes flush;

    if (!uxtheme)
        return;

    setMode = (PreferredAppMode)GetProcAddress(uxtheme, MAKEINTRESOURCEA(135));
    flush = (FlushThemes)GetProcAddress(uxtheme, MAKEINTRESOURCEA(136));

    if (setMode)
        setMode(1); /* AllowDark: follow the system, rather than forcing dark on a light desktop */
    if (flush)
        flush();
}

static void PrepareIcon(HWND hwnd, HINSTANCE instance)
{
    g_icon.cbSize = sizeof g_icon;
    g_icon.hWnd = hwnd;
    g_icon.uID = IconApp;
    g_icon.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP | NIF_SHOWTIP;
    g_icon.uCallbackMessage = TrayIconMessage;
    g_icon.hIcon = (HICON)LoadImageW(instance, MAKEINTRESOURCEW(IconApp), IMAGE_ICON,
                                     GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON),
                                     LR_DEFAULTCOLOR);
    wcscpy_s(g_icon.szTip, ARRAYSIZE(g_icon.szTip), L"TinyTorrent");
}

static BOOL AddIcon(void)
{
    if (!Shell_NotifyIconW(NIM_ADD, &g_icon))
        return FALSE;

    /* Version 4 or the tooltip is capped at 64 characters, NIF_SHOWTIP does nothing, and the
       callback keeps the pre-Vista mouse semantics. */
    g_icon.uVersion = NOTIFYICON_VERSION_4;
    Shell_NotifyIconW(NIM_SETVERSION, &g_icon);
    return TRUE;
}

static void ShowIcon(HWND hwnd)
{
    /* NIM_ADD fails outright when the icon is already registered, which both the retry timer
       and a TaskbarCreated that arrives while the icon is still healthy can produce. Removing
       first makes adding idempotent, so neither turns into a timer that never stops. */
    Shell_NotifyIconW(NIM_DELETE, &g_icon);

    if (AddIcon())
    {
        KillTimer(hwnd, IconRetryTimer);
        return;
    }

    Log(L"the shell refused the tray icon (error %u); retrying", GetLastError());
    SetTimer(hwnd, IconRetryTimer, IconRetryMs, NULL);
}

static void UpdateTooltip(void)
{
    const wchar_t *tip;

    switch (Engine())
    {
    case EngineStarting: tip = L"TinyTorrent - starting the engine"; break;
    case EngineReady:    tip = L"TinyTorrent"; break;
    case EngineFailed:   tip = L"TinyTorrent - the engine failed"; break;
    default:             tip = L"TinyTorrent - the engine is not running"; break;
    }

    wcscpy_s(g_icon.szTip, ARRAYSIZE(g_icon.szTip), tip);
    Shell_NotifyIconW(NIM_MODIFY, &g_icon);
}

static void Balloon(const wchar_t *title, const wchar_t *text)
{
    wcsncpy_s(g_icon.szInfoTitle, ARRAYSIZE(g_icon.szInfoTitle), title, _TRUNCATE);
    /* szInfo holds 256 characters and an outcome naming a magnet URI is longer than that;
       wcscpy_s would abort the process rather than truncate. */
    wcsncpy_s(g_icon.szInfo, ARRAYSIZE(g_icon.szInfo), text, _TRUNCATE);
    g_icon.dwInfoFlags = NIIF_NONE;

    g_icon.uFlags |= NIF_INFO;
    Shell_NotifyIconW(NIM_MODIFY, &g_icon);
    g_icon.uFlags &= ~NIF_INFO;
    g_icon.szInfo[0] = 0;
}

/* Transmission's "k" for rates is 1000, not 1024: utils.cc sets Config::Base::Kilo and only
   the GTK and Qt clients ever reassign it. */
static void FormatRate(long long bytesPerSecond, wchar_t *out, int max)
{
    static const wchar_t *const Units[] = {L"kB/s", L"MB/s", L"GB/s"};
    long long scale = 1000;
    int unit = 0;

    if (bytesPerSecond < 1000)
    {
        swprintf_s(out, max, L"%lld B/s", bytesPerSecond);
        return;
    }

    while (unit < 2 && bytesPerSecond >= scale * 1000)
    {
        scale *= 1000;
        unit++;
    }

    swprintf_s(out, max, L"%lld.%lld %s", bytesPerSecond / scale,
               (bytesPerSecond % scale) * 10 / scale, Units[unit]);
}

/* The one read the tray makes, and only when the user opens the menu. Everything else it
   sends is fire and forget. */
static void ReadStatus(wchar_t *status, int max, BOOL *turtle)
{
    char reply[8192];
    long long down = 0;
    long long up = 0;
    long long active = 0;
    wchar_t downText[32];
    wchar_t upText[32];

    *turtle = FALSE;

    switch (Engine())
    {
    case EngineStarting: wcscpy_s(status, max, L"Starting the engine..."); return;
    case EngineFailed:   wcscpy_s(status, max, L"The engine failed - see the log"); return;
    case EngineStopped:  wcscpy_s(status, max, L"The engine is not running"); return;
    default: break;
    }

    if (RpcSend(MenuStats, reply, sizeof reply) != 200)
    {
        wcscpy_s(status, max, L"The engine is not answering");
        return;
    }

    JsonNumber(reply, "download_speed", &down);
    JsonNumber(reply, "upload_speed", &up);
    JsonNumber(reply, "active_torrent_count", &active);
    JsonBool(reply, "alt_speed_enabled", turtle);

    FormatRate(down, downText, ARRAYSIZE(downText));
    FormatRate(up, upText, ARRAYSIZE(upText));
    swprintf_s(status, max, L"\u2193 %s\u2003\u2191 %s\u2003%lld active", downText, upText, active);
}

static void BuildMenu(void)
{
    g_menu = CreatePopupMenu();

    /* MF_DISABLED and deliberately not MF_GRAYED: the status line is inert, but greying it
       makes it look broken. */
    AppendMenuW(g_menu, MF_STRING | MF_DISABLED, IdStatus, L" ");
    AppendMenuW(g_menu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(g_menu, MF_STRING, IdOpen, L"Open TinyTorrent");
    AppendMenuW(g_menu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(g_menu, MF_STRING, IdPause, L"Pause all");
    AppendMenuW(g_menu, MF_STRING, IdResume, L"Resume all");
    AppendMenuW(g_menu, MF_STRING, IdTurtle, L"Turtle mode");
    AppendMenuW(g_menu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(g_menu, MF_STRING, IdLogs, L"Open log folder");
    AppendMenuW(g_menu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(g_menu, MF_STRING, IdExit, L"Exit");

    SetMenuDefaultItem(g_menu, IdOpen, FALSE);
}

static void OpenInterface(const wchar_t *argument)
{
    static const wchar_t LaunchFormat[] = L"\"%s\" -p %u";
    wchar_t path[MAX_PATH];
    wchar_t *command;
    size_t capacity;
    STARTUPINFOW startup;
    PROCESS_INFORMATION created;

    if (!InterfacePath(path, ARRAYSIZE(path)))
        return;

    capacity = wcslen(path) + ARRAYSIZE(LaunchFormat) + ARRAYSIZE(L"65535");
    if (argument)
        capacity += ARRAYSIZE(L" --add \"\"") + wcslen(argument) * 2;
    command = (wchar_t *)malloc(capacity * sizeof(wchar_t));
    if (!command)
        return;
    if (Engine() == EngineReady)
        swprintf_s(command, capacity, LaunchFormat, path, EnginePort());
    else
        swprintf_s(command, capacity, L"\"%s\"", path);
    if (argument)
    {
        const wchar_t *source = argument;
        wchar_t *destination;
        wcscat_s(command, capacity, L" --add \"");
        destination = command + wcslen(command);
        while (*source)
        {
            size_t slashes = 0;
            while (*source == L'\\')
            {
                slashes++;
                source++;
            }
            /* Windows doubles backslashes before quotes and the closing delimiter. */
            if (*source == L'\"' || *source == 0)
                slashes *= 2;
            while (slashes > 0)
            {
                *destination++ = L'\\';
                slashes--;
            }
            if (*source == 0)
                break;
            if (*source == L'\"')
                *destination++ = L'\\';
            *destination++ = *source++;
        }
        *destination++ = L'\"';
        *destination = 0;
    }

    memset(&startup, 0, sizeof startup);
    startup.cb = sizeof startup;

    if (!CreateProcessW(path, command, NULL, NULL, FALSE, 0, NULL, NULL, &startup, &created))
    {
        DWORD error = GetLastError();
        wchar_t text[256];
        Log(L"could not start the interface: %s (error %u)", command, error);
        if (GetFileAttributesW(path) == INVALID_FILE_ATTRIBUTES)
            Balloon(L"TinyTorrent", L"The interface is missing. Reinstall TinyTorrent to restore it.");
        else
        {
            swprintf_s(text, ARRAYSIZE(text), L"The interface could not start (Windows error %u). Open the log folder for details.", error);
            Balloon(L"TinyTorrent", text);
        }
        free(command);
        return;
    }

    AllowSetForegroundWindow(created.dwProcessId);
    CloseHandle(created.hThread);
    CloseHandle(created.hProcess);
    free(command);
}

static void Add(const wchar_t *argument)
{
    if (Setting(SettingSilentAdd, 1))
        EngineAdd(argument);
    else
        OpenInterface(argument);
}

static void Call(const char *json, const wchar_t *what)
{
    char reply[8192];
    wchar_t message[512];
    int status = RpcSend(json, reply, sizeof reply);

    if (status != 200)
        Log(L"%s failed: HTTP %d", what, status);
    else if (RpcFailed(reply, message, ARRAYSIZE(message)))
        Log(L"%s failed: %s", what, message);
}

static int ExitChoice(HWND hwnd)
{
    typedef HRESULT (WINAPI *ShowDialog)(const TASKDIALOGCONFIG *, int *, int *, BOOL *);
    DWORD behavior = Setting(SettingExitBehavior, Setting(SettingExitStopsEngine, 0));
    HMODULE controls;
    ShowDialog show;
    TASKDIALOGCONFIG dialog = {0};
    TASKDIALOG_BUTTON buttons[] = {{IDYES, L"Stop the engine"}, {IDNO, L"Leave the engine running"}};
    int chosen = IDCANCEL;
    BOOL remember = FALSE;
    HRESULT result;

    if (behavior != 2)
        return behavior == 1 ? IDYES : IDNO;
    controls = LoadLibraryExW(L"comctl32.dll", NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
    show = controls ? (ShowDialog)GetProcAddress(controls, "TaskDialogIndirect") : NULL;
    dialog.cbSize = sizeof dialog;
    dialog.hwndParent = hwnd;
    dialog.dwFlags = TDF_ALLOW_DIALOG_CANCELLATION | TDF_POSITION_RELATIVE_TO_WINDOW;
    dialog.pszWindowTitle = L"TinyTorrent";
    dialog.pszMainInstruction = L"Stop the engine when exiting?";
    dialog.pszContent = L"Leaving the engine running keeps your transfers active.";
    dialog.cButtons = ARRAYSIZE(buttons);
    dialog.pButtons = buttons;
    dialog.nDefaultButton = IDNO;
    dialog.pszVerificationText = L"Remember this choice";
    result = show ? show(&dialog, &chosen, NULL, &remember) : E_NOTIMPL;
    if (controls)
        FreeLibrary(controls);
    if (FAILED(result))
    {
        Log(L"could not show the exit choice (HRESULT %08lx)", result);
        return IDCANCEL;
    }
    if (remember && (chosen == IDYES || chosen == IDNO))
        SetSetting(SettingExitBehavior, chosen == IDYES ? 1 : 0);
    return chosen;
}

static BOOL Exit(HWND hwnd, BOOL shutdown)
{
    int chosen = shutdown ? IDYES : ExitChoice(hwnd);
    if (chosen == IDCANCEL)
        return FALSE;
    if (chosen == IDYES && !StopEngine())
    {
        Balloon(L"TinyTorrent", L"TinyTorrent could not close safely. The engine was left running. See the log for details.");
        return FALSE;
    }

    /* The icon comes off after the engine is joined. The other order makes the app look
       closed while it is still writing resume files. */
    Shell_NotifyIconW(NIM_DELETE, &g_icon);
    EngineClose();
    DestroyWindow(hwnd);
    return TRUE;
}

static void Command(HWND hwnd, UINT id, BOOL turtle)
{
    switch (id)
    {
    case IdOpen:
        OpenInterface(NULL);
        break;
    case IdPause:
        Call(PauseAll, L"Pause all");
        break;
    case IdResume:
        Call(ResumeAll, L"Resume all");
        break;
    case IdTurtle:
    {
        char body[128];
        sprintf_s(body, sizeof body,
                  "{\"jsonrpc\":\"2.0\",\"method\":\"session_set\",\"params\":{\"alt_speed_enabled\":%s},\"id\":1}",
                  turtle ? "false" : "true");
        Call(body, L"Turtle mode");
        break;
    }
    case IdLogs:
        ShellExecuteW(NULL, L"open", LogFolder(), NULL, NULL, SW_SHOWNORMAL);
        break;
    case IdExit:
        Exit(hwnd, FALSE);
        break;
    }
}

static void ShowMenu(HWND hwnd, int x, int y)
{
    wchar_t status[160];
    BOOL turtle = FALSE;
    BOOL ready = Engine() == EngineReady;
    MENUITEMINFOW item;
    UINT alignment;
    UINT chosen;

    ReadStatus(status, ARRAYSIZE(status), &turtle);

    memset(&item, 0, sizeof item);
    item.cbSize = sizeof item;
    item.fMask = MIIM_STRING;
    item.dwTypeData = status;
    SetMenuItemInfoW(g_menu, IdStatus, FALSE, &item);

    CheckMenuItem(g_menu, IdTurtle, MF_BYCOMMAND | (turtle ? MF_CHECKED : MF_UNCHECKED));
    EnableMenuItem(g_menu, IdPause, MF_BYCOMMAND | (ready ? MF_ENABLED : MF_GRAYED));
    EnableMenuItem(g_menu, IdResume, MF_BYCOMMAND | (ready ? MF_ENABLED : MF_GRAYED));
    EnableMenuItem(g_menu, IdTurtle, MF_BYCOMMAND | (ready ? MF_ENABLED : MF_GRAYED));

    alignment = GetSystemMetrics(SM_MENUDROPALIGNMENT) ? TPM_RIGHTALIGN : TPM_LEFTALIGN;

    /* A popup owned by a window that is not in the foreground never dismisses on its own. */
    SetForegroundWindow(hwnd);
    chosen = TrackPopupMenu(g_menu, TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_NONOTIFY | alignment,
                            x, y, 0, hwnd, NULL);
    /* And without this it can stay on screen after the user clicks away. */
    PostMessageW(hwnd, WM_NULL, 0, 0);

    if (chosen != 0)
        Command(hwnd, chosen, turtle);
}

static BOOL Activated(HWND hwnd, const COPYDATASTRUCT *data)
{
    const wchar_t *argument;

    if (!data)
        return FALSE;
    if (data->dwData == ActivationShutdown && data->cbData == 0)
        return Exit(hwnd, TRUE);

    /* Any process in this session can find the window by its class name and send it one of
       these, so nothing in the payload is taken on trust. A block that is not a whole number
       of characters, or that does not end in a terminator, would make wcslen in EngineAdd run
       off the end of the sender's block and paste whatever follows into a torrent_add. */
    if (data->dwData != ActivationArgument ||
        data->cbData == 0 ||
        data->cbData % sizeof(wchar_t) != 0)
    {
        return FALSE;
    }

    argument = (const wchar_t *)data->lpData;
    if (!argument || argument[data->cbData / sizeof(wchar_t) - 1] != 0)
        return FALSE;

    /* The sender's memory is only valid for the duration of the message, and EngineAdd
       copies before it returns. */
    Add(argument);
    return TRUE;
}

static void AddFinished(BOOL added, wchar_t *outcome)
{
    /* A rejection is not a confirmation: the user clicked a magnet and nothing else in this
       product is running, so a failure is always shown. The success balloon is the setting. */
    if (!added)
        Balloon(L"TinyTorrent", outcome);
    else if (Setting(SettingAddBalloon, 0))
        Balloon(L"TinyTorrent", outcome);

    free(outcome);
}

static LRESULT CALLBACK WindowProcedure(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam)
{
    if (g_enginePortMessage && message == g_enginePortMessage)
        return Engine() == EngineReady ? EnginePort() : 0;
    /* Broadcast when Explorer restarts. A message-only window never receives it, which is
       why this one is an ordinary top-level window that is simply never shown. */
    if (g_taskbarCreated && message == g_taskbarCreated)
    {
        Log(L"Explorer restarted; re-adding the tray icon");
        ShowIcon(hwnd);
        UpdateTooltip();
        return 0;
    }

    switch (message)
    {
    case TrayIconMessage:
        switch (LOWORD(lParam))
        {
        case NIN_SELECT:
        case NIN_KEYSELECT:
            OpenInterface(NULL);
            return 0;
        case WM_CONTEXTMENU:
            ShowMenu(hwnd, GET_X_LPARAM(wParam), GET_Y_LPARAM(wParam));
            return 0;
        }
        return 0;

    case WM_COPYDATA:
        return Activated(hwnd, (const COPYDATASTRUCT *)lParam);

    case WM_TIMER:
        if (wParam == IconRetryTimer)
            ShowIcon(hwnd);
        return 0;

    case EngineStateChanged:
        UpdateTooltip();
        if ((EngineState)wParam == EngineFailed)
            Balloon(L"TinyTorrent", L"The engine is not running. See the log for what it said.");
        return 0;

    case EngineAddFinished:
        AddFinished((BOOL)wParam, (wchar_t *)lParam);
        return 0;

    /* Without this every Windows restart costs a full re-verify of every torrent, because
       the engine only writes settings.json, stats.json and the .resume files at exit. The
       exit setting governs what the user's Exit does, not what a shutdown does. */
    case WM_QUERYENDSESSION:
        if (!ShutdownBlockReasonCreate(hwnd, L"Stopping the TinyTorrent engine"))
            Log(L"could not ask Windows for shutdown time (error %u)", GetLastError());
        StopEngine();
        ShutdownBlockReasonDestroy(hwnd);
        return TRUE;

    case WM_ENDSESSION:
        if (wParam)
        {
            StopEngine();
            Shell_NotifyIconW(NIM_DELETE, &g_icon);
        }
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }

    return DefWindowProcW(hwnd, message, wParam, lParam);
}

static HANDLE LockStartup(void)
{
    HANDLE mutex = CreateMutexW(NULL, FALSE, ClassName);
    DWORD waited;

    if (!mutex)
        return NULL;
    waited = WaitForSingleObject(mutex, ServiceResponseTimeoutMs);
    if (waited != WAIT_OBJECT_0 && waited != WAIT_ABANDONED)
    {
        CloseHandle(mutex);
        return NULL;
    }
    return mutex;
}

static void UnlockStartup(HANDLE mutex)
{
    ReleaseMutex(mutex);
    CloseHandle(mutex);
}

/* The tray is the single instance, so a second launch hands its argument over and leaves.
   The old implementation called FindWindowW against a message-only window, which top-level
   search can never find, and then posted a payload-free double-click -- so opening a torrent
   while the tray ran did nothing at all. */
static int Forwarded(HWND existing, const wchar_t *argument, BOOL shutdown)
{
    COPYDATASTRUCT data;

    if (shutdown)
    {
        DWORD processId;
        HANDLE process;
        BOOL stopped;
        DWORD_PTR reply = FALSE;
        GetWindowThreadProcessId(existing, &processId);
        process = OpenProcess(SYNCHRONIZE, FALSE, processId);
        if (!process)
            return 1;
        memset(&data, 0, sizeof data);
        data.dwData = ActivationShutdown;
        /* Allows the supervisor's launch and stop budgets, UI close and thread teardown. */
        stopped = SendMessageTimeoutW(existing, WM_COPYDATA, 0, (LPARAM)&data,
                                     SMTO_BLOCK, ServiceResponseTimeoutMs * 4, &reply) != 0 && reply != 0;
        if (stopped)
            stopped = WaitForSingleObject(process, ServiceResponseTimeoutMs) == WAIT_OBJECT_0;
        CloseHandle(process);
        return stopped ? 0 : 1;
    }

    if (argument)
    {
        data.dwData = ActivationArgument;
        data.cbData = (DWORD)((wcslen(argument) + 1) * sizeof(wchar_t));
        data.lpData = (void *)argument;
        SendMessageW(existing, WM_COPYDATA, 0, (LPARAM)&data);
    }
    else
    {
        PostMessageW(existing, TrayIconMessage, 0, MAKELPARAM(NIN_SELECT, IconApp));
    }

    return 0;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR commandLine, int show)
{
    WNDCLASSEXW windowClass;
    HWND hwnd;
    MSG message;
    int count = 0;
    wchar_t **arguments;
    const wchar_t *argument = NULL;
    BOOL shutdown;
    int forwarded;
    HANDLE startup;

    (void)previous;
    (void)commandLine;
    (void)show;

    /* Otherwise GetSystemMetrics(SM_CXSMICON) always answers with the 96-DPI value and the
       shell upscales a 16 px icon. */
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    arguments = CommandLineToArgvW(GetCommandLineW(), &count);
    if (arguments && count > 1)
        argument = arguments[1];

    shutdown = argument && wcscmp(argument, L"--shutdown") == 0;
    startup = LockStartup();
    if (!startup)
    {
        LocalFree(arguments);
        return 1;
    }
    hwnd = FindWindowW(ClassName, NULL);
    if (hwnd)
    {
        UnlockStartup(startup);
        forwarded = Forwarded(hwnd, argument, shutdown);
        LocalFree(arguments);
        return forwarded;
    }

    LogOpen();
    Log(L"tray starting");

    AllowDarkMenus();
    if (!shutdown)
        RegisterAssociations();

    memset(&windowClass, 0, sizeof windowClass);
    windowClass.cbSize = sizeof windowClass;
    windowClass.lpfnWndProc = WindowProcedure;
    windowClass.hInstance = instance;
    windowClass.lpszClassName = ClassName;
    if (!RegisterClassExW(&windowClass))
    {
        UnlockStartup(startup);
        LocalFree(arguments);
        return 1;
    }

    /* An ordinary top-level window that is never shown, so it receives the TaskbarCreated
       broadcast; WS_EX_TOOLWINDOW keeps it out of Alt+Tab. */
    hwnd = CreateWindowExW(WS_EX_TOOLWINDOW, ClassName, L"TinyTorrent", WS_OVERLAPPED,
                           0, 0, 0, 0, NULL, NULL, instance, NULL);
    if (!hwnd)
    {
        UnlockStartup(startup);
        LocalFree(arguments);
        return 1;
    }

    g_taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
    g_enginePortMessage = RegisterWindowMessageW(L"TinyTorrent.EnginePort");

    if (!EngineOpen(hwnd, !shutdown))
    {
        Log(L"could not start the engine supervisor");
        if (shutdown)
        {
            DestroyWindow(hwnd);
            UnlockStartup(startup);
            LocalFree(arguments);
            return 1;
        }
    }

    if (shutdown)
    {
        BOOL stopped = StopEngine();
        EngineClose();
        DestroyWindow(hwnd);
        UnlockStartup(startup);
        LocalFree(arguments);
        return stopped ? 0 : 1;
    }

    BuildMenu();
    PrepareIcon(hwnd, instance);
    ShowIcon(hwnd);
    UnlockStartup(startup);

    if (argument)
        Add(argument);
    LocalFree(arguments);

    while (GetMessageW(&message, NULL, 0, 0) > 0)
    {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }

    Log(L"tray exiting");
    return 0;
}

#include "Engine.h"
#include "Log.h"
#include "Rpc.h"
#include "Setting.h"

#include <winsock2.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

/* Windows already answers "how long may a background process take to become responsive":
   ServicesPipeTimeout, whose default is 30000 ms, is what the service control manager
   allows. The same question, so the same number -- used for readiness and for shutdown. */
#define ServiceResponseTimeoutMs 30000

/* Only affects how quickly readiness is noticed; the loop also wakes the moment the engine
   process exits, which is the failure that actually matters. */
#define ReadyPollMs 100

/* Messages to the supervising thread. */
#define WorkLaunch (WM_APP + 100)
#define WorkAdd    (WM_APP + 101)
#define WorkStop   (WM_APP + 102)
#define WorkQuit   (WM_APP + 103)

static const char ProbeConfigDir[] =
    "{\"jsonrpc\":\"2.0\",\"method\":\"session_get\",\"params\":{\"fields\":[\"config_dir\"]},\"id\":1}";
static const char SessionClose[] =
    "{\"jsonrpc\":\"2.0\",\"method\":\"session_close\",\"id\":1}";
static const char AddBody[] =
    "{\"jsonrpc\":\"2.0\",\"method\":\"torrent_add\",\"params\":{\"filename\":\"%s\"},\"id\":1}";

/* rpc-bind-address defaults to 0.0.0.0, so the engine would otherwise listen on every
   interface. The other three are the daemon's own 4.1.1 defaults, written anyway because
   "loopback only, no password" is a requirement here and not something to inherit from a
   default that is not ours. Seeded once with CREATE_NEW; the engine owns the file after
   that and rewrites it at every exit. */
static const char SeededSettings[] =
    "{\r\n"
    "    \"rpc-authentication-required\": false,\r\n"
    "    \"rpc-bind-address\": \"127.0.0.1\",\r\n"
    "    \"rpc-whitelist\": \"127.0.0.1\",\r\n"
    "    \"rpc-whitelist-enabled\": true\r\n"
    "}\r\n";

static HWND g_notify;
static HANDLE g_thread;
static DWORD g_threadId;
static HANDLE g_queueReady;
static HANDLE g_stopFinished;

static HANDLE g_process;          /* NULL when the engine was adopted rather than launched */
static volatile LONG g_state = EngineStopped;
static unsigned short g_port;
static int g_restarts;

static wchar_t g_configDir[MAX_PATH];
static wchar_t g_enginePath[MAX_PATH];
static wchar_t g_outputPath[MAX_PATH];

EngineState Engine(void)
{
    return (EngineState)g_state;
}

unsigned short EnginePort(void)
{
    return g_port;
}

static void SetState(EngineState state)
{
    InterlockedExchange(&g_state, (LONG)state);
    PostMessageW(g_notify, EngineStateChanged, (WPARAM)state, 0);
}

/* An OS-chosen port, because 9091 may already belong to the user's own Transmission and
   that failure presents as "connected to the wrong daemon". */
static unsigned short FreePort(void)
{
    WSADATA winsock;
    SOCKET probe;
    struct sockaddr_in address;
    int length = sizeof address;
    unsigned short port = 0;

    if (WSAStartup(MAKEWORD(2, 2), &winsock) != 0)
        return 0;

    probe = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (probe != INVALID_SOCKET)
    {
        memset(&address, 0, sizeof address);
        address.sin_family = AF_INET;
        address.sin_port = 0;
        address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

        if (bind(probe, (struct sockaddr *)&address, sizeof address) == 0 &&
            getsockname(probe, (struct sockaddr *)&address, &length) == 0)
        {
            port = ntohs(address.sin_port);
        }
        closesocket(probe);
    }

    WSACleanup();
    return port;
}

static BOOL SamePath(const wchar_t *left, const wchar_t *right)
{
    wchar_t a[MAX_PATH];
    wchar_t b[MAX_PATH];
    size_t length;

    wcscpy_s(a, MAX_PATH, left);
    wcscpy_s(b, MAX_PATH, right);

    length = wcslen(a);
    if (length > 0 && a[length - 1] == L'\\')
        a[length - 1] = 0;
    length = wcslen(b);
    if (length > 0 && b[length - 1] == L'\\')
        b[length - 1] = 0;

    return _wcsicmp(a, b) == 0;
}

/* The check that stops the tray adopting the user's own Transmission: a running engine is
   ours only if it reports the configuration directory we would have given it. */
static BOOL Adopt(unsigned short port)
{
    char reply[8192];
    wchar_t reported[MAX_PATH];
    int status;

    if (!RpcOpen(port))
        return FALSE;

    status = RpcSend(ProbeConfigDir, reply, sizeof reply);
    if (status != 200)
    {
        Log(L"port %u did not answer session_get (HTTP %d), so there is nothing to adopt", port, status);
    }
    else if (!JsonString(reply, "config_dir", reported, MAX_PATH))
    {
        Log(L"port %u answered without a config_dir; not adopting", port);
    }
    else if (!SamePath(reported, g_configDir))
    {
        Log(L"refused to adopt the engine on port %u: it reports config_dir %s, not %s",
            port, reported, g_configDir);
    }
    else
    {
        Log(L"adopted the engine already running on port %u; its config_dir is ours", port);
        return TRUE;
    }

    /* Refusing to adopt has to drop the connection as well. Whatever answered that port is
       not ours -- it may be the user's own Transmission -- and a connection left open on it
       is one that a later session_close would reach. */
    RpcClose();
    return FALSE;
}

static void SeedSettings(void)
{
    wchar_t path[MAX_PATH];
    HANDLE file;
    DWORD written;

    _snwprintf_s(path, MAX_PATH, _TRUNCATE, L"%s\\settings.json", g_configDir);

    file = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE)
        return;

    WriteFile(file, SeededSettings, (DWORD)(sizeof SeededSettings - 1), &written, NULL);
    CloseHandle(file);
    Log(L"seeded %s", path);
}

static HANDLE OpenInheritable(const wchar_t *path, DWORD access, DWORD disposition)
{
    SECURITY_ATTRIBUTES inheritable;

    inheritable.nLength = sizeof inheritable;
    inheritable.lpSecurityDescriptor = NULL;
    inheritable.bInheritHandle = TRUE;

    return CreateFileW(path, access, FILE_SHARE_READ | FILE_SHARE_WRITE, &inheritable,
                       disposition, FILE_ATTRIBUTE_NORMAL, NULL);
}

static BOOL Spawn(void)
{
    wchar_t command[MAX_PATH * 3];
    STARTUPINFOW startup;
    PROCESS_INFORMATION created;
    HANDLE output;
    HANDLE input;
    BOOL started;

    /* -f is mandatory: without it the Windows build registers itself as the
       TransmissionDaemon service, which needs elevation and outlives us. */
    swprintf_s(command, MAX_PATH * 3, L"\"%s\" -f -g \"%s\" -p %u", g_enginePath, g_configDir, g_port);

    LogRoll(g_outputPath);
    output = OpenInheritable(g_outputPath, FILE_APPEND_DATA, OPEN_ALWAYS);
    input = OpenInheritable(L"NUL", GENERIC_READ, OPEN_EXISTING);

    memset(&startup, 0, sizeof startup);
    startup.cb = sizeof startup;
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdInput = input;
    startup.hStdOutput = output;
    startup.hStdError = output;

    started = CreateProcessW(g_enginePath, command, NULL, NULL, TRUE, CREATE_NO_WINDOW,
                             NULL, g_configDir, &startup, &created);

    if (output != INVALID_HANDLE_VALUE)
        CloseHandle(output);
    if (input != INVALID_HANDLE_VALUE)
        CloseHandle(input);

    if (!started)
    {
        Log(L"could not start %s (error %u)", command, GetLastError());
        return FALSE;
    }

    CloseHandle(created.hThread);
    g_process = created.hProcess;
    Log(L"started %s (pid %u)", command, created.dwProcessId);
    return TRUE;
}

static BOOL WaitReady(void)
{
    char reply[8192];
    DWORD deadline = GetTickCount() + ServiceResponseTimeoutMs;

    for (;;)
    {
        if (RpcSend(ProbeConfigDir, reply, sizeof reply) == 200)
            return TRUE;

        /* Waiting on the process is both the delay between probes and the way an engine that
           dies during startup is noticed at once instead of after the whole timeout. */
        if (WaitForSingleObject(g_process, ReadyPollMs) == WAIT_OBJECT_0)
        {
            DWORD code = 0;
            GetExitCodeProcess(g_process, &code);
            CloseHandle(g_process);
            g_process = NULL;
            Log(L"the engine exited with code %u before it answered; see engine.log", code);
            return FALSE;
        }

        if ((long)(GetTickCount() - deadline) >= 0)
        {
            /* Nothing supervises it after this: the state goes to EngineFailed and the handle
               is dropped. A daemon that never answered has no session to write out, so there
               is nothing here for session_close to save even if it could be asked. */
            Log(L"the engine did not answer within %d ms; stopping it, see engine.log", ServiceResponseTimeoutMs);
            TerminateProcess(g_process, 1);
            CloseHandle(g_process);
            g_process = NULL;
            return FALSE;
        }
    }
}

static void StartOurOwn(void)
{
    SetState(EngineStarting);

    if (!RpcOpen(g_port) || !Spawn() || !WaitReady())
    {
        SetState(EngineFailed);
        return;
    }

    Log(L"the engine is ready on port %u", g_port);
    SetState(EngineReady);
}

static void Launch(void)
{
    unsigned short persisted = (unsigned short)Setting(SettingPort, 0);

    SetState(EngineStarting);

    if (persisted != 0)
    {
        g_port = persisted;
        if (Adopt(persisted))
        {
            SetState(EngineReady);
            return;
        }
    }

    g_port = FreePort();
    if (g_port == 0)
    {
        Log(L"could not obtain a free loopback port");
        SetState(EngineFailed);
        return;
    }

    SetSetting(SettingPort, g_port);
    StartOurOwn();
}

static void Exited(BOOL stopping)
{
    DWORD code = 0;

    GetExitCodeProcess(g_process, &code);
    CloseHandle(g_process);
    g_process = NULL;

    Log(L"the engine exited on its own with code %u", code);

    /* A stop is already queued, so this exit is the shutdown arriving early rather than a
       failure. Restarting would spawn a process for the queued stop to stop again, spend the
       one restart on it, and hold the shutdown up for as long as the new engine takes to
       become ready. */
    if (stopping)
        return;

    /* An unbounded restart loop against an engine that crashes on its own data hides the
       failure forever. One restart, then report it. */
    if (g_restarts > 0)
    {
        Log(L"already restarted once, so leaving it stopped; see engine.log");
        SetState(EngineFailed);
        return;
    }

    g_restarts++;
    StartOurOwn();
}

static void Add(const wchar_t *argument)
{
    char reply[8192];
    wchar_t message[512];
    char *quoted;
    char *body;
    size_t bodyMax;
    wchar_t *outcome;
    int status;
    BOOL added = FALSE;

    /* A magnet URI is as long as its display name and tracker list make it, so the body is
       sized from the argument. sizeof AddBody covers the terminator and the two characters
       of "%s" that the quoted text replaces. */
    quoted = JsonQuote(argument);
    bodyMax = quoted ? strlen(quoted) + sizeof AddBody : 0;
    body = quoted ? (char *)malloc(bodyMax) : NULL;

    if (!body)
    {
        wcscpy_s(message, 512, L"There was not enough memory to add the torrent.");
    }
    else
    {
        sprintf_s(body, bodyMax, AddBody, quoted);
        status = RpcSend(body, reply, sizeof reply);

        if (status != 200)
        {
            swprintf_s(message, 512, L"The engine did not accept the torrent (HTTP %d).", status);
        }
        else if (RpcFailed(reply, message, 512))
        {
            /* The argument is a magnet URI or a path, so it has no length the code controls, and
               swprintf_s aborts the process rather than truncating when it does not fit. Every
               format below that carries it truncates instead. */
            wchar_t reason[512];
            wcsncpy_s(reason, 512, message, _TRUNCATE);
            _snwprintf_s(message, 512, _TRUNCATE, L"%s could not be added: %s", argument, reason);
        }
        else
        {
            wchar_t name[512];
            added = TRUE;
            if (!JsonString(reply, "name", name, 512))
                wcsncpy_s(name, 512, argument, _TRUNCATE);

            if (strstr(reply, "\"torrent_duplicate\""))
                _snwprintf_s(message, 512, _TRUNCATE, L"%s is already in the list.", name);
            else
                _snwprintf_s(message, 512, _TRUNCATE, L"Added %s.", name);
        }
    }

    free(quoted);
    free(body);

    Log(L"torrent_add %s: %s", argument, message);

    outcome = (wchar_t *)malloc((wcslen(message) + 1) * sizeof(wchar_t));
    if (outcome)
    {
        wcscpy_s(outcome, wcslen(message) + 1, message);
        PostMessageW(g_notify, EngineAddFinished, (WPARAM)added, (LPARAM)outcome);
    }
}

/* Sends session_close so the engine writes settings.json, stats.json and every .resume file.
   Killing it instead loses resume state and makes the next start re-verify everything. */
static void Stop(void)
{
    char reply[8192];

    if (g_state == EngineStopped)
        return;

    Log(L"stopping the engine on port %u", g_port);
    RpcSend(SessionClose, reply, sizeof reply);

    if (g_process)
    {
        if (WaitForSingleObject(g_process, ServiceResponseTimeoutMs) != WAIT_OBJECT_0)
            Log(L"the engine had not exited after %d ms", ServiceResponseTimeoutMs);
        CloseHandle(g_process);
        g_process = NULL;
    }
    else
    {
        /* Adopted, so there is no handle to wait on. Watch the port instead. */
        DWORD deadline = GetTickCount() + ServiceResponseTimeoutMs;
        while (RpcSend(ProbeConfigDir, reply, sizeof reply) == 200)
        {
            if ((long)(GetTickCount() - deadline) >= 0)
            {
                Log(L"the adopted engine was still answering after %d ms", ServiceResponseTimeoutMs);
                break;
            }
            Sleep(ReadyPollMs);
        }
    }

    SetState(EngineStopped);
    Log(L"the engine has stopped");
}

static DWORD WINAPI Supervise(void *unused)
{
    MSG message;

    (void)unused;

    /* Force the queue into existence before anyone is told they may post to it. */
    PeekMessageW(&message, NULL, WM_USER, WM_USER, PM_NOREMOVE);
    SetEvent(g_queueReady);

    for (;;)
    {
        HANDLE watched[1];
        DWORD count = 0;
        DWORD woke;

        if (g_process)
            watched[count++] = g_process;

        woke = MsgWaitForMultipleObjectsEx(count, watched, INFINITE, QS_ALLPOSTMESSAGE, MWMO_INPUTAVAILABLE);

        if (count > 0 && woke == WAIT_OBJECT_0)
        {
            /* MsgWaitForMultipleObjectsEx answers with the lowest signalled object, so an exit
               that races a queued stop is always the one reported. Whether this is a failure
               to restart from or the engine going away during shutdown is in the queue, not in
               the wait, so it is read from there. */
            Exited(PeekMessageW(&message, NULL, WorkStop, WorkStop, PM_NOREMOVE));
            continue;
        }

        while (PeekMessageW(&message, NULL, 0, 0, PM_REMOVE))
        {
            switch (message.message)
            {
            case WorkLaunch:
                Launch();
                break;
            case WorkAdd:
                Add((const wchar_t *)message.lParam);
                free((void *)message.lParam);
                break;
            case WorkStop:
                Stop();
                SetEvent(g_stopFinished);
                break;
            case WorkQuit:
                return 0;
            }
        }
    }
}

BOOL EngineOpen(HWND notify)
{
    wchar_t folder[MAX_PATH];
    wchar_t *lastSlash;

    g_notify = notify;

    if (GetModuleFileNameW(NULL, folder, MAX_PATH) == 0)
        return FALSE;
    lastSlash = wcsrchr(folder, L'\\');
    if (!lastSlash)
        return FALSE;
    *lastSlash = 0;

    /* The engine ships beside the tray. The install folder and LOCALAPPDATA are lengths the
       code does not control, so all three truncate: a path too long for MAX_PATH fails the
       file operation it is used for and is logged, where swprintf_s would abort the process
       here, before there is a log to say why. */
    _snwprintf_s(g_enginePath, MAX_PATH, _TRUNCATE, L"%s\\transmission-daemon.exe", folder);

    /* Its own configuration directory: the engine takes an exclusive lock on one, so sharing
       the user's own would mean whichever started second fails. Both must be able to run. */
    _snwprintf_s(g_configDir, MAX_PATH, _TRUNCATE, L"%sdaemon", LogFolder());
    CreateDirectoryW(g_configDir, NULL);
    SeedSettings();

    _snwprintf_s(g_outputPath, MAX_PATH, _TRUNCATE, L"%sengine.log", LogFolder());

    g_queueReady = CreateEventW(NULL, TRUE, FALSE, NULL);
    g_stopFinished = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!g_queueReady || !g_stopFinished)
        return FALSE;

    g_thread = CreateThread(NULL, 0, Supervise, NULL, 0, &g_threadId);
    if (!g_thread)
        return FALSE;

    WaitForSingleObject(g_queueReady, INFINITE);
    PostThreadMessageW(g_threadId, WorkLaunch, 0, 0);
    return TRUE;
}

void EngineAdd(const wchar_t *argument)
{
    size_t length = wcslen(argument) + 1;
    wchar_t *copy;

    if (!g_thread)
        return;

    copy = (wchar_t *)malloc(length * sizeof(wchar_t));
    if (!copy)
        return;
    wcscpy_s(copy, length, argument);

    /* The supervising thread's queue is the pending-add queue: WorkLaunch was posted first,
       so an argument handed to a cold start is handled the moment the engine is ready. */
    if (!PostThreadMessageW(g_threadId, WorkAdd, 0, (LPARAM)copy))
        free(copy);
}

void EngineStop(void)
{
    if (!g_thread)
        return;

    ResetEvent(g_stopFinished);
    if (!PostThreadMessageW(g_threadId, WorkStop, 0, 0))
        return;

    /* Bounded, so a supervising thread still inside a launch cannot hang a shutdown. */
    if (WaitForSingleObject(g_stopFinished, ServiceResponseTimeoutMs) != WAIT_OBJECT_0)
        Log(L"the engine did not confirm it had stopped");
}

void EngineClose(void)
{
    if (!g_thread)
        return;

    PostThreadMessageW(g_threadId, WorkQuit, 0, 0);
    WaitForSingleObject(g_thread, ServiceResponseTimeoutMs);
    CloseHandle(g_thread);
    g_thread = NULL;

    if (g_process)
    {
        CloseHandle(g_process);
        g_process = NULL;
    }
    RpcClose();
}

#include <windows.h>
#include <stdio.h>

static wchar_t g_mutexName[80];
static HANDLE WINAPI CreateTestMutex(LPSECURITY_ATTRIBUTES attributes, BOOL owner, LPCWSTR name);

/* Compile the actual private startup gate and RPC scanner; unused tray/HTTP functions are
   discarded by the test linker. The mutex name is isolated from any running product. */
#define CreateMutexW CreateTestMutex
#include "../../src/Tray/Main.c"
#undef CreateMutexW
#include "../../src/Tray/Rpc.c"

static HANDLE WINAPI CreateTestMutex(LPSECURITY_ATTRIBUTES attributes, BOOL owner, LPCWSTR name)
{
    (void)name;
    return CreateMutexW(attributes, owner, g_mutexName);
}

static int g_failures;

static void Check(BOOL passed, const char *name)
{
    if (!passed)
    {
        printf("FAIL: %s\n", name);
        g_failures++;
    }
}

static void Replies(void)
{
    static const struct
    {
        const char *reply;
        BOOL failed;
        const wchar_t *message;
    } cases[] = {
        {"{\"jsonrpc\":\"2.0\",\"result\":{\"torrent_added\":{\"name\":\"error\"}},\"id\":1}", FALSE, NULL},
        {"{\"result\":{\"error\":{\"message\":\"nested\"}}}", FALSE, NULL},
        {"{\"result\":{\"name\":\"\\\"error\\\": {\\\"message\\\": \\\"text\\\"}\"}}", FALSE, NULL},
        {"{\"error\":null,\"result\":{}}", FALSE, NULL},
        {"{\"jsonrpc\":\"2.0\",\"error\":{\"code\":4,\"message\":\"unrecognized info\"},\"id\":1}", TRUE, L"unrecognized info"},
        {" { \"id\" : 1, \"error\" \n : \t { \"message\" : \"rejected\" } } ", TRUE, L"rejected"},
        {"{\"error\":{\"data\":{\"message\":\"nested\"},\"message\":\"actual\"}}", TRUE, L"actual"},
        {"{\"error\":{\"code\":4},\"result\":{\"message\":\"unrelated\"}}", TRUE, L"the engine rejected the request"},
        {"{\"error\":{\"message\":\"quoted \\\"text\\\" and \\\\path\"}}", TRUE, L"quoted \"text\" and \\path"},
    };
    size_t index;
    wchar_t message[128];
    long long number = 0;
    BOOL flag = FALSE;

    for (index = 0; index < ARRAYSIZE(cases); index++)
    {
        BOOL failed = RpcFailed(cases[index].reply, message, ARRAYSIZE(message));
        Check(failed == cases[index].failed, cases[index].reply);
        if (cases[index].message && failed)
            Check(wcscmp(message, cases[index].message) == 0, "error message comes from the envelope error");
    }

    Check(JsonNumber("[{\"result\":{\"download_speed\":123}},{\"result\":{\"upload_speed\":45}}]",
                     "download_speed", &number) && number == 123, "batch status numeric lookup");
    Check(JsonBool("[{\"result\":{}},{\"result\":{\"alt_speed_enabled\":true}}]",
                   "alt_speed_enabled", &flag) && flag, "batch status boolean lookup");
    Check(JsonString("{\"result\":{\"config_dir\":\"C:\\\\TinyTorrent\"}}", "config_dir",
                     message, ARRAYSIZE(message)) && wcscmp(message, L"C:\\TinyTorrent") == 0,
          "existing nested config string lookup");
    Check(JsonNumber("{\"name\":\"\\\"download_speed\\\":999\",\"download_speed\":42}",
                     "download_speed", &number) && number == 42, "quoted field text is skipped");
    printf("RPC response cases: %zu\n", ARRAYSIZE(cases) + 4);
}

static HANDLE g_start;
static LONG g_inside;
static LONG g_overlap;
static LONG g_created;
static LONG g_gateFailures;
static BOOL g_exists;
static HANDLE g_abandoned;

static DWORD WINAPI Starting(void *context)
{
    HANDLE startup;
    (void)context;
    WaitForSingleObject(g_start, INFINITE);
    startup = LockStartup();
    if (!startup)
    {
        InterlockedIncrement(&g_gateFailures);
        return 1;
    }
    if (InterlockedIncrement(&g_inside) != 1)
        InterlockedIncrement(&g_overlap);
    if (!g_exists)
    {
        Sleep(20);
        g_exists = TRUE;
        InterlockedIncrement(&g_created);
    }
    InterlockedDecrement(&g_inside);
    UnlockStartup(startup);
    return 0;
}

static DWORD WINAPI Abandoning(void *context)
{
    (void)context;
    g_abandoned = LockStartup();
    return 0;
}

static void Startup(void)
{
    HANDLE threads[8];
    HANDLE startup;
    size_t index;
    DWORD waited;

    swprintf_s(g_mutexName, ARRAYSIZE(g_mutexName), L"TinyTorrent.Tray.Tests.%u.%llu",
               GetCurrentProcessId(), GetTickCount64());
    g_start = CreateEventW(NULL, TRUE, FALSE, NULL);
    Check(g_start != NULL, "startup barrier exists");
    if (!g_start)
        return;
    for (index = 0; index < ARRAYSIZE(threads); index++)
    {
        threads[index] = CreateThread(NULL, 0, Starting, NULL, 0, NULL);
        Check(threads[index] != NULL, "startup contender exists");
        if (!threads[index])
            break;
    }
    SetEvent(g_start);
    while (index > 0)
    {
        index--;
        Check(WaitForSingleObject(threads[index], ServiceResponseTimeoutMs) == WAIT_OBJECT_0,
              "startup contender finishes");
        CloseHandle(threads[index]);
    }
    CloseHandle(g_start);
    Check(g_gateFailures == 0, "startup gates are acquired");
    Check(g_overlap == 0, "startup scopes never overlap");
    Check(g_created == 1, "simultaneous check/create has one owner");

    threads[0] = CreateThread(NULL, 0, Abandoning, NULL, 0, NULL);
    Check(threads[0] != NULL, "abandoning owner exists");
    if (threads[0])
    {
        waited = WaitForSingleObject(threads[0], ServiceResponseTimeoutMs);
        Check(waited == WAIT_OBJECT_0 && g_abandoned != NULL, "owner abandoned startup mutex");
        if (waited == WAIT_OBJECT_0 && g_abandoned)
        {
            startup = LockStartup();
            Check(startup != NULL, "abandoned startup mutex is recovered");
            if (startup)
                UnlockStartup(startup);
            CloseHandle(g_abandoned);
        }
        CloseHandle(threads[0]);
    }
    printf("Startup checks: contention and abandoned owner\n");
}

int main(void)
{
    Replies();
    Startup();
    printf("Failures: %d\n", g_failures);
    return g_failures == 0 ? 0 : 1;
}

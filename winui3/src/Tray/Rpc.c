#include "Rpc.h"
#include "Log.h"

#include <winhttp.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Every call here is one short POST to 127.0.0.1, so the only thing a timeout protects
   against is an engine that has stopped answering. Windows already has a number for "long
   enough that the user believes the program has hung": HungAppTimeout, whose default is
   5000 ms. A menu that waits longer than that is the thing the timeout exists to prevent. */
#define HungAppTimeoutMs 5000

static HINTERNET g_session;
static HINTERNET g_connect;
static CRITICAL_SECTION g_lock;
static BOOL g_lockReady;
static wchar_t g_sessionId[192];

BOOL RpcOpen(unsigned short port)
{
    if (!g_lockReady)
    {
        InitializeCriticalSection(&g_lock);
        g_lockReady = TRUE;
    }

    /* Reopening happens on the engine thread while the window thread may be inside a menu
       command, so the handles are replaced under the same lock that guards a send. */
    EnterCriticalSection(&g_lock);
    RpcClose();

    /* NO_PROXY, not DEFAULT_PROXY: the target is loopback, and the user's proxy settings
       have no business being consulted for traffic that never leaves the machine. */
    g_session = WinHttpOpen(L"TinyTorrent", WINHTTP_ACCESS_TYPE_NO_PROXY,
                            WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (g_session)
    {
        WinHttpSetTimeouts(g_session, HungAppTimeoutMs, HungAppTimeoutMs, HungAppTimeoutMs, HungAppTimeoutMs);
        g_connect = WinHttpConnect(g_session, L"127.0.0.1", port, 0);
        if (!g_connect)
        {
            WinHttpCloseHandle(g_session);
            g_session = NULL;
        }
    }

    /* A session id belongs to one engine. Never carry one across. */
    g_sessionId[0] = 0;
    LeaveCriticalSection(&g_lock);

    return g_connect != NULL;
}

void RpcClose(void)
{
    if (!g_lockReady)
        return;

    EnterCriticalSection(&g_lock);
    if (g_connect)
    {
        WinHttpCloseHandle(g_connect);
        g_connect = NULL;
    }
    if (g_session)
    {
        WinHttpCloseHandle(g_session);
        g_session = NULL;
    }
    LeaveCriticalSection(&g_lock);
}

static int SendOnce(const char *json, char *reply, int replyMax)
{
    HINTERNET request;
    wchar_t headers[320];
    DWORD status = 0;
    DWORD size = sizeof status;
    DWORD length = (DWORD)strlen(json);
    int used = 0;

    reply[0] = 0;

    request = WinHttpOpenRequest(g_connect, L"POST", L"/transmission/rpc", NULL,
                                 WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
    if (!request)
        return 0;

    swprintf_s(headers, 320,
               L"Content-Type: application/json\r\nX-Transmission-Session-Id: %s", g_sessionId);

    if (!WinHttpSendRequest(request, headers, (DWORD)-1, (void *)json, length, length, 0) ||
        !WinHttpReceiveResponse(request, NULL) ||
        !WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                             WINHTTP_HEADER_NAME_BY_INDEX, &status, &size, WINHTTP_NO_HEADER_INDEX))
    {
        WinHttpCloseHandle(request);
        return 0;
    }

    if (status == HTTP_STATUS_CONFLICT)
    {
        size = sizeof g_sessionId;
        WinHttpQueryHeaders(request, WINHTTP_QUERY_CUSTOM, L"X-Transmission-Session-Id",
                            g_sessionId, &size, WINHTTP_NO_HEADER_INDEX);
    }
    else
    {
        DWORD read = 0;
        while (used + 1 < replyMax &&
               WinHttpReadData(request, reply + used, (DWORD)(replyMax - used - 1), &read) && read > 0)
        {
            used += (int)read;
        }
        reply[used] = 0;
    }

    WinHttpCloseHandle(request);
    return (int)status;
}

int RpcSend(const char *json, char *reply, int replyMax)
{
    int status;

    if (!g_lockReady)
        return 0;

    EnterCriticalSection(&g_lock);
    if (!g_connect)
    {
        LeaveCriticalSection(&g_lock);
        return 0;
    }

    status = SendOnce(json, reply, replyMax);

    /* One replay, and one is provably enough: the 409 is emitted before the method is
       dispatched, so the request did not execute, and the id rotates hourly while a request
       lives seconds. A second consecutive 409 is not a stale id. */
    if (status == HTTP_STATUS_CONFLICT)
        status = SendOnce(json, reply, replyMax);

    LeaveCriticalSection(&g_lock);

    /* Status 0 is "could not send", not an answer, and readiness polling produces one every
       100 ms while the engine is still starting. A real non-200 is worth a line; that is not. */
    if (status != 0 && status != HTTP_STATUS_OK)
        Log(L"the engine answered HTTP %d", status);

    return status;
}

static const char *FindValue(const char *json, const char *key)
{
    char quoted[64];
    const char *found;

    if (sprintf_s(quoted, sizeof quoted, "\"%s\"", key) < 0)
        return NULL;

    found = strstr(json, quoted);
    if (!found)
        return NULL;

    found += strlen(quoted);
    while (*found == ' ' || *found == '\t' || *found == '\r' || *found == '\n')
        found++;
    if (*found != ':')
        return NULL;

    found++;
    while (*found == ' ' || *found == '\t' || *found == '\r' || *found == '\n')
        found++;

    return found;
}

BOOL JsonNumber(const char *json, const char *key, long long *value)
{
    const char *at = FindValue(json, key);
    long long sign = 1;
    long long result = 0;
    BOOL any = FALSE;

    if (!at)
        return FALSE;

    if (*at == '-')
    {
        sign = -1;
        at++;
    }
    while (*at >= '0' && *at <= '9')
    {
        result = result * 10 + (*at - '0');
        at++;
        any = TRUE;
    }

    if (!any)
        return FALSE;

    *value = result * sign;
    return TRUE;
}

BOOL JsonBool(const char *json, const char *key, BOOL *value)
{
    const char *at = FindValue(json, key);

    if (!at)
        return FALSE;

    if (strncmp(at, "true", 4) == 0)
    {
        *value = TRUE;
        return TRUE;
    }
    if (strncmp(at, "false", 5) == 0)
    {
        *value = FALSE;
        return TRUE;
    }
    return FALSE;
}

BOOL JsonString(const char *json, const char *key, wchar_t *value, int valueMax)
{
    const char *at = FindValue(json, key);
    char decoded[1024];
    int used = 0;

    if (!at || *at != '"')
        return FALSE;

    at++;
    while (*at && *at != '"' && used + 1 < (int)sizeof decoded)
    {
        if (*at == '\\')
        {
            at++;
            switch (*at)
            {
            case 'n': decoded[used++] = '\n'; break;
            case 'r': decoded[used++] = '\r'; break;
            case 't': decoded[used++] = '\t'; break;
            case 'b': decoded[used++] = '\b'; break;
            case 'f': decoded[used++] = '\f'; break;
            case 0:   decoded[used] = 0; return FALSE;
            /* No \uXXXX case: Transmission writes non-ASCII as raw UTF-8. Observed on 4.1.1,
               which reported a config_dir ending "Jose-<CJK>" byte for byte, unescaped. */
            default:  decoded[used++] = *at; break;
            }
            at++;
        }
        else
        {
            decoded[used++] = *at++;
        }
    }
    decoded[used] = 0;

    return MultiByteToWideChar(CP_UTF8, 0, decoded, -1, value, valueMax) > 0;
}

BOOL RpcFailed(const char *reply, wchar_t *message, int messageMax)
{
    if (!strstr(reply, "\"error\""))
        return FALSE;

    if (!JsonString(reply, "message", message, messageMax))
        wcscpy_s(message, messageMax, L"the engine rejected the request");

    return TRUE;
}

char *JsonQuote(const wchar_t *text)
{
    char *utf8;
    char *out;
    size_t capacity;
    int bytes;
    int used = 0;
    int i;

    /* Sized from the text rather than into a buffer of its own. A magnet URI carrying a
       display name and a tracker list runs past 2048 UTF-8 bytes routinely, and a fixed
       intermediate that did not fit made WideCharToMultiByte fail, which arrived at the
       engine as an empty filename and was reported to the user as a bad magnet. */
    bytes = WideCharToMultiByte(CP_UTF8, 0, text, -1, NULL, 0, NULL, NULL);
    if (bytes <= 0)
        return NULL;

    /* Six characters is the longest escape and it is written for single bytes only, so the
       escaped form never exceeds six times the UTF-8 form. The text can come from another
       process, so the size is checked rather than assumed. */
    if ((size_t)bytes > (SIZE_MAX - 1) / 6)
        return NULL;

    utf8 = (char *)malloc((size_t)bytes);
    if (!utf8)
        return NULL;

    capacity = (size_t)(bytes - 1) * 6 + 1;
    out = (char *)malloc(capacity);

    if (!out || WideCharToMultiByte(CP_UTF8, 0, text, -1, utf8, bytes, NULL, NULL) == 0)
    {
        free(utf8);
        free(out);
        return NULL;
    }

    for (i = 0; utf8[i]; i++)
    {
        unsigned char c = (unsigned char)utf8[i];
        if (c == '"' || c == '\\')
        {
            out[used++] = '\\';
            out[used++] = (char)c;
        }
        else if (c < 0x20)
        {
            used += sprintf_s(out + used, capacity - (size_t)used, "\\u%04x", c);
        }
        else
        {
            out[used++] = (char)c;
        }
    }
    out[used] = 0;

    free(utf8);
    return out;
}

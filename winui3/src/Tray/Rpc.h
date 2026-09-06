#pragma once
#include <windows.h>

/* The tray speaks Transmission's wire protocol a second time, in C, because sharing
   src/Transmission would mean either a .NET dependency here or the interface calling into
   C for its whole protocol layer. It is a stated exception to the plan's one-owner rule,
   and the price is that these calls must be re-checked by hand whenever the wire changes.
   The surface is deliberately seven methods wide -- session_get, session_stats, session_set,
   session_close, torrent_add, torrent_start, torrent_stop -- so that price stays small. */

/* Opens the one session and connection handle used for the life of the process. Called
   again only when the engine's port changes, never per menu click. */
BOOL RpcOpen(unsigned short port);
void RpcClose(void);

/* Sends one JSON-RPC 2.0 body and copies the reply into 'reply' as NUL-terminated UTF-8.
   Returns the HTTP status, or 0 when the request could not be sent at all.
   Replays once on 409, which is the only way Transmission hands out its session id. */
int RpcSend(const char *json, char *reply, int replyMax);

/* An engine that rejects a call still answers HTTP 200, with a top-level "error" object --
   observed on 4.1.1: an unreadable .torrent path returns
   200 {"error":{"code":4,"message":"unrecognized info"},...}. So status alone does not say
   whether a call worked, and every caller that cares must ask this too. */
BOOL RpcFailed(const char *reply, wchar_t *message, int messageMax);

/* A scanner, not a parser. It finds the first "key" anywhere in the document, so it is only
   safe on replies where the key cannot also appear nested. That holds for every reply the
   tray reads: session_stats nests only cumulative_stats and current_stats, whose members are
   *_bytes, files_added, seconds_active and session_count -- none of the four names below. */
BOOL JsonNumber(const char *json, const char *key, long long *value);
BOOL JsonBool(const char *json, const char *key, BOOL *value);
BOOL JsonString(const char *json, const char *key, wchar_t *value, int valueMax);

/* The text as the body of a JSON string, escaping what JSON requires -- a Windows path is
   nothing but backslashes, so this is not optional. Returns a NUL-terminated UTF-8 string the
   caller frees, or NULL if it could not be made. A magnet URI has no length the code controls,
   so the result is sized from the text rather than truncated into a fixed buffer. */
char *JsonQuote(const wchar_t *text);

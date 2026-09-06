#pragma once
#include <windows.h>

/* transmission-daemon.exe, started beside the tray in its own configuration directory on a
   port the OS chooses. The tray owns it; the interface never starts one. */

typedef enum
{
    EngineStopped,
    EngineStarting,
    EngineReady,
    EngineFailed
} EngineState;

/* Posted to the window given to EngineOpen; wParam is the new EngineState. */
#define EngineStateChanged (WM_APP + 1)
/* Posted when an add finishes; wParam is TRUE on success, lParam is a heap wchar_t*
   describing the outcome, which the window frees. */
#define EngineAddFinished  (WM_APP + 2)

/* Starts the supervising thread, which adopts a running engine or launches one. Returns
   as soon as the thread exists; readiness arrives as EngineStateChanged. */
BOOL EngineOpen(HWND notify);

/* Hands the argument to torrent_add verbatim -- it accepts a local path or a magnet URI, so
   there is nothing to read and nothing to encode. Queued behind the launch if one is running. */
void EngineAdd(const wchar_t *argument);

/* session_close, then waits for the engine to go. Safe to call twice, and bounded so the
   caller cannot hang. */
void EngineStop(void);

/* Ends the supervising thread and leaves the engine running for the next launch to adopt. */
void EngineClose(void);

EngineState Engine(void);
unsigned short EnginePort(void);

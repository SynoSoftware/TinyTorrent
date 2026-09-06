#pragma once
#include <windows.h>

/* Five values under HKCU\Software\Classes make this tray the handler for .torrent files and
   magnet: links. Per-user, so no elevation, and no ActivationRegistrationManager -- that is
   a Windows App SDK API and this is C. */
void RegisterAssociations(void);

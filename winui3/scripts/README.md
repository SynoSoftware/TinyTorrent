# Release candidate staging

From `winui3`, stage an x64 candidate with:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\build.ps1 -Configuration Release -EngineDirectory 'C:\Program Files\Transmission'
```

Use `-Configuration Debug` when the coordinator needs the product UI for a deliberate validation pass. The script discovers 64-bit Visual Studio MSBuild through `vswhere`; pass `-MsBuildPath` when it is installed elsewhere. It requires the recorded Transmission 4.1.1 candidate: `transmission-daemon.exe`, `libcurl.dll`, `libssl-3-x64.dll`, `libcrypto-3-x64.dll`, and `zlib.dll` must have the hashes in `LICENSES\transmission-4.1.1.md`.

The candidate is staged at `artifacts\TinyTorrent\<Configuration>\x64`. Each rebuild first creates a sibling work directory, then replaces the completed candidate only after staging succeeds. `manifest.json` records every staged file's version metadata and SHA-256 hash.

The staged `LICENSES` directory contains the Transmission GPLv3 election, pinned source record, and the upstream license texts for the exact candidate. It also records the unresolved DLL-build provenance: matching version metadata and vcpkg records do not prove a vcpkg baseline or the complete third-party notice bundle.

This is local assembly only. It does not install the .NET or Windows App Runtime prerequisites, package an installer, verify the candidate's acquired MSI, or prove clean-machine behavior.

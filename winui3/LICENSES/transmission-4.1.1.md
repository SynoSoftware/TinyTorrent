# Transmission 4.1.1 candidate record

This record applies only to the local Transmission candidate selected by
`scripts/build.ps1`. The script accepts the candidate only when these files have
the recorded SHA-256 hashes.

| File | File version | SHA-256 |
| --- | --- | --- |
| `transmission-daemon.exe` | `4.1.1 (56442e2929)` | `DD26F9900BB4572446E905B74823B36DE167936726BDFA17B56B9147E4FD35D9` |
| `libcurl.dll` | `8.16.0` | `DDA69C7E2E52ACD2186C39002EE658F07EF2BA7E08E42366D81D1230193AEC15` |
| `libssl-3-x64.dll` | `3.5.4` | `A03DF669BFA03BF69B8F881A31DB2F1F30B277E53316925664BA7451E1F9EBE7` |
| `libcrypto-3-x64.dll` | `3.5.4` | `1776B6519D268097E61C28D745EAFBDBA8F134CDCE0087AD311FB162A9E6E285` |
| `zlib.dll` | `1.3.1` | `CFEF8CE7244757D44B4AE1B2FFEC64A4DB7C59BFA87B7BD966D0CC382B670D86` |

## Transmission terms and corresponding source

TinyTorrent elects GPLv3 for its redistributed copy of Transmission. The
upstream [COPYING](https://raw.githubusercontent.com/transmission/transmission/56442e2929cf4e9e20c8604a229e99fbb352190c/COPYING)
permits GPLv2, GPLv3, or a future Mnemosyne-approved license and expressly
permits OpenSSL linking. The GPLv3 text is included in `GPL-3.0.txt`.

The corresponding Transmission source is pinned to the official 4.1.1 tag
commit [`56442e2929cf4e9e20c8604a229e99fbb352190c`](https://github.com/transmission/transmission/tree/56442e2929cf4e9e20c8604a229e99fbb352190c).
The source archive is
[`56442e2929cf4e9e20c8604a229e99fbb352190c.tar.gz`](https://github.com/transmission/transmission/archive/56442e2929cf4e9e20c8604a229e99fbb352190c.tar.gz).

## DLL records and limit of evidence

The matching official vcpkg version records map these versions to immutable
port trees:

| DLL | vcpkg port version | Port tree |
| --- | --- | --- |
| `libcurl.dll` | `curl` 8.16.0#0 | [`3905962f11b04dbdff1d1c976c7a1e5248048bb2`](https://github.com/microsoft/vcpkg/tree/3905962f11b04dbdff1d1c976c7a1e5248048bb2/ports/curl) |
| `libssl-3-x64.dll`, `libcrypto-3-x64.dll` | `openssl` 3.5.4#0 | [`737382595bac2a92c7f8f54f120b53d2637af521`](https://github.com/microsoft/vcpkg/tree/737382595bac2a92c7f8f54f120b53d2637af521/ports/openssl) |
| `zlib.dll` | `zlib` 1.3.1#0 | [`3f05e04b9aededb96786a911a16193cdb711f0c9`](https://github.com/microsoft/vcpkg/tree/3f05e04b9aededb96786a911a16193cdb711f0c9/ports/zlib) |

Their upstream license texts are included here as
`curl-8.16.0-COPYING.txt`, `openssl-3.5.4-LICENSE.txt`, and
`zlib-1.3.1-LICENSE.txt`. Their official upstream locations are
[curl 8.16.0](https://raw.githubusercontent.com/curl/curl/curl-8_16_0/COPYING),
[OpenSSL 3.5.4](https://raw.githubusercontent.com/openssl/openssl/openssl-3.5.4/LICENSE.txt),
and [zlib 1.3.1](https://raw.githubusercontent.com/madler/zlib/v1.3.1/LICENSE).

Those version resources and the Windows file-version metadata do **not** prove
that these installed DLL bytes were built by vcpkg, or identify a vcpkg
baseline, triplet, features, patches, or complete dependency notice bundle.
The installed directory has no retained package manifest, vcpkg installation,
or verified MSI hash. Before a distribution claim names a vcpkg build, retain
the acquired MSI URL and SHA-256, extraction record, vcpkg baseline, port tree
IDs, triplet/features, and the installed `share/<port>/copyright` notices.

Official records: [curl 8.16.0](https://raw.githubusercontent.com/microsoft/vcpkg/master/versions/c-/curl.json),
[OpenSSL 3.5.4](https://raw.githubusercontent.com/microsoft/vcpkg/master/versions/o-/openssl.json),
and [zlib 1.3.1](https://raw.githubusercontent.com/microsoft/vcpkg/master/versions/z-/zlib.json).

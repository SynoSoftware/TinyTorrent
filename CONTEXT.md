# Context

Glossary for the TinyTorrent desktop product. Terms only: the decisions and their reasons
are in [the desktop architecture](docs/desktop-architecture.md). TableView terms are in
[winui3/CONTEXT.md](winui3/CONTEXT.md).

## Design words

These words have one meaning in every design document here.

**Module**
Anything with an interface and an implementation: a function, a class, a library, or a
whole program.
_Avoid_: component, service, unit.

**Interface**
Everything a caller must know to use a module correctly: its operations, and also its
ordering rules, error modes, and costs.
_Avoid_: API.

**Seam**
The place where a module's interface lives, and where behaviour can change without an edit
to the caller.
_Avoid_: boundary.

**Adapter**
A concrete thing that satisfies an interface at a seam. One adapter does not justify a
seam; two do.

**Deep**
A module is deep when a small interface gives its callers a lot of behaviour. It is shallow
when the interface is nearly as large as the implementation.

## The product

**TinyTorrent** *(also: tt)*
The whole product: the engine and WinUI, built and shipped together. Windows only.

**Engine**
The torrent client that stays in the tray. It is the one program that runs while downloads
may run. It holds libtorrent, the saved state, the tray, the splash window, and the pipe
adapter. It loads neither .NET nor WinUI. Source: `engine/`.
_Avoid_: native process, native application, native host, backend, daemon. Older text,
including the review record, uses the "native" names for the engine.

**WinUI**
The interface program: a separate process that exists only while its window is open. It
owns presentation and unsaved edits, and holds no torrent truth. Source: `winui3/`.
_Avoid_: frontend (that is the web code in `frontend/`).

## Inside the engine

**Command**
A request to change state the engine owns. Each command has one implementation; the tray,
the pipe adapter, and tests all call it. Accepted does not mean completed: the result
arrives as a later observation or a reported failure.

**Observation**
A finished, immutable copy of engine state given to a caller. A summary observation covers
all torrents and is also called a snapshot. A detail observation covers one section of one
torrent, on demand.

**Tray**
The module that owns the notification-area icon and its context menu. It calls commands
in-process and starts or activates WinUI.

**Splash window**
The acrylic window the engine shows while WinUI starts. The engine draws it with low-level
Windows calls and no UI framework. With the tray's context menu, it is all the UI the
engine owns.

## Between the two programs

**Pipe**
The one local named-pipe connection between the two programs. The engine creates the
endpoint; WinUI connects to it.

**Protocol**
The interface the engine presents to WinUI over the pipe: the message layouts and the rules
a caller must follow. It is defined once and checked by both codecs.
_Avoid_: API, RPC (that is the HTTP/JSON interface in `backend/`).

**Pipe adapter**
The module in the engine that satisfies the protocol. It decodes and checks each request
and passes it to a command. It holds no download policy.

## Existing code

**Synapse**
The reusable WinUI control library in `winui3/src/Synapse`, home of TableView. It stays as
it is, and the new WinUI projects reference it.

**Paused Transmission client**
The projects under `winui3/` that drive a Transmission daemon: `Transmission`,
`TinyTorrent.Core`, `TinyTorrent.Ui`, and `Tray`. Paused, not dropped: kept in the
repository, not shipped, and not edited by new work.

**TypeScript version**
The code in `backend/` and `frontend/`: a C++ daemon with an HTTP/JSON server and a WebView
host, and the web interface it serves. Desktop work does not touch it, and none of it is
precedent for the engine.

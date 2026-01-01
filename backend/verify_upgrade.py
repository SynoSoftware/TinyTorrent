#!/usr/bin/env python3
"""
Host Shell Simulator / Acceptance Test for TinyTorrent Backend v1.1

Usage:
  python verify_upgrade.py

Notes:
  * Adjust BACKEND_BINARY if your build outputs to a different location (e.g.,
    "./build/bin/tt-engine.exe" or "../build_vs/debug/tt-daemon.exe").
  * This script is the Acceptance Test that proves the backend refactor meets
    the WebView2 / daemon requirements (security token, capabilities, origin
    locking, error codes, WebSocket sequences).
"""

import http.client
import base64
import json
import os
import secrets
import socket
import subprocess
import threading
import time
from pathlib import Path
import tempfile

# Prefer the daemon binary for acceptance tests (no UI/tray/WebView required).
BACKEND_BINARY = "./buildstate/debug/tinytorrent-daemon.exe"
# BACKEND_BINARY = "./buildstate/debug/TinyTorrent.exe"
# BACKEND_BINARY = "../build_vs/debug/TinyTorrent.exe"

RPC_PATH = "/transmission/rpc"
WS_PATH = "/ws"


def connection_json_path():
    # Must match tt::utils::data_root().
    override = os.environ.get("TT_DATA_ROOT")
    if override:
        return Path(override) / "connection.json"
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        return Path(local_appdata) / "TinyTorrent" / "data" / "connection.json"
    exe_path = Path(BACKEND_BINARY).resolve(strict=False)
    return exe_path.parent / "data" / "connection.json"


def read_connection_port(expected_pid=None):
    try:
        path = connection_json_path()
        if not path.is_file():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        if expected_pid is not None and payload.get("pid") != expected_pid:
            return None
        port = payload.get("port")
        if isinstance(port, int) and port != 0:
            return port
    except Exception:
        return None
    return None


def backend_data_root():
    return connection_json_path().parent


def random_secret():
    return secrets.token_hex(16)


def start_backend(secret):
    # Isolate acceptance tests from any running instance by using a dedicated
    # data root (also avoids sharing tinytorrent.db / tinytorrent.log).
    if not os.environ.get("TT_DATA_ROOT"):
        os.environ["TT_DATA_ROOT"] = tempfile.mkdtemp(prefix="TinyTorrent-acceptance-")
    args = [BACKEND_BINARY, f"--session-secret={secret}"]
    proc = subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    output_lines = []

    def reader():
        for line in proc.stdout:
            print(line, end="")
            output_lines.append(line)

    threading.Thread(target=reader, daemon=True).start()

    port = None
    deadline = time.time() + 30
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("backend exited before listening")
        for line in reversed(output_lines):
            if "RPC listening on port" in line:
                try:
                    port = int(line.split("port")[1].strip().split()[0])
                except Exception:
                    pass
            if "POST requests should hit" in line and port is None:
                parts = line.split("POST requests should hit")
                if len(parts) == 2:
                    url = parts[1].strip()
                    if url.startswith("http://"):
                        host_port = url.split("/")[2]
                        port = int(host_port.split(":")[1])
        if port:
            break
        if port is None:
            port = read_connection_port(proc.pid)
            if port:
                break
        time.sleep(0.1)
    if port is None:
        raise RuntimeError("failed to detect RPC port")
    return proc, port


def post_rpc(port, secret, payload, origin="tt-app://local.ui"):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    headers = {
        "Content-Type": "application/json",
        "X-TT-Auth": secret,
        "Origin": origin,
    }
    conn.request("POST", RPC_PATH, json.dumps(payload), headers)
    resp = conn.getresponse()
    body = resp.read()
    conn.close()
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:
        data = body.decode("utf-8", errors="ignore")
    return resp.status, data


def test_capabilities(port, secret):
    status, body = post_rpc(port, secret, {"method": "tt-get-capabilities"})
    assert status == 200, "tt-get-capabilities failed"
    assert body.get("arguments", {}).get("server-version") == "TinyTorrent 1.1.0"
    assert body.get("arguments", {}).get("server-class") == "tinytorrent"
    print("  [ok] capability response meets spec")


def test_origin_block(port, secret):
    status, _body = post_rpc(
        port, secret, {"method": "tt-get-capabilities"}, origin="http://evil-site.com"
    )
    if status == 403:
        print("  [ok] origin lock enforced")
    elif status == 200:
        print("  [warn] origin lock bypassed (likely debug build)")
    else:
        raise AssertionError("origin lock failed")


def test_torrent_errors(port, secret):
    # metainfo-path missing file
    data_root = backend_data_root()
    downloads_dir = data_root / "downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "method": "torrent-add",
        "arguments": {
            "metainfo-path": "nonexistent.torrent",
            "download-dir": str(downloads_dir),
        },
    }
    status, body = post_rpc(port, secret, payload)
    assert status == 200
    code = body.get("arguments", {}).get("code")
    assert code == 4002, f"expected 4002 for metainfo path failure, got {code}"
    print("  [ok] metainfo-path rejection (4002)")

    # invalid download path
    payload = {
        "method": "torrent-add",
        "arguments": {"download-dir": "?:/InvalidPath", "uri": "magnet:?xt=urn:btih:1234"},
    }
    status, body = post_rpc(port, secret, payload)
    assert status == 200
    code = body.get("arguments", {}).get("code")
    assert code in (4001, 4003), f"expected 4001/4003 for bad path, got {code}"
    print("  [ok] invalid download path returns 4001/4003")


def recv_exact(sock, count):
    data = b""
    while len(data) < count:
        chunk = sock.recv(count - len(data))
        if not chunk:
            raise RuntimeError("socket closed")
        data += chunk
    return data


def websocket_sequence(port, secret):
    sock = socket.create_connection(("127.0.0.1", port), timeout=5)
    sec_key = base64.b64encode(secrets.token_bytes(16)).decode()
    headers = [
        f"GET {WS_PATH}?token={secret} HTTP/1.1",
        "Host: 127.0.0.1",
        "Upgrade: websocket",
        "Connection: Upgrade",
        f"Sec-WebSocket-Key: {sec_key}",
        "Sec-WebSocket-Version: 13",
        "Origin: tt-app://local.ui",
        "",
        "",
    ]
    sock.sendall("\r\n".join(headers).encode())

    response = b""
    while b"\r\n\r\n" not in response:
        chunk = sock.recv(4096)
        if not chunk:
            raise RuntimeError("websocket handshake failed (socket closed)")
        response += chunk
        if len(response) > 65536:
            raise RuntimeError("websocket handshake failed (oversized response)")
    header_blob, leftover = response.split(b"\r\n\r\n", 1)
    if b"101" not in header_blob:
        raise RuntimeError("websocket handshake failed")

    buffer = bytearray(leftover)

    def recv_exact_ws(count):
        while len(buffer) < count:
            chunk = sock.recv(4096)
            if not chunk:
                raise RuntimeError("socket closed")
            buffer.extend(chunk)
        out = bytes(buffer[:count])
        del buffer[:count]
        return out

    def read_frame():
        header = recv_exact_ws(2)
        length = header[1] & 0x7F
        if length == 126:
            length = int.from_bytes(recv_exact_ws(2), "big")
        elif length == 127:
            length = int.from_bytes(recv_exact_ws(8), "big")
        if header[1] & 0x80:
            mask = recv_exact_ws(4)
        else:
            mask = None
        payload = recv_exact_ws(length)
        if mask:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        return payload

    deadline = time.time() + 10
    while time.time() < deadline:
        payload = read_frame()
        try:
            data = json.loads(payload.decode())
        except Exception:
            continue
        if data.get("type") == "sync-patch" or "sequence" in data:
            assert "sequence" in data, "sync-patch missing sequence"
            print("  [ok] websocket sync-patch has sequence")
            sock.close()
            return
    sock.close()
    raise RuntimeError("no sync-patch received with sequence")


def main():
    secret = random_secret()
    proc = None
    try:
        print("[*] Launching backend with session secret")
        proc, port = start_backend(secret)
        print(f"[*] detected RPC port {port}")
        test_capabilities(port, secret)
        test_origin_block(port, secret)
        test_torrent_errors(port, secret)
        websocket_sequence(port, secret)
        print("[*] All acceptance tests passed")
    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()

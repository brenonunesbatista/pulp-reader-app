"""Serve the latest Banca APK to the tablet/phone on the home network (Phase 12).

  python tools/serve_updates.py [--port 8765] [--apk app/android/app/build/outputs/apk/debug]

Build as usual (`npm run build && npx cap sync android && cd android && gradlew assembleDebug`), leave this running,
and enter the address it prints in the app (Settings → Updates → PC address). The app compares versionCodes (every
build gets a higher one, app/android/app/build.gradle), downloads /banca.apk, checks its sha256 and opens Android's
installer. Endpoints: /apk.json (versionCode, versionName, size, sha256, built) and /banca.apk. Read-only, LAN only;
Windows may ask once whether Python may accept connections on private networks.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import socket
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = ROOT / "app" / "android" / "app" / "build" / "outputs" / "apk" / "debug"


def apk_info(folder: Path, _cache: dict = {}) -> tuple[dict, Path] | None:  # noqa: B006 — memo by mtime
    """versionCode/versionName from AGP's output-metadata.json, plus size and sha256 of the APK"""
    meta = folder / "output-metadata.json"
    if not meta.exists():
        return None
    el = json.loads(meta.read_text(encoding="utf-8"))["elements"][0]
    apk = folder / el["outputFile"]
    if not apk.exists():
        return None
    st = apk.stat()
    key = (str(apk), st.st_mtime_ns, st.st_size)
    if _cache.get("key") != key:
        _cache["key"] = key
        _cache["sha"] = hashlib.sha256(apk.read_bytes()).hexdigest()
    return {
        "versionCode": int(el["versionCode"]), "versionName": el.get("versionName", ""), "size": st.st_size,
        "sha256": _cache["sha"], "url": "banca.apk",
        "built": datetime.fromtimestamp(st.st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }, apk


def lan_addresses() -> list[str]:
    out = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # no packet is sent; picks the LAN interface
        out.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(out) or ["<this PC's IP>"]


def handler(folder: Path):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            info = apk_info(folder)
            if info is None:
                return self.send_error(404, "no APK built yet")
            meta, apk = info
            if self.path.split("?")[0] == "/apk.json":
                body = json.dumps(meta).encode()
                ctype = "application/json"
            elif self.path.split("?")[0] == "/banca.apk":
                body = apk.read_bytes()
                ctype = "application/vnd.android.package-archive"
            else:
                return self.send_error(404)
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            print(f"{self.address_string()} {fmt % args}")

    return H


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--apk", type=Path, default=DEFAULT_DIR, help="folder with the APK and output-metadata.json")
    a = ap.parse_args(argv)
    info = apk_info(a.apk)
    print(f"Serving {a.apk}" + (f" — versionCode {info[0]['versionCode']} ({info[0]['versionName']})" if info else
                                " — no APK there yet (build one; it is picked up without restarting)"))
    for ip in lan_addresses():
        print(f"In the app: Settings → Updates → PC address = {ip}:{a.port}")
    try:
        ThreadingHTTPServer(("0.0.0.0", a.port), handler(a.apk)).serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())

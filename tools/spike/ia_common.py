"""Shared helpers for the Internet Archive spike scripts (polite, throttled HTTP)."""
import json
import time
from pathlib import Path

import requests

USER_AGENT = "PulpReader/0.1 (personal-use reader spike; contact: github.com/brenonunesbatista/pulp-reader-app)"
OUT = Path("tools/spike/out")
MIN_INTERVAL_S = 1.0

_session = requests.Session()
_session.headers["User-Agent"] = USER_AGENT
_last = 0.0


def get(url: str, **kw) -> requests.Response:
    """Throttled GET (>= MIN_INTERVAL_S between requests). Records wall time in resp.elapsed_total."""
    global _last
    wait = MIN_INTERVAL_S - (time.monotonic() - _last)
    if wait > 0:
        time.sleep(wait)
    t0 = time.monotonic()
    resp = _session.get(url, timeout=60, **kw)
    _ = resp.content  # force full download for timing
    resp.elapsed_total = time.monotonic() - t0  # type: ignore[attr-defined]
    _last = time.monotonic()
    return resp


def save_json(name: str, data) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    p.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    return p

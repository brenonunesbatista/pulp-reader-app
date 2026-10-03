"""Polite Internet Archive access for catalog builds: descriptive User-Agent, >= 1 s between requests, retry on 429/5xx."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

USER_AGENT = "Banca/0.8 (personal-use magazine reader; catalog build; github.com/brenonunesbatista/pulp-reader-app)"
MIN_INTERVAL_S = 1.0
_last = 0.0


class Response:
    def __init__(self, body: bytes):
        self.content = body

    def json(self):
        return json.loads(self.content)


def get(url: str, attempts: int = 4) -> Response:
    global _last
    for i in range(attempts):
        wait = MIN_INTERVAL_S - (time.monotonic() - _last)
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            _last = time.monotonic()
            return Response(body)
        except urllib.error.HTTPError as e:
            _last = time.monotonic()
            if e.code not in (429, 500, 502, 503, 504) or i == attempts - 1:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 2 ** (i + 1)))
    raise RuntimeError("unreachable")

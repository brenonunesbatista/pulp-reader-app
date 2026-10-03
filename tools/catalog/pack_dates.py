"""Cover dates for the issues of a pack item (one IA item holding many issues; Dragon, Dungeon), Phase 8b.

The sub-book file names only carry issue numbers. Dates are read from the first 40 KB of an issue's OCR text
(`<stem>_djvu.txt`, one ranged request) for anchor issues — the first, every 10th, the last — and the issues between two
anchors are filled month by month when the gap matches (numbers apart = months apart). Otherwise the gap is bisected
(the middle issue is read) until it is consistent, so irregular stretches (bimonthly years, skipped months) end up
read issue by issue. Every date records how it was found (`ocr` or `interpolated`).

Output: tools/sources/ia/<ident>.dates.json (committed) {number: [year, month, how]} plus specials by stem.
"""
from __future__ import annotations

import re
import time
import urllib.request
from collections import Counter
from pathlib import Path
from urllib.parse import quote

from .ia import USER_AGENT

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]
DATE = re.compile(r"\b(" + "|".join(MONTHS) + r"|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?[\s,/]+"
                  r"(?:\d{1,2},?\s+)?(19[7-9]\d|20[01]\d)\b", re.I)
_last = 0.0


CACHE = Path(__file__).resolve().parents[1] / "spike" / "out" / "ocr_heads"  # git-ignored, avoids re-reading


def ocr_head(ident: str, stem: str, nbytes: int = 40000) -> str:
    """the first `nbytes` of an issue's OCR text (one ranged request, cached on disk)"""
    global _last
    cached = CACHE / (re.sub(r"[^A-Za-z0-9._-]+", "_", f"{ident}__{stem}") + f"_{nbytes}.txt")
    if cached.exists():
        return cached.read_text(encoding="utf-8")
    wait = 1.0 - (time.monotonic() - _last)
    if wait > 0:
        time.sleep(wait)
    url = f"https://archive.org/download/{quote(ident)}/{quote(stem + '_djvu.txt')}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Range": f"bytes=0-{nbytes - 1}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode("utf-8", "replace")
    finally:
        _last = time.monotonic()
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_text(text, encoding="utf-8")
    return text


def dates_in(text: str) -> Counter:
    c: Counter = Counter()
    for m in DATE.finditer(text):
        c[(int(m[2]), [x[:3] for x in MONTHS].index(m[1][:3].lower()) + 1)] += 1
    return c


def mi(ym: tuple[int, int]) -> int:
    return ym[0] * 12 + ym[1] - 1


def ym(i: int) -> tuple[int, int]:
    return i // 12, i % 12 + 1


def pick(c: Counter, lo: tuple[int, int] | None, hi: tuple[int, int] | None) -> tuple[int, int] | None:
    """the most frequent date inside [lo, hi] (dates of other issues — ads, letters — are mentioned too)"""
    for d, _ in c.most_common():
        if (lo is None or mi(d) >= mi(lo)) and (hi is None or mi(d) <= mi(hi)):
            return d
    return None


def date_issues(ident: str, stems: dict[int, str], lo: tuple[int, int], hi: tuple[int, int],
                log=print) -> dict[int, tuple[int, int, str]]:
    """stems: issue number → sub-book stem; lo/hi: the run's possible date range. The first and last issues must be
    readable (they bound the interpolation)."""
    nums = sorted(stems)
    out: dict[int, tuple[int, int, str]] = {}

    texts: dict[int, Counter] = {}

    def read(n: int, lo, hi) -> tuple[int, int] | None:
        """date of issue n inside [lo, hi]: first 40 KB of its OCR text, then 400 KB if no date was found"""
        d = None
        for size in (40000, 400000):
            try:
                texts[n] = dates_in(ocr_head(ident, stems[n], size))
            except Exception as e:  # noqa: BLE001 - a missing OCR file leaves the issue to interpolation
                log(f"  #{n}: {e}")
                return None
            d = pick(texts[n], lo, hi)
            if d:
                break
        log(f"  #{n}: {d}")
        if d:
            out[n] = (*d, "ocr")
        return d

    first = read(nums[0], lo, hi)
    last = read(nums[-1], lo, hi)
    if not first or not last:
        raise RuntimeError("the first and last issues need a readable date")
    prev = first
    for n in [n for n in nums if n % 10 == 0 and nums[0] < n < nums[-1]]:
        d = read(n, prev, last)  # dates only move forward
        if d:
            prev = d

    def fill(a: int, b: int) -> None:
        """a, b: dated issue numbers, nothing dated in between"""
        between = [n for n in nums if a < n < b]
        if not between:
            return
        da, db = out[a][:2], out[b][:2]
        if mi(db) - mi(da) == b - a:  # monthly: number step = month step
            for n in between:
                out[n] = (*ym(mi(da) + n - a), "interpolated")
            return
        mid = between[len(between) // 2]
        if read(mid, da, db) is None:
            # unreadable: place it proportionally between its neighbours and go on
            out[mid] = (*ym(mi(da) + round((mi(db) - mi(da)) * (mid - a) / (b - a))), "interpolated")
        fill(a, mid)
        fill(mid, b)

    dated = sorted(out)
    for a, b in zip(dated, dated[1:]):
        fill(a, b)
    # anchors that could not be read were skipped above: fill around them too
    dated = sorted(out)
    for a, b in zip(dated, dated[1:]):
        fill(a, b)
    # a date read out of order (a letter or an ad quoting another month) is re-picked between its neighbours from the
    # text already read; if nothing fits it is placed between them
    for _ in range(3):
        changed = False
        for i, n in enumerate(nums):
            if out[n][2] != "ocr":
                continue
            lo_n = out[nums[i - 1]][:2] if i else lo
            hi_n = out[nums[i + 1]][:2] if i + 1 < len(nums) else hi
            if mi(lo_n) <= mi(out[n][:2]) <= mi(hi_n):
                continue
            d = pick(texts.get(n, Counter()), lo_n, hi_n)
            out[n] = (*d, "ocr") if d else (*ym((mi(lo_n) + mi(hi_n)) // 2), "interpolated")
            log(f"  #{n}: out of order, now {out[n]}")
            changed = True
        if not changed:
            break
    return dict(sorted(out.items()))

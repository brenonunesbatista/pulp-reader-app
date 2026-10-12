"""Years for issues dated by year only (comics, small RPG magazines): known years by issue number — from the file
name or `year_anchors` in sources.toml — and linear interpolation between the nearest known numbers."""
from __future__ import annotations


def interpolate_years(numbers: list[int], known: dict[int, tuple[int, str]]) -> dict[int, tuple[int, str]]:
    """number → (year, how): how = the known source ('name', 'anchor', 'metadata') or 'interpolated'"""
    ks = sorted(known)
    out: dict[int, tuple[int, str]] = {}
    for n in numbers:
        if n in known:
            out[n] = known[n]
            continue
        lo = max((k for k in ks if k < n), default=None)
        hi = min((k for k in ks if k > n), default=None)
        if lo is None and hi is None:
            continue
        if lo is None or hi is None:
            out[n] = (known[lo if hi is None else hi][0], "interpolated")
        else:
            ylo, yhi = known[lo][0], known[hi][0]
            out[n] = (round(ylo + (yhi - ylo) * (n - lo) / (hi - lo)), "interpolated")
    return out

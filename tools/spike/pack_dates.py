"""Phase 8b: read the cover date of pack sub-books (Dragon, Dungeon) from the first bytes of their OCR text.

One ranged request per issue (default 40 KB of `<stem>_djvu.txt`), 1 s apart, descriptive User-Agent.
Usage (repo root): python tools/spike/pack_dates.py <ident> <stem> [<stem> ...]
Prints the most frequent "Month YYYY" in the text (and the runners-up).
"""
import re
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from catalog.ia import USER_AGENT  # noqa: E402

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]
DATE = re.compile(r"\b(" + "|".join(MONTHS) + r"|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?[\s,/]+(?:\d{1,2},?\s+)?(19[7-9]\d|20[01]\d)\b", re.I)


def head(ident: str, stem: str, nbytes: int = 40000) -> str:
    url = f"https://archive.org/download/{quote(ident)}/{quote(stem + '_djvu.txt')}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Range": f"bytes=0-{nbytes - 1}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def dates(text: str) -> Counter:
    c: Counter = Counter()
    for m in DATE.finditer(text):
        mon = [x[:3] for x in MONTHS].index(m[1][:3].lower()) + 1
        c[(int(m[2]), mon)] += 1
    return c


if __name__ == "__main__":
    ident = sys.argv[1]
    for stem in sys.argv[2:]:
        try:
            c = dates(head(ident, stem))
            print(f"{stem[:40]:40} {c.most_common(4)}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"{stem[:40]:40} ERROR {e}", flush=True)
        time.sleep(1.0)

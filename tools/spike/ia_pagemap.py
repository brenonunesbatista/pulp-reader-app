"""Spike: build a leaf -> printed page map for an item and compare it with the guide's `page/nXX` links.

Sources: scandata.xml (pageNumber / addToAccessFormats per leaf) and OCR (a bare integer near the top or
bottom edge of the page, i.e. the running header/footer page number).

Usage: python tools/spike/ia_pagemap.py <identifier>
Needs out/<id>_djvu.xml (ia_ocr.py) and out/guide_links.json (guide_links.py).
"""
import json
import re
import sys

from ia_common import OUT, get
from ia_ocr import parse


def scandata(ident: str) -> dict:
    p = OUT / f"{ident}_scandata.xml"
    if not p.exists():
        p.write_text(get(f"https://archive.org/download/{ident}/{ident}_scandata.xml").text, encoding="utf-8")
    t = p.read_text(encoding="utf-8")
    leaves = re.findall(r'<page leafNum="(\d+)"(.*?)</page>', t, re.S)
    excluded = [int(n) for n, body in leaves if "<addToAccessFormats>false" in body]
    numbered = {int(n): re.search(r"<pageNumber>(\w+)</pageNumber>", body).group(1)
                for n, body in leaves if "<pageNumber>" in body}
    return {"leaves": len(leaves), "excluded": excluded, "pageNumber_tags": len(numbered)}


def printed_numbers(pages: list[dict]) -> dict[int, int]:
    """leaf -> printed page number read from OCR header/footer (None if not found)."""
    out = {}
    for leaf, p in enumerate(pages):
        cands = [w for w in p["words"] if re.fullmatch(r"\d{1,3}", w["t"]) and (w["b"][1] < 0.07 or w["b"][3] > 0.93)]
        if cands:
            out[leaf] = int(cands[0]["t"])
    return out


def main() -> None:
    ident = sys.argv[1]
    sd = scandata(ident)
    print(f"scandata: leaves={sd['leaves']} excluded_from_access={sd['excluded']} pageNumber_tags={sd['pageNumber_tags']}")
    pages = parse((OUT / f"{ident}_djvu.xml").read_bytes())
    nums = printed_numbers(pages)
    offsets = [leaf - num for leaf, num in nums.items()]
    hist: dict[int, int] = {}
    for o in offsets:
        hist[o] = hist.get(o, 0) + 1
    top = sorted(hist.items(), key=lambda kv: -kv[1])[:5]
    print(f"OCR page numbers found on {len(nums)}/{len(pages)} leaves; (leaf - printed) histogram top: {top}")
    links = json.loads((OUT / "guide_links.json").read_text(encoding="utf-8"))
    for lk in (x for x in links if x["id"] == ident and x["leaf"] is not None and ")" in x["text"][:6]):
        m = re.match(r"(\d+)\)", lk["text"])
        if not m:
            continue
        printed = int(m.group(1))
        actual = [leaf for leaf, n in nums.items() if n == printed]
        print(f"  guide p.{printed:<4} -> n{lk['leaf']:<4} (guide rule printed+1)   OCR says p.{printed} is at leaf "
              f"{actual or '?'}   OCR printed@n{lk['leaf']} = {nums.get(lk['leaf'], '?')}")


if __name__ == "__main__":
    main()

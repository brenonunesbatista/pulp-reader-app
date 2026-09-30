"""Spike: download + parse IA `_djvu.xml` OCR, normalize word boxes, check leaf mapping vs the guide.

Usage: python tools/spike/ia_ocr.py <identifier>
Needs tools/spike/out/iiif_manifest_<id>.json (ia_pages.py) and guide_links.json (guide_links.py).

DjVu XML: one <OBJECT width height> per page; <WORD coords="left,bottom,right,top[,baseline]">.
Coordinates are pixels of that OBJECT's width/height (origin top-left, y grows down).
Normalized box = (left/W, top/H, right/W, bottom/H).
"""
import gzip
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

from ia_common import OUT, get, save_json


def fetch_xml(ident: str) -> bytes:
    p = OUT / f"{ident}_djvu.xml"
    if not p.exists():
        r = get(f"https://archive.org/download/{ident}/{ident}_djvu.xml", headers={"Origin": "https://localhost"})
        print(f"djvu.xml status={r.status_code} bytes={len(r.content)} acao={r.headers.get('Access-Control-Allow-Origin')}"
              f" secs={r.elapsed_total:.1f}")  # type: ignore[attr-defined]
        p.write_bytes(r.content)
    return p.read_bytes()


def parse(xml: bytes) -> list[dict]:
    root = ET.fromstring(xml)
    pages = []
    for obj in root.iter("OBJECT"):
        w, h = int(obj.get("width")), int(obj.get("height"))
        name = next((p.get("value") for p in obj.iter("PARAM") if p.get("name") == "PAGE"), None)
        words = []
        for line_no, line in enumerate(obj.iter("LINE")):
            for word in line.iter("WORD"):
                c = [int(v) for v in (word.get("coords") or "").split(",")[:4]]
                if len(c) < 4 or not (word.text or "").strip():
                    continue
                left, bottom, right, top = c
                words.append({"t": word.text.strip(), "l": line_no,
                              "b": [round(left / w, 4), round(top / h, 4), round(right / w, 4), round(bottom / h, 4)]})
        pages.append({"file": name, "w": w, "h": h, "words": words})
    return pages


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", s)


def main() -> None:
    ident = sys.argv[1]
    pages = parse(fetch_xml(ident))
    manifest = json.loads((OUT / f"iiif_manifest_{ident}.json").read_text(encoding="utf-8"))
    canv = [(c["width"], c["height"]) for c in manifest["items"]]
    print(f"djvu pages={len(pages)} iiif canvases={len(canv)}")
    mism = [(i, (p["w"], p["h"]), canv[i]) for i, p in enumerate(pages[: len(canv)]) if (p["w"], p["h"]) != canv[i]]
    print(f"dimension mismatches djvu vs canvas (first 5): {len(mism)} {mism[:5]}")
    nwords = [len(p["words"]) for p in pages]
    print(f"words/page avg={sum(nwords)/len(nwords):.0f} max={max(nwords)} empty_pages={nwords.count(0)}")

    # compact per-page JSON as the app would store it: size raw + gzipped
    compact = [json.dumps({"w": p["w"], "h": p["h"], "words": [[x["t"], *x["b"], x["l"]] for x in p["words"]]},
                          separators=(",", ":")).encode() for p in pages]
    raw, gz = sum(map(len, compact)), sum(len(gzip.compress(c)) for c in compact)
    print(f"compact OCR json: total={raw/1e3:.0f} kB gz={gz/1e3:.0f} kB per page avg={raw/len(pages)/1e3:.1f} kB "
          f"(gz {gz/len(pages)/1e3:.1f} kB)")
    save_json(f"ocr_sample_{ident}.json", {"leaf5": pages[5] if len(pages) > 5 else None})

    # leaf mapping: title of each guide story link should appear on page[leaf] (or neighbours)
    links = json.loads((OUT / "guide_links.json").read_text(encoding="utf-8"))
    checks = []
    for lk in (x for x in links if x["id"] == ident and x["leaf"] is not None):
        title = re.sub(r"^\d+\)\s*", "", lk["text"]).split("[")[0]
        key = [w for w in norm(title).split() if len(w) > 3][:3]
        if not key:
            continue
        hits = {}
        for off in range(-2, 3):
            i = lk["leaf"] + off
            if 0 <= i < len(pages):
                text = norm(" ".join(w["t"] for w in pages[i]["words"]))
                hits[off] = sum(k in text for k in key)
        best = max(hits, key=lambda o: (hits[o], -abs(o)))
        checks.append({"leaf": lk["leaf"], "title": title.strip(), "key": key, "hits": hits, "best_offset": best})
    for c in checks:
        print(f"  leaf n{c['leaf']:<4} best_offset={c['best_offset']:+d} hits={c['hits']}  {c['title'][:50]}")
    save_json(f"leafcheck_{ident}.json", checks)


if __name__ == "__main__":
    main()

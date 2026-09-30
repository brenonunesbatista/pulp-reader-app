"""Spike: list archive.org identifiers (and story leaf links) found in the reference guide PDF.

Usage: python tools/spike/guide_links.py data/source/Amazing_Stories_Reference_Guide.pdf [--grep 1940]
Writes tools/spike/out/guide_links.json.
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

ID_RE = re.compile(r"archive\.org/details/([^/?#]+)(?:/page/n(\d+))?")


def main() -> None:
    pdf = Path(sys.argv[1])
    grep = sys.argv[sys.argv.index("--grep") + 1] if "--grep" in sys.argv else None
    doc = pymupdf.open(pdf)
    rows = []
    for pno, page in enumerate(doc):
        for link in page.get_links():
            uri = link.get("uri") or ""
            m = ID_RE.search(uri)
            if not m and "hathitrust" not in uri:
                continue
            text = page.get_textbox(link["from"]).strip().replace("\n", " ")
            rows.append({"pdf_page": pno + 1, "uri": uri, "id": m.group(1) if m else None,
                         "leaf": int(m.group(2)) if m and m.group(2) else None, "text": text})
    out = Path("tools/spike/out")
    out.mkdir(parents=True, exist_ok=True)
    (out / "guide_links.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
    ids = sorted({r["id"] for r in rows if r["id"]})
    print(f"pages={len(doc)} links={len(rows)} distinct_ids={len(ids)}")
    for i in ids:
        if grep is None or grep in i:
            print(i)


if __name__ == "__main__":
    main()

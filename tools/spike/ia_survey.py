"""Survey candidate sources on the Internet Archive (read-only, throttled): what a link gives access to.

For a collection or search query: item count, sample items, date range, and — for a few sample items — whether they
are openly downloadable and have what reader B needs (a *_jp2.zip page set + *_djvu.xml OCR).
For a single item: its files (how many "books"/PDFs it bundles) and the same checks.

Usage: python tools/spike/ia_survey.py
Writes tools/spike/out/survey.json and prints a summary.
"""
import json
import sys
from urllib.parse import quote

from ia_common import get, save_json

SOURCES = [
    ("collection", "fantasyandsciencefiction"),
    ("collection", "bolsilibros_seleccion_terror"),
    ("collection", "fameandfortuneweekly"),
    ("collection", "fantasticsfstories"),
    ("collection", "twilightzonemagazine"),
    ("collection", "asimovmagazine"),
    ("collection", "galaxymagazine"),
    ("query", 'subject:"Dungeon magazine"'),
    ("item", "dungeon-magazine"),
    ("item", "DragonMagazine260_201801"),
    ("collection", "space-gamer"),
    ("query", 'subject:"Dungeons and Dragons (Game)"'),
    ("item", "Livro-de-Regras-DnD-5e"),
]
SAMPLES = 3


def search(q: str, rows: int = 50) -> dict:
    url = ("https://archive.org/advancedsearch.php?q=" + quote(q) +
           "&fl[]=identifier&fl[]=title&fl[]=date&fl[]=mediatype&fl[]=collection&sort[]=date+asc"
           f"&rows={rows}&page=1&output=json")
    return get(url).json()["response"]


def item_summary(ident: str) -> dict:
    m = get(f"https://archive.org/metadata/{ident}").json()
    md = m.get("metadata", {})
    files = m.get("files", [])
    names = [f["name"] for f in files]
    fmt = lambda suffix: [n for n in names if n.lower().endswith(suffix)]  # noqa: E731
    return {
        "id": ident, "title": md.get("title"), "mediatype": md.get("mediatype"), "date": md.get("date"),
        "restricted": md.get("access-restricted-item"), "collection": md.get("collection"),
        "imagecount": md.get("imagecount"), "pdfs": len(fmt(".pdf")), "jp2zips": len(fmt("_jp2.zip")),
        "djvu_xml": len(fmt("_djvu.xml")), "hocr": len(fmt("_hocr.html")), "cbr_cbz": len(fmt(".cbr") + fmt(".cbz")),
        "files": len(files), "pdf_names": fmt(".pdf")[:6],
    }


def main() -> None:
    out = []
    for kind, ref in SOURCES:
        entry: dict = {"kind": kind, "ref": ref}
        try:
            if kind == "item":
                entry["item"] = item_summary(ref)
            else:
                q = f"collection:{ref}" if kind == "collection" else ref
                r = search(q)
                docs = r["docs"]
                entry["count"] = r["numFound"]
                entry["mediatypes"] = sorted({d.get("mediatype", "?") for d in docs})
                dates = sorted(str(d.get("date", ""))[:10] for d in docs if d.get("date"))
                entry["first_dates"] = dates[:2]
                entry["sample_ids"] = [d["identifier"] for d in docs[:6]]
                # the last page of results for the latest dates
                if r["numFound"] > 50:
                    tail = get("https://archive.org/advancedsearch.php?q=" + quote(q) +
                               "&fl[]=date&sort[]=date+desc&rows=1&output=json").json()["response"]["docs"]
                    entry["last_date"] = str(tail[0].get("date", ""))[:10] if tail else None
                else:
                    entry["last_date"] = dates[-1] if dates else None
                entry["samples"] = [item_summary(d["identifier"]) for d in docs[:SAMPLES]
                                    if d.get("mediatype") != "collection"]
        except Exception as e:  # noqa: BLE001 - survey: record and continue
            entry["error"] = repr(e)
        out.append(entry)
        print(json.dumps(entry, ensure_ascii=False)[:900], file=sys.stdout, flush=True)
    save_json("survey.json", out)


if __name__ == "__main__":
    main()

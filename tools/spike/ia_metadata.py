"""Spike: fetch IA metadata for an item and summarize files relevant to the reader.

Usage: python tools/spike/ia_metadata.py <identifier> [...]
Saves raw metadata to tools/spike/out/meta_<id>.json and prints a summary.
"""
import sys

from ia_common import get, save_json

INTERESTING = ("_jp2.zip", "_jp2.tar", ".pdf", "_djvu.xml", "_hocr.html", "_chocr.html.gz",
               "_hocr_pageindex.json.gz", "_hocr_searchtext.txt.gz", "_page_numbers.json",
               "_scandata.xml", "_djvu.txt", "_text.pdf")


def summarize(ident: str) -> dict:
    r = get(f"https://archive.org/metadata/{ident}")
    meta = r.json()
    save_json(f"meta_{ident}.json", meta)
    md = meta.get("metadata", {})
    files = meta.get("files", [])
    picked = [{"name": f["name"], "format": f.get("format"), "size": int(f.get("size", 0) or 0)}
              for f in files if f["name"].endswith(INTERESTING)]
    summary = {
        "id": ident,
        "server": meta.get("server"), "d1": meta.get("d1"), "dir": meta.get("dir"),
        "imagecount": md.get("imagecount"), "ppi": md.get("ppi"),
        "access_restricted": md.get("access-restricted-item"), "collection": md.get("collection"),
        "is_dark": meta.get("is_dark"), "files_total": len(files), "files": picked,
    }
    return summary


def main() -> None:
    for ident in sys.argv[1:]:
        s = summarize(ident)
        save_json(f"summary_{ident}.json", s)
        print(f"\n== {ident}  imagecount={s['imagecount']} ppi={s['ppi']} restricted={s['access_restricted']} "
              f"collection={s['collection']} server={s['server']} dir={s['dir']}")
        for f in s["files"]:
            print(f"  {f['size']/1e6:9.2f} MB  {f['format']!s:32} {f['name']}")


if __name__ == "__main__":
    main()

"""Spike: check CORS (Access-Control-Allow-Origin) for every IA URL the app would fetch with JS.

Usage: python tools/spike/ia_cors.py <identifier>
Note: <img src> does not need CORS; fetch()/XHR (OCR JSON, PDF for PDF.js, image blobs for caching) does.
"""
import json
import sys

from ia_common import OUT, get


def main() -> None:
    ident = sys.argv[1]
    meta = json.loads((OUT / f"meta_{ident}.json").read_text(encoding="utf-8"))
    server, d = meta["server"], meta["dir"]
    urls = {
        "metadata API": f"https://archive.org/metadata/{ident}",
        "iiif manifest": f"https://iiif.archive.org/iiif/3/{ident}/manifest.json",
        "djvu.xml via /download": f"https://archive.org/download/{ident}/{ident}_djvu.xml",
        "djvu.xml direct server": f"https://{server}{d}/{ident}_djvu.xml",
        "scandata via /download": f"https://archive.org/download/{ident}/{ident}_scandata.xml",
        "pdf via /download (range 0-1023)": f"https://archive.org/download/{ident}/{ident}.pdf",
        "BookReader page image": f"https://archive.org/download/{ident}/page/n5.jpg",
    }
    for name, url in urls.items():
        headers = {"Origin": "https://localhost"}
        if "range" in name:
            headers["Range"] = "bytes=0-1023"
        r = get(url, headers=headers)
        print(f"{name:34} status={r.status_code} acao={r.headers.get('Access-Control-Allow-Origin')!s:6} "
              f"accept-ranges={r.headers.get('Accept-Ranges')} final={r.url[:90]}")


if __name__ == "__main__":
    main()

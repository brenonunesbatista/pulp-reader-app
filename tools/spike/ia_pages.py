"""Spike: probe per-page image endpoints on IA and measure latency/bytes/CORS.

Usage: python tools/spike/ia_pages.py <identifier> [--leaves 0,5,10,...]
Requires tools/spike/out/meta_<id>.json (run ia_metadata.py first).
Saves tools/spike/out/iiif_manifest_<id>.json and tools/spike/out/pages_<id>.json.

Page list comes from the IIIF manifest (canvas index == 0-based leaf), so we never guess jp2 file names.
"""
import json
import statistics
import sys
from urllib.parse import unquote

from ia_common import OUT, get, save_json


def load_canvases(ident: str) -> list[dict]:
    r = get(f"https://iiif.archive.org/iiif/3/{ident}/manifest.json")
    m = r.json()
    save_json(f"iiif_manifest_{ident}.json", m)
    out = []
    for c in m["items"]:
        body = c["items"][0]["items"][0]["body"]
        out.append({"label": c.get("label"), "w": c["width"], "h": c["height"], "svc": body["service"][0]["id"]})
    print(f"manifest: status={r.status_code} bytes={len(r.content)} acao={r.headers.get('Access-Control-Allow-Origin')}"
          f" canvases={len(out)}")
    return out


def urls(ident: str, meta: dict, canvas: dict, leaf: int) -> dict[str, str]:
    # service id = https://iiif.archive.org/image/iiif/3/<id>%2F<zip>%2F<jp2 path>
    inner = unquote(canvas["svc"].rsplit("/", 1)[1])  # "<id>/<zip>/<dir>/<file>.jp2"
    _, zipname, jp2 = inner.split("/", 2)
    return {
        "iiif": canvas["svc"] + "/full/{w},/0/default.jpg",
        "iiif_max": canvas["svc"] + "/full/max/0/default.jpg",
        "bookreader": (f"https://{meta['server']}/BookReader/BookReaderImages.php?zip={meta['dir']}/{zipname}"
                       f"&file={jp2}&id={ident}&scale={{scale}}&rotate=0"),
        # convenience redirect used by the archive.org reader; '_w' suffix turned out to be ignored
        "download_page": f"https://archive.org/download/{ident}/page/n{leaf}.jpg",
    }


def probe(url: str) -> dict:
    try:
        r = get(url, headers={"Origin": "https://localhost"}, allow_redirects=True)
    except Exception as e:  # noqa: BLE001 - spike: record any failure
        return {"url": url, "error": repr(e)}
    return {
        "url": url, "final_url": r.url, "status": r.status_code, "bytes": len(r.content),
        "ctype": r.headers.get("Content-Type"), "secs": round(r.elapsed_total, 3),  # type: ignore[attr-defined]
        "acao": r.headers.get("Access-Control-Allow-Origin"),
        "cache_control": r.headers.get("Cache-Control"), "redirects": [h.status_code for h in r.history],
    }


def main() -> None:
    ident = sys.argv[1]
    meta = json.loads((OUT / f"meta_{ident}.json").read_text(encoding="utf-8"))
    canvases = load_canvases(ident)
    n = len(canvases)
    leaves = [int(x) for x in sys.argv[sys.argv.index("--leaves") + 1].split(",")] if "--leaves" in sys.argv \
        else sorted({0, 5, n // 8, n // 4, n // 3, n // 2, 2 * n // 3, n - 5})
    dims = [(c["w"], c["h"]) for c in canvases]
    print(f"native size: w {min(d[0] for d in dims)}..{max(d[0] for d in dims)}, "
          f"h {min(d[1] for d in dims)}..{max(d[1] for d in dims)}")
    results: list[dict] = []

    variants = [("iiif", 400), ("iiif", 800), ("iiif_max", None), ("bookreader", 1), ("bookreader", 2),
                ("download_page", None)]
    for name, param in variants:
        sizes, secs, acao, statuses = [], [], set(), []
        sample = leaves if name != "download_page" else leaves[:3]
        for leaf in sample:
            u = urls(ident, meta, canvases[leaf], leaf)[name]
            u = u.format(w=param) if name == "iiif" else u.format(scale=param) if name == "bookreader" else u
            res = probe(u) | {"endpoint": name, "param": param, "leaf": leaf}
            results.append(res)
            statuses.append(res.get("status"))
            acao.add(res.get("acao"))
            if res.get("status") == 200:
                sizes.append(res["bytes"])
                secs.append(res["secs"])
        line = f"{name:13} {param!s:5} ok={len(sizes)}/{len(sample)} acao={acao}"
        if sizes:
            line += (f" avg={statistics.mean(sizes)/1e3:.1f} kB min={min(sizes)/1e3:.1f} max={max(sizes)/1e3:.1f}"
                     f" latency avg={statistics.mean(secs):.2f}s median={statistics.median(secs):.2f}s")
        else:
            line += f" statuses={statuses}"
        print(line)
    save_json(f"pages_{ident}.json", results)


if __name__ == "__main__":
    main()

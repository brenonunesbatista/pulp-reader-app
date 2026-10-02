"""Suggest an image (free licence only) and external ids for Atlas entities, from the Wikipedia article each entity
cites as its first source. Output is a review list (JSON); nothing is written into the content files.

Usage: python tools/atlas/suggest_media.py --out media.json [--width 640]

Batched (≤ 50 titles per request, so about four requests in total), throttled, descriptive User-Agent:
- en.wikipedia `pageimages` + `pageprops` → lead image file and Wikidata id
- commons (then en.wikipedia) `imageinfo` + `extmetadata` → thumbnail URL, licence, author, description page
- Wikidata `wbgetentities` → IMDb id (P345), Spotify album id (P2205)
Images whose licence is not public domain / CC0 / CC BY / CC BY-SA, or that are not on Commons, are reported with
`free: false` (posters on English Wikipedia are usually non-free "fair use").
"""
from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from validate import ROOT, parse

UA = "BancaAtlas/0.1 (personal-use content pipeline; github.com/brenonunesbatista/pulp-reader-app)"
FREE = re.compile(r"^(public domain|pd|cc0|cc[- ]by(-sa)?( \d\.\d)?)", re.I)


def get(url: str, params: dict) -> dict:
    q = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2", "maxlag": 5})
    for attempt in range(5):
        req = urllib.request.Request(f"{url}?{q}", headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            time.sleep(1.0)
            return data
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 10) + 1)
    raise RuntimeError("unreachable")


def strip(s: str | None) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def clean_url(u: str | None) -> str | None:
    return u.split("?", 1)[0] if u else u


def chunks(xs: list, n: int = 50):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--width", type=int, default=640)
    a = ap.parse_args()

    articles: dict[str, str] = {}  # entity id → article title
    for p in sorted((ROOT / "content" / "atlas" / "entities").glob("*.md")):
        m = parse(p).meta
        wiki = next((s["url"] for s in m.get("sources", []) if "en.wikipedia.org/wiki/" in s["url"]), None)
        if m["type"] != "theme" and wiki:
            articles[p.stem] = urllib.parse.unquote(wiki.rsplit("/wiki/", 1)[1]).replace("_", " ")

    # 1. lead image + wikidata id per article
    pages: dict[str, dict] = {}
    for batch in chunks(sorted(set(articles.values()))):
        q = get("https://en.wikipedia.org/w/api.php", {"action": "query", "titles": "|".join(batch), "redirects": 1,
                                                       "prop": "pageimages|pageprops", "piprop": "name", "pilimit": 50})["query"]
        alias = {n["from"]: n["to"] for n in q.get("normalized", []) + q.get("redirects", [])}
        by_title = {pg["title"]: pg for pg in q["pages"]}
        for t in batch:
            pages[t] = by_title.get(alias.get(alias.get(t, t), alias.get(t, t)), {})

    # 2. image info: Commons first, then English Wikipedia (non-free files live there)
    files = sorted({pg["pageimage"] for pg in pages.values() if pg.get("pageimage")})
    info: dict[str, dict] = {}
    for api, on_commons in (("https://commons.wikimedia.org/w/api.php", True), ("https://en.wikipedia.org/w/api.php", False)):
        todo = [f for f in files if f not in info]
        for batch in chunks(todo):
            q = get(api, {"action": "query", "titles": "|".join(f"File:{f}" for f in batch), "prop": "imageinfo",
                          "iiprop": "url|extmetadata", "iiurlwidth": a.width})["query"]
            norm = {n["to"]: n["from"] for n in q.get("normalized", [])}
            for pg in q["pages"]:
                ii = (pg.get("imageinfo") or [None])[0]
                if not ii or (on_commons and pg.get("missing")):
                    continue
                meta = ii.get("extmetadata", {})
                lic = strip(meta.get("LicenseShortName", {}).get("value"))
                name = norm.get(pg["title"], pg["title"]).removeprefix("File:").replace(" ", "_")
                info[name] = {
                    "file": name, "url": clean_url(ii.get("thumburl") or ii.get("url")), "source": ii.get("descriptionurl"),
                    "license": lic, "credit": strip(meta.get("Artist", {}).get("value")) or strip(meta.get("Credit", {}).get("value")),
                    "free": bool(FREE.match(lic)) and on_commons,
                }

    # 3. external ids from Wikidata
    qids = sorted({pg.get("pageprops", {}).get("wikibase_item") for pg in pages.values()} - {None})
    claims: dict[str, dict] = {}
    for batch in chunks(qids):
        ents = get("https://www.wikidata.org/w/api.php", {"action": "wbgetentities", "ids": "|".join(batch), "props": "claims"})["entities"]
        claims.update({k: v.get("claims", {}) for k, v in ents.items()})

    result = {}
    for eid, title in articles.items():
        pg = pages.get(title, {})
        qid = pg.get("pageprops", {}).get("wikibase_item")
        r: dict = {"article": title, "wikidata": qid}
        img = pg.get("pageimage")
        if img:
            r["image"] = info.get(img.replace(" ", "_")) or {"file": img, "error": "no imageinfo"}
        for prop, key in (("P345", "imdb"), ("P2205", "spotify_album")):
            vals = [c["mainsnak"].get("datavalue", {}).get("value") for c in claims.get(qid, {}).get(prop, [])]
            if vals and vals[0]:
                r[key] = vals[0]
        result[eid] = r
        im = r.get("image") or {}
        print(f"{eid:40} {('FREE ' if im.get('free') else 'non-free ' if im else 'no image')}{im.get('license', '')}  "
              f"{r.get('imdb', '')} {r.get('spotify_album', '')}")
    a.out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()

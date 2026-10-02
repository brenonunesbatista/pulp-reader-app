"""Build atlas.db from content/atlas (reviewed entities and paths only). Reproducible: same content → same bytes.

Usage: python tools/atlas/build_atlas.py [--out app/public/atlas/atlas.db]
Runs the validator first and refuses to build when it reports errors.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sqlite3
import sys
from pathlib import Path

try:  # as a package (tests) or as a script
    from .validate import ROOT, parse, validate
except ImportError:
    from validate import ROOT, parse, validate



def why_text(body: str) -> str | None:
    m = re.search(r"^## Why it matters\s*\n(.+?)(?:\n## |\Z)", body, re.S | re.M)
    return " ".join(m.group(1).split()) if m else None


def year(d) -> int | None:
    return int(str(d)[:4]) if d else None


def build(content: Path, out: Path, catalog_db: Path | None) -> dict:
    report = validate(content, catalog_db)
    if report.errors:
        raise SystemExit("Atlas content has errors:\n  " + "\n  ".join(report.errors))

    docs = {p.stem: parse(p) for p in sorted((content / "entities").glob("*.md"))}
    keep = {i for i, d in docs.items() if d.meta["status"] == "reviewed"}

    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    con = sqlite3.connect(tmp)
    con.executescript((Path(__file__).parent / "schema.sql").read_text(encoding="utf-8"))

    digest = hashlib.sha256()
    n_links = 0
    for i in sorted(keep):
        d, m = docs[i], docs[i].meta
        digest.update((d.path.read_text(encoding="utf-8").replace("\r\n", "\n")).encode())
        img, ext = m.get("image") or {}, m.get("external") or {}
        body = d.body.strip()
        con.execute(
            "INSERT INTO entity VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (i, m["type"], m["title"], m["subtitle"], m.get("lane"), m.get("date"), m.get("end"), year(m.get("date")),
             year(m.get("end")), body, why_text(body), img.get("url"), img.get("credit"), img.get("license"),
             img.get("source"), img.get("catalog_cover"), ext.get("imdb"), ext.get("spotify_album")))
        con.execute("INSERT INTO entity_fts VALUES (?,?,?,?)", (i, m["title"], m["subtitle"], body))
        for t in m.get("themes", []):
            if t in keep:
                con.execute("INSERT INTO entity_theme VALUES (?,?)", (i, t))
        for l in m.get("links", []):
            if l["to"] not in keep:
                continue
            con.execute("INSERT INTO link VALUES (?,?,?,0,?)", (i, l["rel"], l["to"], l.get("note")))
            con.execute("INSERT INTO link VALUES (?,?,?,1,NULL)", (l["to"], l["rel"], i))
            n_links += 1
        for k, c in enumerate(m.get("catalog", [])):
            y, mo = c["issue"].split("-")
            con.execute("INSERT INTO catalog_ref VALUES (?,?,?,?,?,?)", (i, c["magazine"], int(y), int(mo), c.get("story"), k))
        for s in m.get("sources", []):
            con.execute("INSERT INTO source VALUES (?,?,?,?)", (i, s["n"], s["title"], s["url"]))

    n_paths = 0
    for p in sorted((content / "paths").glob("*.md")):
        d = parse(p)
        if d.meta.get("status") != "reviewed":
            continue
        digest.update((p.read_text(encoding="utf-8").replace("\r\n", "\n")).encode())
        con.execute("INSERT INTO path VALUES (?,?,?,?)", (d.meta["id"], d.meta["title"], d.meta.get("subtitle", ""), d.body.strip()))
        pos = 0
        for s in d.meta["stops"]:
            if s["entity"] in keep:
                con.execute("INSERT INTO path_stop VALUES (?,?,?,?)", (d.meta["id"], pos, s["entity"], s["why"]))
                pos += 1
        n_paths += 1

    stats = {"entities": len(keep), "links": n_links, "paths": n_paths, "drafts_skipped": len(docs) - len(keep)}
    con.executemany("INSERT INTO atlas_meta VALUES (?,?)", [
        ("schema_version", "1"), ("content_sha256", digest.hexdigest()), *[(k, str(v)) for k, v in stats.items()]])
    con.commit()
    con.execute("VACUUM")
    con.close()
    tmp.replace(out)
    return stats


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--content", type=Path, default=ROOT / "content" / "atlas")
    ap.add_argument("--out", type=Path, default=ROOT / "app" / "public" / "atlas" / "atlas.db")
    ap.add_argument("--catalog", type=Path, default=ROOT / "app" / "public" / "catalog" / "catalog.db")
    a = ap.parse_args()
    stats = build(a.content, a.out, a.catalog)
    print(f"atlas.db: {stats['entities']} entities, {stats['links']} links, {stats['paths']} paths"
          + (f", {stats['drafts_skipped']} drafts skipped" if stats["drafts_skipped"] else "") + f" -> {a.out}")


if __name__ == "__main__":
    sys.exit(main())

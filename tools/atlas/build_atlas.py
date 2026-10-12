"""Build atlas.db from content/atlas (reviewed entities and paths only) and content/magazines (reviewed
descriptions). Reproducible: same content and commit → same bytes.

Usage: python tools/atlas/build_atlas.py [--out app/public/atlas/atlas.db] [--draft-about]
Runs the validator first and refuses to build when it reports errors.

atlas_meta `content_version` orders content updates (tools/publish_content.py): the commit time of the last change
under content/ (Unix seconds), so an APK and a published update built from the same commit carry the same version.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

try:  # as a package (tests) or as a script
    from .validate import ROOT, parse, validate
except ImportError:
    from validate import ROOT, parse, validate

sys.path.insert(0, str(ROOT / "tools"))
import magazines  # noqa: E402

SCHEMA_VERSION = 2  # the app checks it before installing a downloaded atlas.db (src/updates/content.ts)


def content_version(root: Path = ROOT) -> int:
    """commit time of the last change under content/ (0 outside git)"""
    try:
        r = subprocess.run(["git", "log", "-1", "--format=%ct", "--", "content"], cwd=root, capture_output=True,
                           text=True, check=True)
        return int(r.stdout.strip() or 0)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return 0


def why_text(body: str) -> str | None:
    m = re.search(r"^## Why it matters\s*\n(.+?)(?:\n## |\Z)", body, re.S | re.M)
    return " ".join(m.group(1).split()) if m else None


def year(d) -> int | None:
    return int(str(d)[:4]) if d else None


def build(content: Path, out: Path, catalog_db: Path | None, *, magazines_dir: Path = magazines.CONTENT,
          draft_about: bool = False, version: int | None = None) -> dict:
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

    n_about = 0
    for slug, (meta, body) in magazines.load(magazines_dir).items():
        if meta.get("status") == "reviewed" or draft_about:
            digest.update(magazines.about_json(meta, body).encode())
            con.execute("INSERT INTO magazine_about VALUES (?,?)", (slug, magazines.about_json(meta, body)))
            n_about += 1

    stats = {"entities": len(keep), "links": n_links, "paths": n_paths, "drafts_skipped": len(docs) - len(keep),
             "magazines": n_about, "content_version": content_version() if version is None else version}
    con.executemany("INSERT INTO atlas_meta VALUES (?,?)", [
        ("schema_version", str(SCHEMA_VERSION)), ("content_sha256", digest.hexdigest()),
        *[(k, str(v)) for k, v in stats.items()]])
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
    ap.add_argument("--draft-about", action="store_true", help="also include draft magazine descriptions (preview)")
    a = ap.parse_args()
    stats = build(a.content, a.out, a.catalog, draft_about=a.draft_about)
    print(f"atlas.db: {stats['entities']} entities, {stats['links']} links, {stats['paths']} paths, "
          f"{stats['magazines']} magazine descriptions"
          + (f", {stats['drafts_skipped']} drafts skipped" if stats["drafts_skipped"] else "")
          + f", version {stats['content_version']} -> {a.out}")


if __name__ == "__main__":
    sys.exit(main())

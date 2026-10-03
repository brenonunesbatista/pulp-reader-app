"""Build the app catalog (catalog.db + cover thumbnails) from the magazines listed in tools/sources.toml.

Usage:
  python tools/build_catalog.py --out app/public/catalog
      [--sources tools/sources.toml] [--source <Amazing Stories guide PDF>] [--only slug,slug] [--refresh]
      [--report docs/catalog-report.md] [--sources-report docs/catalog-sources.md]

--refresh re-reads the Internet Archive collection listings into tools/sources/ia/*.json (one search request per 1000
items); without it the committed snapshots are used and the build needs no network.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from catalog import covers, db, report, sources_report  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, required=True, help="catalog output dir (catalog.db + covers/)")
    ap.add_argument("--sources", type=Path, default=ROOT / "sources.toml")
    ap.add_argument("--source", type=Path, help="reference PDF for the amazing_stories adapter (overrides sources.toml)")
    ap.add_argument("--only", help="comma-separated magazine slugs (default: all)")
    ap.add_argument("--refresh", action="store_true", help="re-read IA collection listings")
    ap.add_argument("--report", type=Path, default=Path("docs/catalog-report.md"))
    ap.add_argument("--sources-report", type=Path, default=Path("docs/catalog-sources.md"))
    args = ap.parse_args(argv)

    conf = tomllib.loads(args.sources.read_text(encoding="utf-8"))
    only = set(args.only.split(",")) if args.only else None
    mags = [m for m in conf["magazine"] if not only or m["slug"] in only]
    parts: list[db.Part] = []
    meta: dict[str, str] = {}
    images: dict[str, bytes] = {}
    guide = None
    collections = []
    for m in mags:
        if m["adapter"] == "amazing_stories":
            src = args.source or (ROOT.parent / m["source"])
            cat = importlib.import_module("adapters.amazing_stories").parse(src)
            sha = hashlib.sha256(src.read_bytes()).hexdigest()
            guide = (cat, sha)
            images |= {i.slug: i.cover_image for i in cat.issues if i.cover_image}
            parts.append(db.Part(cat, m["category"]))
            meta[f"source:{m['slug']}"] = f"{src.name} sha256 {sha}"
        elif m["adapter"] == "ia_collection":
            ia = importlib.import_module("adapters.ia_collection")
            snap = ROOT / "sources" / "ia" / f"{m['collection']}.json"
            if args.refresh or not snap.exists():
                snap.parent.mkdir(parents=True, exist_ok=True)
                snap.write_text(json.dumps(ia.fetch(m["collection"]), indent=0, ensure_ascii=False) + "\n",
                                encoding="utf-8", newline="\n")
            cat, alternates, skipped = ia.parse(m, snap)
            parts.append(db.Part(cat, m["category"], alternates))
            collections.append((m, cat, alternates, skipped))
            meta[f"source:{m['slug']}"] = f"{cat.source} sha256 {hashlib.sha256(snap.read_bytes()).hexdigest()}"
        else:
            raise SystemExit(f"unknown adapter {m['adapter']!r} for {m['slug']}")
    names = [p.cat.magazine_name for p in parts]
    meta["source"] = names[0] if len(names) == 1 else f"{len(names)} magazines: " + ", ".join(names)

    args.out.mkdir(parents=True, exist_ok=True)
    cover_paths = covers.write_covers(images, args.out / "covers")
    counts = db.write(parts, conf["category"], args.out / "catalog.db", cover_paths, meta)
    if guide:
        cat, sha = guide
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report.render(cat, db.name_registry(cat), {
            "issues": len(cat.issues), "stories": sum(len(i.stories) for i in cat.issues),
            "people": len(db.name_registry(cat).keys())}, len(cover_paths), sha) + "\n", encoding="utf-8", newline="\n")
    if collections:
        args.sources_report.parent.mkdir(parents=True, exist_ok=True)
        args.sources_report.write_text(sources_report.render(collections) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(parts)} magazines, {counts['issues']} issues, {counts['stories']} stories, {counts['people']} people, "
          f"{len(cover_paths)} covers -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

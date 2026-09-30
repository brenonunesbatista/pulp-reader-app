"""Build the app catalog (catalog.db + cover thumbnails) from a magazine reference source.

Usage:
  python tools/build_catalog.py --source data/source/Amazing_Stories_Reference_Guide.pdf --out app/public/catalog
      [--adapter amazing_stories] [--report docs/catalog-report.md]
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from catalog import covers, db, report  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True, help="catalog output dir (catalog.db + covers/)")
    ap.add_argument("--adapter", default="amazing_stories", help="module in tools/adapters/")
    ap.add_argument("--report", type=Path, default=Path("docs/catalog-report.md"))
    args = ap.parse_args(argv)

    adapter = importlib.import_module(f"adapters.{args.adapter}")
    sha = hashlib.sha256(args.source.read_bytes()).hexdigest()
    cat = adapter.parse(args.source)

    args.out.mkdir(parents=True, exist_ok=True)
    cover_paths = covers.write_covers({i.slug: i.cover_image for i in cat.issues if i.cover_image}, args.out / "covers")
    counts = db.write(cat, args.out / "catalog.db", cover_paths, sha)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(report.render(cat, db.name_registry(cat), counts, len(cover_paths), sha) + "\n",
                           encoding="utf-8", newline="\n")
    print(f"{counts['issues']} issues, {counts['stories']} stories, {counts['people']} people, "
          f"{len(cover_paths)} covers, {len(cat.problems)} problems -> {args.out}, report {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

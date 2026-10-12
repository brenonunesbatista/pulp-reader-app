"""Publish a content update (Atlas + magazine descriptions) for the app to download — no new APK needed (Phase 12).

  python tools/publish_content.py            build updates/atlas.db + updates/manifest.json
  python tools/publish_content.py --push     ... then commit and push them (the app reads them from GitHub)

The app fetches https://raw.githubusercontent.com/brenonunesbatista/pulp-reader-app/main/updates/manifest.json,
installs `atlas.db` when its `version` is newer than the installed one and its `schema` is the one the app reads,
after checking size and sha256 (app/src/updates/content.ts). The version is the commit time of the last change
under content/, so commit the content first: the build refuses uncommitted content changes (--allow-dirty skips
the check, e.g. to test). Only reviewed entities, paths and descriptions are published (--draft-about adds draft
descriptions). The catalog is never published (it derives from a "not for distribution" guide).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from atlas.build_atlas import SCHEMA_VERSION, build  # noqa: E402

OUT = ROOT / "updates"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def publish(out: Path = OUT, draft_about: bool = False, version: int | None = None) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    db = out / "atlas.db"
    catalog = ROOT / "app" / "public" / "catalog" / "catalog.db"
    stats = build(ROOT / "content" / "atlas", db, catalog if catalog.exists() else None, draft_about=draft_about,
                  version=version)
    data = db.read_bytes()
    manifest = {
        "format": 1,
        "atlas": {
            "version": stats["content_version"], "schema": SCHEMA_VERSION, "url": "atlas.db", "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "entities": stats["entities"], "paths": stats["paths"],
            "magazines": stats["magazines"],
            "published": datetime.fromtimestamp(stats["content_version"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    return manifest


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--push", action="store_true", help="commit updates/ and push")
    ap.add_argument("--allow-dirty", action="store_true", help="publish even with uncommitted changes under content/")
    ap.add_argument("--draft-about", action="store_true", help="also publish draft magazine descriptions")
    a = ap.parse_args(argv)
    dirty = git("status", "--porcelain", "--", "content").strip()
    if dirty and not a.allow_dirty:
        print("Uncommitted changes under content/ — commit them first (the version is their commit time):\n" + dirty)
        return 1
    m = publish(draft_about=a.draft_about)["atlas"]
    print(f"updates/atlas.db: version {m['version']} ({m['published']}), {m['entities']} entities, {m['paths']} paths, "
          f"{m['magazines']} descriptions, {m['size'] / 1024:.0f} KB")
    if not git("status", "--porcelain", "--", "updates").strip():
        print("Nothing new to publish (the same content is already in updates/).")
        return 0
    if a.push:
        git("add", "updates")
        git("commit", "-m", f"Content update {m['published']} ({m['entities']} Atlas entries, {m['magazines']} descriptions)")
        git("push")
        print("Pushed: the app picks it up at its next check (Settings → Check for updates).")
    else:
        print("Run again with --push to commit and publish it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

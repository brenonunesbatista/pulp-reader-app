"""Cover thumbnails: ~300 px wide WebP in app/public/catalog/covers/<slug>.webp (deterministic output)."""
from __future__ import annotations

import io
from pathlib import Path

from PIL import Image

WIDTH = 300


def write_covers(images: dict[str, bytes], out_dir: Path) -> dict[str, str]:
    """images: slug → source image bytes. Returns slug → path relative to the catalog dir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.webp"):
        if old.stem not in images:
            old.unlink()
    paths = {}
    for slug, data in sorted(images.items()):
        img = Image.open(io.BytesIO(data)).convert("RGB")
        if img.width > WIDTH:
            img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.Resampling.LANCZOS)
        img.save(out_dir / f"{slug}.webp", "WEBP", quality=80, method=6)
        paths[slug] = f"covers/{slug}.webp"
    return paths

"""Generate the Banca app icon and splash source images (docs/design/banca-newsprint.md).

Outputs app/assets/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png, the inputs expected by
`npx @capacitor/assets generate --android`.

Usage: python tools/brand/make_icons.py   (needs pillow, fonttools, brotli; the font comes from app/node_modules)
"""
from io import BytesIO
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONT_WOFF2 = ROOT / "app/node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff2"
OUT = ROOT / "app/assets"

RED, RED_NIGHT = (200, 50, 31), (14, 18, 34)
YELLOW, BLUE, INK = (242, 183, 5), (31, 78, 140), (42, 33, 24)


def font(size: int) -> ImageFont.FreeTypeFont:
    f = TTFont(str(FONT_WOFF2))
    f.flavor = None  # woff2 → plain sfnt that FreeType can read
    buf = BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


def halftone(img: Image.Image, base: tuple[int, int, int], step: int, radius: float, alpha: int) -> None:
    """Ben-Day dots: light dots over the base colour, like the masthead."""
    draw = ImageDraw.Draw(img, "RGBA")
    draw.rectangle((0, 0, img.width, img.height), fill=base)
    for y in range(0, img.height + step, step):
        for x in range(0, img.width + step, step):
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(255, 240, 200, alpha))


def text_center(draw: ImageDraw.ImageDraw, size: tuple[int, int], text: str, fnt, shadow: int, dy: int = 0) -> None:
    l, t, r, b = draw.textbbox((0, 0), text, font=fnt)
    x = (size[0] - (r - l)) / 2 - l
    y = (size[1] - (b - t)) / 2 - t + dy
    draw.text((x + shadow, y + shadow), text, font=fnt, fill=BLUE)  # misregistered blue shadow
    draw.text((x, y), text, font=fnt, fill=YELLOW)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    s = 1024
    # adaptive icon background: red + halftone
    bg = Image.new("RGB", (s, s))
    halftone(bg, RED, step=36, radius=6.5, alpha=42)
    bg.save(OUT / "icon-background.png")
    # adaptive icon foreground: the "B" inside the 66 % safe zone, transparent around it
    fg = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    text_center(ImageDraw.Draw(fg), (s, s), "B", font(560), shadow=26, dy=-10)
    fg.save(OUT / "icon-foreground.png")
    # legacy square icon: background + foreground + ink frame
    only = bg.convert("RGBA")
    only.alpha_composite(fg)
    ImageDraw.Draw(only).rectangle((0, 0, s - 1, s - 1), outline=INK, width=36)
    only.convert("RGB").save(OUT / "icon-only.png")
    # splash (2732²): wordmark centred on red halftone; dark variant on night ink
    for name, base in (("splash.png", RED), ("splash-dark.png", RED_NIGHT)):
        sp = Image.new("RGB", (2732, 2732))
        halftone(sp, base, step=48, radius=8, alpha=30)
        text_center(ImageDraw.Draw(sp), sp.size, "BANCA", font(420), shadow=22)
        sp.save(OUT / name)
    print("wrote", ", ".join(p.name for p in sorted(OUT.glob("*.png"))))


if __name__ == "__main__":
    main()

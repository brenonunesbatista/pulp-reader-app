"""Builds a small synthetic PDF that mimics the reference guide's layout (the real guide is 'not for distribution',
so it cannot be a committed fixture). Positions, colors, fonts and link annotations follow the real file."""
from __future__ import annotations

import io
from pathlib import Path

import pymupdf
from PIL import Image

RED, NAVY, GREEN, DKGREEN, BLACK, BLUE = (1, 0, 0), (0, 0, 0.5), (0, 0.5, 0), (0, 0.34, 0), (0, 0, 0), (0, 0, 1)
IA = "https://archive.org/details/"


class _Writer:
    def __init__(self, doc: pymupdf.Document) -> None:
        self.doc = doc
        self.page = doc.new_page(width=595, height=842)
        self.y = 60.0
        self.pno = 1
        self._footer()

    def _footer(self) -> None:
        self.page.insert_text((535, 27), f"Page {self.pno}", fontname="hebo", fontsize=9, color=NAVY)

    def new_page(self) -> None:
        self.page = self.doc.new_page(width=595, height=842)
        self.pno += 1
        self.y = 50.0
        self._footer()

    def text(self, x: float, s: str, *, size: float = 9, color=BLACK, bold: bool = True, uri: str | None = None,
             y: float | None = None) -> float:
        font = "hebo" if bold else "helv"
        yy = self.y if y is None else y
        self.page.insert_text((x, yy), s, fontname=font, fontsize=size, color=color)
        w = pymupdf.get_text_length(s, fontname=font, fontsize=size)
        if uri:
            self.page.insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(x, yy - size + 1, x + w, yy + 1),
                                   "uri": uri})
        return x + w

    def heading(self, date: str, cover_by: str | None, uri: str | None = None, cover: bool = True) -> None:
        self.y += 20
        x = self.text(140, f"Amazing Stories {date} ", size=14, color=RED, uri=uri)
        if cover_by:
            self.text(x + 12, f"cover by {cover_by}", size=14, color=NAVY)
        if cover:
            img = Image.new("RGB", (400, 554), (200, 60, 40))
            buf = io.BytesIO()
            img.save(buf, "PNG")
            self.page.insert_image(pymupdf.Rect(12, self.y - 5, 125, self.y + 143), stream=buf.getvalue())
        self.y += 14

    def line(self, s: str, x: float = 140, **kw) -> None:
        self.text(x, s, **kw)
        self.y += 11

    def entry(self, title: str, rest: str | None, leaf_uri: str | None, *, wrap: bool = False) -> None:
        color = GREEN if leaf_uri else BLACK
        x = self.text(140, title, color=color, uri=leaf_uri)
        if rest is None:
            self.y += 11
            return
        if wrap:
            self.y += 11
            self.text(150, " · " + rest, color=BLUE, bold=False)
        else:
            self.text(x + 5, " · " + rest, color=BLUE, bold=False)
        self.y += 11

    def market(self) -> None:
        self.line("   Heritage Auction sales", size=12, color=DKGREEN)
        self.line("        CGC FN 6.0 Off-white pages  * Apr 6, 2025  * Sold For:  $4,080.00 ")
        self.line("        Average VG+  * Dec 2, 2020  * Sold For:  $312.00 ")
        self.line("   ABE Listings", size=12, color=DKGREEN)
        self.line("       Seller: Some Books,  Cnd: Good,  $25.00")
        self.line("   Contents include:", size=12)


def build(path: Path) -> Path:
    doc = pymupdf.open()
    w = _Writer(doc)
    # front matter that must not be mistaken for a section end
    w.line("TABLE OF CONTENTS", size=16)

    # 1) regular IA issue
    id1 = "AmazingStoriesVolume01Number01"
    w.heading("1926 Apr", "Frank R. Paul")
    w.line("   Read issue at Internet Archives", color=GREEN, uri=IA + id1)
    w.market()
    w.entry("3) A New Sort of Magazine", "Hugo Gernsback · ed", f"{IA}{id1}/page/n4/mode/2up")
    w.entry("4) Off on a Comet or Hector Servadac [Part  1 of 2]", "Jules Verne; translated by Ellen E. Frewer · n.",
            f"{IA}{id1}/page/n5/mode/2up", wrap=True)
    w.entry("62) The Man from the Atom [Kirby]", "G. Peyton Wertenbaker · ss", f"{IA}{id1}/page/n63/mode/2up")
    w.entry("99) Thank You!", "H.G. Wells · ss", f"{IA}{id1}/page/n-1/mode/2up")
    w.entry("726) A Story of the Stone Age", "H. G. Wells · gp (r)", f"{IA}{id1}/page/n70/mode/2up")
    w.entry("_727) Chapter I. Ugh-Lomi and Uya", "H. G. Wells · ss", f"{IA}{id1}/page/n71/mode/2up")
    w.entry("651) The First Martian", "Eando Binder (by Earl Binder & Otto O. Binder) · nv",
            f"{IA}{id1}/page/n80/mode/2up")
    w.entry("187) Discussions", "The Readers · lc", f"{IA}{id1}/page/n90/mode/2up")
    w.entry("190) I Remember Lemuria", "Richard S. Shaver (with Raymond A. Palmer) · na", f"{IA}{id1}/page/n93/mode/2up")
    w.entry("bc.) The Earth's Core", "[uncredited] · cv", f"{IA}{id1}/page/n99/mode/2up")

    # 2) issue without any IA link, no "cover by"; last entry wraps across the page break
    w.heading("1932 Nov", None)
    w.market()
    w.entry("677) The Rotating Earth", "T. O'Conor Sloane, Ph.D. · ed", None)
    w.entry("680) Clement's Tale", "Clement Fezandié · ss", None)
    w.entry("678) The Doom of Lun-Dhag", None, None)
    w.new_page()
    w.line(" · William Lemkin, Ph.D. · na", x=150, color=BLUE, bold=False)

    # 3) index section ends the issue list; headings after it are ignored
    w.y += 30
    w.line("COVER ARTIST INDEX", size=16, color=NAVY)
    w.heading("1999 Jan", "Nobody")
    doc.save(path)
    return path

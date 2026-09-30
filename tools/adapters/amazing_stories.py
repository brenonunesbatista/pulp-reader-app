"""Adapter for 'Amazing Stories Reference Guide' (Tak Kurosaki, ReportLab PDF).

Layout (per issue, all in the right column at x≈140 pt; see docs/catalog-report.md):
    Amazing Stories 1926 Apr   cover by Frank R. Paul        ← red 14 pt + navy 14 pt; cover thumbnail to the left
       Read issue at Internet Archives                      ← link annotation → archive.org/details/<id>
       Heritage Auction sales / ABE Listings ...            ← ignored in v1
       Contents include:
    62) The Man from the Atom [Kirby]  · G. Peyton Wertenbaker · ss      ← title linked to …/<id>/page/n63
    4) Off on a Comet—or Hector Servadac [Part 1 of 2]
       · Jules Verne; translated by Ellen E. Frewer · n.                 ← wrapped continuation at x≈150

The PDF content stream is not in reading order, so every page is rebuilt as rows sorted by position,
and links are matched to text by rectangle intersection (never by text).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

from catalog.item_types import ITEM_TYPES, PAGE_TOKENS
from catalog.model import Catalog, Credit, Issue, ParseIssue, Story
from catalog.names import is_placeholder

MAGAZINE = "Amazing Stories"
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
               "November", "December"]

RED = 0xFF0000
HEADING_RE = re.compile(r"^Amazing Stories (\d{4}) ([A-Z][a-z]{2})\b")
COVER_RE = re.compile(r"^cover by\s+(.*)$")
ENTRY_RE = re.compile(r"^(?P<page>_?\d+|_|bc\.?|fc\.?|ifc\.?|ibc\.?|\?)\)\s*(?P<rest>.*)$")
IA_DETAILS_RE = re.compile(r"archive\.org/details/([^/?#]+)(?:/page/n(-?\d+))?")
SEP_RE = re.compile(r"\s+·\s+|^·\s+|\s+·$")
PART_RE = re.compile(r"^Part\s+(\d+)\s+of\s+(\d+)$", re.I)
ENTRY_X = 145  # entries start at x≈140
CONT_X = (145, 165)  # wrapped continuation lines start at x≈150
# section headings after the issue list (≥14 pt, uppercase, e.g. "COVER ARTIST INDEX") end the issue section
FRONT_MATTER = {"TABLE OF CONTENTS", "ISSUE CONTENTS"}


@dataclass
class Span:
    text: str
    rect: pymupdf.Rect
    color: int
    size: float


@dataclass
class Row:
    page: int
    y: float
    x: float
    spans: list[Span] = field(default_factory=list)
    uris: list[tuple[pymupdf.Rect, str]] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "".join(s.text for s in self.spans)

    def uri(self, contains: str, first_span_only: bool = False) -> str | None:
        """First link URI (containing `contains`) whose rect intersects this row (or just its first span)."""
        targets = [self.spans[0].rect] if first_span_only else [s.rect for s in self.spans]
        for rect, uri in self.uris:
            if contains in uri and any(_overlap(rect, t) for t in targets):
                return uri
        return None


def _overlap(a: pymupdf.Rect, b: pymupdf.Rect) -> bool:
    """Link rects are a few points shorter/shifted vs text rects; require vertical centre inside + x overlap."""
    cy = (b.y0 + b.y1) / 2
    return a.x0 < b.x1 and b.x0 < a.x1 and a.y0 - 3 <= cy <= a.y1 + 3


def page_rows(page: pymupdf.Page) -> list[Row]:
    spans: list[Span] = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            for s in line["spans"]:
                if s["text"]:
                    spans.append(Span(s["text"], pymupdf.Rect(s["bbox"]), s["color"], s["size"]))
    # some pages draw every string twice (same text, same position) — keep one
    seen: set[tuple[str, int, int]] = set()
    unique: list[Span] = []
    for s in spans:
        k = (s.text, round(s.rect.x0), round(s.rect.y0))
        if k not in seen:
            seen.add(k)
            unique.append(s)
    spans = unique
    spans.sort(key=lambda s: ((s.rect.y0 + s.rect.y1) / 2, s.rect.x0))
    rows: list[Row] = []
    for s in spans:
        cy = (s.rect.y0 + s.rect.y1) / 2
        if rows and abs(rows[-1].y - cy) < 3:
            rows[-1].spans.append(s)
        else:
            rows.append(Row(page.number + 1, cy, s.rect.x0, [s]))
    links = [(pymupdf.Rect(lk["from"]), lk.get("uri") or "") for lk in page.get_links()]
    links = [(r, u) for r, u in links if u]
    for r in rows:
        r.spans.sort(key=lambda s: s.rect.x0)
        r.x = r.spans[0].rect.x0
        r.uris = links
    return rows


def _is_section_heading(row: Row) -> bool:
    s = row.spans[0]
    t = row.text.strip()
    return s.size >= 14 and s.color != RED and t.isupper() and t not in FRONT_MATTER


def _volume_number(ident: str) -> tuple[int | None, int | None]:
    for pat in (r"Volume(\d+)Number(\d+)", r"[Vv](\d+)[Nn][Oo]?(\d+)", r"v-?(\d+)n-?(\d+)"):
        m = re.search(pat, ident)
        if m:
            return int(m.group(1)), int(m.group(2))
    return None, None


class _Parser:
    def __init__(self, doc: pymupdf.Document) -> None:
        self.doc = doc
        self.issues: list[Issue] = []
        self.problems: list[ParseIssue] = []
        self.issue: Issue | None = None
        self.entry: list[Row] = []
        self.group_title: str | None = None
        self.slugs: set[str] = set()
        self.in_market = False

    # ---- driver -------------------------------------------------------------------------------------------
    def run(self) -> None:
        for page in self.doc:
            rows = page_rows(page)
            images = [(pymupdf.Rect(i["bbox"]), i["xref"]) for i in page.get_image_info(xrefs=True) if i.get("xref")]
            for row in rows:
                if _is_section_heading(row):
                    self._flush_entry()
                    return
                self._row(row, images)
        self._flush_entry()

    def _row(self, row: Row, images) -> None:
        text = row.text.strip()
        if not text or re.fullmatch(r"Page \d+", text):
            return
        first = row.spans[0]
        if first.color == RED and first.size >= 14:
            m = HEADING_RE.match(text)
            if m:
                self._start_issue(row, m, images)
            return
        if self.issue is None:
            return
        if "Read issue at" in text:
            uri = row.uri("archive.org/details/") or row.uri("hathitrust")
            if uri and "hathitrust" in uri:
                self.issue.hathitrust_url = uri
            elif uri:
                self._set_ia(IA_DETAILS_RE.search(uri).group(1), row)  # type: ignore[union-attr]
            else:
                self.problems.append(ParseIssue("read-link-without-uri", row.page, text))
            return
        if text in ("Heritage Auction sales", "ABE Listings"):
            self._flush_entry()
            self.in_market = True  # auction/ABE rows follow (ignored in v1)
            return
        if text == "Contents include:":
            self._flush_entry()
            self.in_market = False
            return
        m = ENTRY_RE.match(text)
        if m and row.x < ENTRY_X:
            self._flush_entry()
            self.in_market = False
            self.entry = [row]
            return
        # wrapped continuation: indented at x≈150, or starting with the "·" separator
        if self.entry and (CONT_X[0] <= row.x < CONT_X[1] or text.startswith("·")):
            self.entry.append(row)
            return
        self._flush_entry()
        if not self.in_market:
            self.problems.append(ParseIssue("unrecognized-row", row.page, text))

    # ---- issues -------------------------------------------------------------------------------------------
    def _start_issue(self, row: Row, m: re.Match, images) -> None:
        self._flush_entry()
        year, mon = int(m.group(1)), MONTHS[m.group(2)]
        cover = next((COVER_RE.match(s.text.strip()).group(1).strip()  # type: ignore[union-attr]
                      for s in row.spans if COVER_RE.match(s.text.strip())), None)
        slug = f"amazing-stories-{year}-{mon:02d}"
        if slug in self.slugs:
            self.problems.append(ParseIssue("duplicate-issue-heading", row.page, row.text.strip(),
                                            f"kept both; second gets slug {slug}-2"))
            slug += "-2"
        self.slugs.add(slug)
        self.issue = Issue(year=year, month=mon, title=f"{MAGAZINE}, {MONTH_NAMES[mon - 1]} {year}", slug=slug,
                           source_page=row.page, cover_artist_raw=cover or None)
        self.group_title = None
        self.in_market = False
        self.issues.append(self.issue)
        uri = row.uri("archive.org/details/")
        if uri:
            self._set_ia(IA_DETAILS_RE.search(uri).group(1), row)  # type: ignore[union-attr]
        # cover thumbnail: image left of the heading column, top near the heading
        near = [(abs(r.y0 - row.y), xref) for r, xref in images if r.x1 < ENTRY_X and -25 < r.y0 - row.y < 40]
        if near:
            xref = min(near)[1]
            self.issue.cover_image = _image_png(self.doc, xref)

    def _set_ia(self, ident: str, row: Row) -> None:
        assert self.issue is not None
        if self.issue.ia_identifier and self.issue.ia_identifier != ident:
            self.problems.append(ParseIssue("conflicting-issue-link", row.page, row.text.strip(),
                                            f"{self.issue.ia_identifier} vs {ident}"))
            return
        self.issue.ia_identifier = ident
        self.issue.volume, self.issue.number = _volume_number(ident)

    # ---- stories ------------------------------------------------------------------------------------------
    def _flush_entry(self) -> None:
        if not self.entry or self.issue is None:
            self.entry = []
            return
        rows, self.entry = self.entry, []
        raw = re.sub(r"\s+", " ", " ".join(r.text.strip() for r in rows)).strip()
        story = self._parse_entry(raw, rows[0])
        if story:
            self.issue.stories.append(story)

    def _parse_entry(self, raw: str, first: Row) -> Story | None:
        m = ENTRY_RE.match(raw)
        assert m
        page_tok, rest = m.group("page"), m.group("rest")
        parts = [p.strip() for p in SEP_RE.split(rest)]
        parts = [p for p in parts if p != ""]
        if len(parts) < 3:
            self.problems.append(ParseIssue("entry-missing-fields", first.page, raw, "expected 'title · credits · type'"))
            if len(parts) < 2:
                return None
            parts.insert(1, "")
        title_raw, credit_str, code_str = parts[0], " · ".join(parts[1:-1]), parts[-1]
        story = Story(title=title_raw, raw=raw, page_label=page_tok)
        notes: list[str] = []

        # page
        sub = page_tok.startswith("_")
        num = page_tok.lstrip("_").rstrip(".")
        if num.isdigit():
            story.page_printed = int(num)
        elif num in PAGE_TOKENS:
            notes.append(PAGE_TOKENS[num])
        elif num not in ("", "?"):
            self.problems.append(ParseIssue("unknown-page-token", first.page, raw, page_tok))
        if sub:
            if self.group_title:
                notes.append(f"part of: {self.group_title}")
            else:
                self.problems.append(ParseIssue("sub-item-without-parent", first.page, raw))
        # type code (+ extra text such as "(r)" or "[Ref. X]")
        cm = re.match(r"^(n\.|\?\?|[a-z]{2,3})(?=$|[\s\[(;])\s*(.*)$", code_str)
        if cm:
            story.type_code = cm.group(1)
            story.type_label = ITEM_TYPES.get(story.type_code)
            extra = cm.group(2).strip()
            if extra == "(r)":
                notes.append("reprint")
            elif extra:
                notes.append(extra.strip("[]"))
            if story.type_label is None:
                self.problems.append(ParseIssue("unknown-type-code", first.page, raw, story.type_code))
        else:
            self.problems.append(ParseIssue("bad-type-code", first.page, raw, code_str))
        # title: trailing [..] groups hold part info and series names
        title = title_raw
        series: list[str] = []
        for group in re.findall(r"\[([^\]]*)\]", title_raw):
            for item in (g.strip() for g in group.split(";")):
                pm = PART_RE.match(re.sub(r"\s+", " ", item))
                if pm:
                    story.part_info = f"Part {pm.group(1)} of {pm.group(2)}"
                elif item:
                    series.append(item)
        title = re.sub(r"\s*\[[^\]]*\]", "", title).strip()
        story.title = re.sub(r"\s+", " ", title)
        if series:
            notes.append("series: " + "; ".join(series))
        if not sub:
            self.group_title = story.title  # "_NN)" items belong to the previous top-level entry
        # credits
        story.credits, credit_notes = _parse_credits(credit_str)
        notes.extend(credit_notes)
        # link → leaf
        uri = first.uri("archive.org/details/", first_span_only=True)
        if uri:
            lm = IA_DETAILS_RE.search(uri)
            assert lm
            story.ia_link_id = lm.group(1)
            if lm.group(2) is not None:
                leaf = int(lm.group(2))
                if leaf < 0:
                    self.problems.append(ParseIssue("negative-leaf", first.page, raw, uri))
                else:
                    story.ia_leaf = leaf
        story.note = "; ".join(notes) or None
        return story


def _split_names(s: str) -> list[str]:
    """Split 'A & B', 'A and B' (not inside parentheses)."""
    parts, depth, cur = [], 0, ""
    tokens = re.split(r"(\(|\)|\s+&\s+|\s+and\s+)", s)
    for t in tokens:
        if t == "(":
            depth += 1
        elif t == ")":
            depth -= 1
        if depth == 0 and re.fullmatch(r"\s+(&|and)\s+", t or ""):
            parts.append(cur)
            cur = ""
        else:
            cur += t
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def _parse_credits(s: str) -> tuple[list[Credit], list[str]]:
    credits: list[Credit] = []
    notes: list[str] = []
    chunks = [c.strip() for c in s.split(";") if c.strip()]
    for i, chunk in enumerate(chunks):
        role = "author"
        m = re.match(r"^(translated|illustrated|adapted|edited)\s+by\s+(.*)$", chunk, re.I)
        if m:
            role = {"translated": "translator", "illustrated": "illustrator", "edited": "editor"}.get(m.group(1).lower())
            if role is None:
                notes.append(chunk)
                continue
            chunk = m.group(2)
        elif i > 0:
            notes.append(chunk)
            continue
        names = _split_names(chunk)
        expanded = []
        for name in names:  # "Richard S. Shaver (with Raymond A. Palmer)" → two credits
            wm = re.match(r"^(.*?)\s*\(with\s+(.+)\)$", name)
            expanded += [wm.group(1), *_split_names(wm.group(2))] if wm else [name]
        for name in expanded:
            pm = re.match(r"^(.*?)\s*\((?:by|as|pseud\. of)\s+(.+)\)$", name)
            if pm:
                name = pm.group(1)
                notes.append(f"{name} = {pm.group(2)}")
            if is_placeholder(name):
                notes.append(f"credit: {name}")
                continue
            credits.append(Credit(raw=name, role=role))
    return credits, notes


def _image_png(doc: pymupdf.Document, xref: int) -> bytes:
    pix = pymupdf.Pixmap(doc, xref)
    if pix.alpha or pix.n - pix.alpha > 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    return pix.tobytes("png")


def _reconcile_items(issues: list[Issue], problems: list[ParseIssue]) -> None:
    """Story leaves only make sense in the item they link to. If all story links of an issue point to one
    IA item that differs from the issue link, the reader must open that item."""
    for issue in issues:
        ids = {s.ia_link_id for s in issue.stories if s.ia_link_id}
        if len(ids) > 1:
            problems.append(ParseIssue("stories-link-several-items", issue.source_page, issue.title, ", ".join(sorted(ids))))
        elif len(ids) == 1:
            (sid,) = ids
            if issue.ia_identifier is None:
                issue.ia_identifier = sid
                issue.volume, issue.number = _volume_number(sid)
                problems.append(ParseIssue("issue-item-from-story-links", issue.source_page, issue.title, sid))
            elif sid != issue.ia_identifier:
                problems.append(ParseIssue("issue-item-switched-to-story-links", issue.source_page, issue.title,
                                           f"{issue.ia_identifier} → {sid}"))
                issue.ia_identifier = sid
                issue.volume, issue.number = _volume_number(sid)


def _check_order_and_shared_items(issues: list[Issue], problems: list[ParseIssue]) -> None:
    """The guide is chronological. A heading that breaks the order is a copy/paste error in the source; if it
    also shares its IA item with another issue, its links point to the wrong magazine → drop them."""
    first_for_item: dict[str, Issue] = {}
    prev: Issue | None = None
    for issue in issues:
        out_of_order = prev is not None and (issue.year, issue.month) <= (prev.year, prev.month)
        if out_of_order:
            problems.append(ParseIssue("heading-out-of-order", issue.source_page, issue.title,
                                       f"after {prev.title}; date in the source is probably wrong"))  # type: ignore[union-attr]
        ident = issue.ia_identifier
        if ident and ident in first_for_item:
            bad = issue  # the later (usually out-of-order) heading loses the link
            problems.append(ParseIssue("shared-ia-item-cleared", bad.source_page, bad.title,
                                       f"{ident} also used by {first_for_item[ident].title}; "
                                       f"link and story leaves removed from this one"))
            bad.ia_identifier = None
            bad.volume = bad.number = None
            for s in bad.stories:
                s.ia_leaf = None
                s.ia_link_id = None
        elif ident:
            first_for_item[ident] = issue
        if not out_of_order:
            prev = issue


def _cover_artist_fallback(issues: list[Issue]) -> None:
    """Headings without 'cover by': use the credit of a front-cover `cv` item, if any."""
    for issue in issues:
        if issue.cover_artist_raw:
            continue
        for s in issue.stories:
            if s.type_code == "cv" and "back cover" not in (s.note or "") and s.credits:
                issue.cover_artist_raw = s.credits[0].raw
                break


def parse(source: Path) -> Catalog:
    doc = pymupdf.open(source)
    p = _Parser(doc)
    p.run()
    _cover_artist_fallback(p.issues)
    _reconcile_items(p.issues, p.problems)
    _check_order_and_shared_items(p.issues, p.problems)
    return Catalog(magazine_name=MAGAZINE, magazine_slug="amazing-stories",
                   source=f"{source.name} (Tak Kurosaki, Amazing Stories Reference Guide)",
                   issues=p.issues, problems=p.problems)

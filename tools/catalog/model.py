"""Catalog data model produced by every source adapter (SPEC §6: one adapter per magazine, same schema)."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Credit:
    raw: str  # name exactly as printed in the source
    role: str  # 'author' | 'editor' | 'translator' | 'illustrator' | 'cover_artist'


@dataclass
class Story:
    title: str
    raw: str  # full source entry text, for debugging/reporting
    part_info: str | None = None  # e.g. "Part 1 of 2"
    type_code: str | None = None  # FictionMags item type, e.g. "ss"
    type_label: str | None = None
    page_printed: int | None = None
    page_label: str | None = None  # raw page token: "62", "bc.", "_727", "?"
    ia_leaf: int | None = None  # 0-based IA leaf from the source link (a hint, see docs/archive-findings.md §5)
    ia_link_id: str | None = None  # IA identifier found in the story link
    note: str | None = None
    credits: list[Credit] = field(default_factory=list)


@dataclass
class Issue:
    year: int
    month: int
    title: str
    slug: str
    source_page: int  # page in the reference document (for reports)
    cover_artist_raw: str | None = None
    ia_identifier: str | None = None
    hathitrust_url: str | None = None
    volume: int | None = None
    number: int | None = None
    cover_image: bytes | None = None  # raw image extracted from the source, converted later
    id: int | None = None  # stable id set by the adapter (packs); else assigned by catalog/db.py
    page_count: int | None = None  # known at build time for packs (sub-book page count)
    stories: list[Story] = field(default_factory=list)

    @property
    def availability(self) -> str:
        if self.ia_identifier:
            return "ia"
        if self.hathitrust_url:
            return "hathitrust"
        return "none"


@dataclass
class ParseIssue:
    """Anything the adapter could not parse cleanly — reported, never silently dropped."""
    kind: str
    page: int
    text: str
    detail: str = ""


@dataclass
class Catalog:
    magazine_name: str
    magazine_slug: str
    source: str
    issues: list[Issue]
    problems: list[ParseIssue]

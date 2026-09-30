"""Person-name normalization: trim, unify obvious variants, keep the raw string elsewhere."""
from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict

# collective or placeholder credits — not people; kept in the story note instead of `person`
PLACEHOLDERS = {"[uncredited]", "the readers", "various", "the editors", "the editor", "anonymous"}


def clean(raw: str) -> str:
    """Display form: NFC, single spaces, no stray punctuation at the ends, 'H.G.' → 'H. G.'."""
    s = unicodedata.normalize("NFC", raw).replace(" ", " ")
    s = re.sub(r"\s+", " ", s).strip(" ,;·")
    s = re.sub(r"\b([A-Z])\.(?=[A-Z][a-z]?\.)", r"\1. ", s)  # H.G. → H. G.
    s = re.sub(r"\b([A-Z])\.(?=[A-Z][a-z])", r"\1. ", s)  # J.Smith → J. Smith
    s = re.sub(r"(?<=[a-z]{3})\.$", "", s)  # stray final period: 'David H. Keller.' (keeps 'Jr.', 'Ph.D.')
    return re.sub(r"\s+", " ", s)


# applied to the lowercase, punctuation-free key form ("capt s p meek u s a")
_TITLES = re.compile(r"^(capt|dr|lt|col|prof|major|sgt|rev|sir)\s+")
_ACADEMIC = re.compile(r"(\s(ph d|m d|b sc|u s a|u s n))+$")  # degrees / service: same person
_GENERATION = re.compile(r"(\s(jr|sr|ii|iii))+$")  # Jr./Sr. may be a different person: never merged


def _signature(k: str) -> tuple[str, str] | None:
    """(surname, first initial) ignoring Jr./Sr., for duplicate *hints* only."""
    parts = _GENERATION.sub("", k).split()
    return (parts[-1], parts[0][0]) if len(parts) >= 2 else None


def key(name: str) -> str:
    """Matching key: case/accent/punctuation-insensitive and without titles/degrees
    ('H.G. Wells' == 'h g wells'; 'Capt. S. P. Meek, U. S. A.' == 'S. P. Meek'; 'Robert Arthur, Jr.' stays apart)."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9']+", " ", s.replace("’", "'")).strip()
    return _ACADEMIC.sub("", _TITLES.sub("", s)).strip()


def is_placeholder(name: str) -> bool:
    return name.strip().lower() in PLACEHOLDERS


class NameRegistry:
    """Collects raw names, merges by `key`, picks the most frequent display form."""

    def __init__(self) -> None:
        self._forms: dict[str, Counter[str]] = defaultdict(Counter)

    def add(self, raw: str) -> str:
        c = clean(raw)
        k = key(c)
        self._forms[k][c] += 1
        return k

    def display(self, k: str) -> str:
        forms = self._forms[k]
        return sorted(forms.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]

    def keys(self) -> list[str]:
        return sorted(self._forms, key=lambda k: self.display(k).lower())

    def merged_variants(self) -> list[tuple[str, list[str]]]:
        """Names that had more than one printed form (merged automatically)."""
        return [(self.display(k), sorted(f)) for k, f in self._forms.items() if len(f) > 1]

    def possible_duplicates(self) -> list[tuple[str, str]]:
        """Not merged, only reported: same surname + same first initial (e.g. 'Julian Krupa' / 'Julian S. Krupa')."""
        by_sig: dict[tuple[str, str], list[str]] = defaultdict(list)
        for k in self._forms:
            sig = _signature(k)
            if sig:
                by_sig[sig].append(k)
        out = []
        for ks in by_sig.values():
            if len(ks) > 1:
                ks = sorted(ks)
                out.extend((self.display(a), self.display(b)) for i, a in enumerate(ks) for b in ks[i + 1:])
        return sorted(out)

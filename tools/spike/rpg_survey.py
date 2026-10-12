"""Phase 10 survey: candidate RPG / gaming magazines on the Internet Archive (metadata only, one search per title).

For each candidate: how many items, which collections, years, how many are open (not lending-only) and reader-ready
(page images + OCR), and whether one big "pack" item holds many issues. Usage (repo root):
  python tools/spike/rpg_survey.py
Writes tools/spike/out/rpg_survey.json.
"""
import json
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from catalog.ia import get  # noqa: E402

CANDIDATES = {
    "White Dwarf": 'title:("white dwarf") AND mediatype:texts',
    "Polyhedron": 'title:(polyhedron) AND mediatype:texts',
    "Imagine (TSR UK)": 'title:("imagine magazine") AND mediatype:texts',
    "Different Worlds": 'title:("different worlds") AND mediatype:texts',
    "The Space Gamer": 'title:("space gamer") AND mediatype:texts',
    "Pyramid": 'title:(pyramid) AND subject:(gurps OR "steve jackson" OR rpg) AND mediatype:texts',
    "Challenge (GDW)": 'title:(challenge) AND subject:(gdw OR traveller OR rpg) AND mediatype:texts',
    "Journal of the Travellers' Aid Society": 'title:("travellers aid society" OR "travellers\' aid society") AND mediatype:texts',
    "Ares": 'title:(ares) AND subject:(spi OR wargame OR rpg OR "science fiction") AND mediatype:texts',
    "Strategy & Tactics": 'title:("strategy & tactics" OR "strategy and tactics") AND mediatype:texts',
    "The General (Avalon Hill)": 'title:("the general") AND subject:("avalon hill") AND mediatype:texts',
    "Autoduel Quarterly": 'title:(autoduel) AND mediatype:texts',
    "Adventurer's Club": 'title:("adventurers club" OR "adventurer\'s club") AND mediatype:texts',
    "Heroes (Avalon Hill)": 'title:(heroes) AND subject:("avalon hill") AND mediatype:texts',
    "Shadis": 'title:(shadis) AND mediatype:texts',
    "White Wolf Magazine": 'title:("white wolf") AND mediatype:texts',
    "Alarums & Excursions": 'title:("alarums") AND mediatype:texts',
    "Fight On!": 'title:("fight on") AND subject:(rpg OR osr OR "dungeons") AND mediatype:texts',
    "Knockspell": 'title:(knockspell) AND mediatype:texts',
    "Footprints (Dragonsfoot)": 'title:(footprints) AND subject:(dragonsfoot OR "ad&d" OR rpg) AND mediatype:texts',
    "Casus Belli (FR)": 'title:("casus belli") AND mediatype:texts',
    "Dragão Brasil (BR)": 'title:("dragao brasil" OR "dragão brasil") AND mediatype:texts',
    "Dragon Slayer (BR)": 'title:("dragon slayer") AND subject:(rpg) AND mediatype:texts',
    "Valkyrie": 'title:(valkyrie) AND subject:(rpg OR "role-playing") AND mediatype:texts',
    "Gateways": 'title:(gateways) AND subject:(rpg OR "role-playing") AND mediatype:texts',
    "Wargamer / Fire & Movement": 'title:("fire & movement" OR "fire and movement") AND mediatype:texts',
    "Sorcerer's Apprentice (Flying Buffalo)": 'title:("sorcerer\'s apprentice" OR "sorcerers apprentice") AND mediatype:texts',
    "The Strategic Review (TSR)": 'title:("strategic review") AND mediatype:texts',
    "Wyrd / Interface / misc RPG zine (subject)": 'subject:("role-playing games") AND subject:(periodicals OR magazine) AND mediatype:texts',
}
FIELDS = ["identifier", "title", "date", "year", "collection", "format", "access-restricted-item", "imagecount"]


def main() -> None:
    out = {}
    for name, q in CANDIDATES.items():
        url = ("https://archive.org/advancedsearch.php?q=" + quote(q) + "".join(f"&fl[]={f}" for f in FIELDS)
               + "&sort[]=date+asc&rows=500&page=1&output=json")
        try:
            r = get(url).json()["response"]
        except Exception as e:  # noqa: BLE001
            print(f"{name}: ERROR {e}", flush=True)
            continue
        docs = r["docs"]
        ready = [d for d in docs if str(d.get("access-restricted-item", "")).lower() != "true"
                 and any("JP2" in f for f in d.get("format") or []) and any("Djvu XML" in f for f in d.get("format") or [])]
        lending = sum(1 for d in docs if str(d.get("access-restricted-item", "")).lower() == "true")
        years = sorted(str(d.get("year") or d.get("date") or "")[:4] for d in ready if d.get("year") or d.get("date"))
        colls = Counter(c for d in ready for c in (d.get("collection") if isinstance(d.get("collection"), list) else [d.get("collection")]) if c)
        big = sorted(ready, key=lambda d: -int(d.get("imagecount") or 0))[:3]
        out[name] = {"found": r["numFound"], "ready": len(ready), "lending_only": lending,
                     "years": [years[0], years[-1]] if years else None, "collections": colls.most_common(5),
                     "sample": [(d["identifier"], d.get("title")) for d in ready[:5]],
                     "largest": [(d["identifier"], d.get("imagecount")) for d in big]}
        print(json.dumps({name: out[name]}, ensure_ascii=False)[:700], flush=True)
    Path("tools/spike/out").mkdir(parents=True, exist_ok=True)
    Path("tools/spike/out/rpg_survey.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()

# Banca

*A newsstand for pulp magazines.* A personal Android tablet (and phone) app for browsing and reading classic pulp magazines scanned by the
[Internet Archive](https://archive.org). Seven magazines, about 2,000 issues: **Amazing Stories** (1926–1956, 309
issues with 4,000+ stories, searchable by title, author, editor, cover artist and translator), **The Magazine of Fantasy
& Science Fiction** (1949–2007), **Galaxy** (1950–1980), **Fantastic** (1952–1980) and **Rod Serling's The Twilight Zone
Magazine** (1981–1989), plus the RPG magazines **Dragon** (1976–2013) and **Dungeon** (1986–2013), and 12 comics titles (about 820
issues and volumes: Hellblazer, Turok, Conan, Miracleman, Asterix, The Complete Peanuts, Marvel Masterworks and more),
all readable page by page.

Built for a Samsung Galaxy Tab A9+ (11", 1920×1200), with phone layouts for the Galaxy S25. Personal use only. It is not published on any store; see
[Distribution](#distribution).

> Status: **Phase 8c (comics)** built; 8b verified on the tablet. Catalog, search, the production reader, offline downloads,
> highlights with notes, Markdown export and the Atlas work. See [Roadmap](#roadmap).

## Features

- **Banca "Newsprint" design**: Paper and Night themes, bundled fonts (Big Shoulders Display + Source Serif 4), tablet
  masthead with Pulp / RPG / Atlas tabs and a phone bottom navigation. RPG and Atlas are marked *coming soon*.
- **Library**: magazines by category (pulp & science fiction; RPG magazines and comics on their own tabs) with a
  cover mosaic (upcoming magazines marked *coming soon*), plus a *Continue reading* shelf
  with each issue's progress. Progress can be cleared per issue (× on the shelf, *Clear progress* on the issue page)
  or all at once (Settings → Reading); highlights, bookmarks and downloads are kept.
- **Magazine**: cover grid of every issue, with filters by decade and year and a *readable only* toggle.
- **Issue**: large cover, credits, and the table of contents. Tap a story to open the reader at its page. Tap a name
  to see everything that person wrote, edited or illustrated.
- **Search**: SQLite FTS5 over issues, stories and people. It matches word prefixes, ignores accents and case, finds
  real names behind pseudonyms (`otto` → *Eando Binder*), and filters by role and year range. On-device queries take
  under 100 ms.
- **Reader**:
  - two-page spreads with the tablet in landscape; one page in portrait; on phones, pages open fitted to the width;
  - page images come from the Internet Archive IIIF API, loaded low-res first and then sharp; the previous and next 2
    pages are kept ready and pages 3–5 ahead are already downloaded;
  - pinch-zoom and pan with inertia; turn pages while zoomed by dragging past the page edge, tapping the screen edge or
    using the side buttons;
  - auto-hiding top and bottom bars: thumbnail strip, page slider with marks where stories start, "pages to the end of
    the story", a contents drawer and a **page index** (thumbnail grid with story starts and *go to page*);
  - **Display** panel: Paper / Sepia / Night page themes, in-app brightness (independent of the system), warm filter
    and **Enhance text** for worn type on old scans; full screen while reading;
  - printed page numbers and story jumps are corrected from the scan's own OCR (the reference guide is off by a couple
    of pages in some issues);
  - long-press text selection on an invisible OCR layer; the selection bar offers **4 highlight colors**, *Note*,
    *Search web* (Google in a Chrome tab over the app) and *Copy*; tapping a highlight (anywhere on the page) opens a card to
    see or edit its note, change its color, search, copy or delete it; highlights with a note show a small note marker; **bookmarks** per page; all saved on the device;
  - the exact page and zoom are saved and resumed.
- **Notes** (pen icon in the masthead): every highlight, note and bookmark across issues, grouped by issue with story
  titles and printed page numbers; search, color filter, tap to open the page, trash icon to delete (two taps). **Export to Markdown** (one issue from
  the reader's Notes panel, or everything / the filtered list) through Android's share sheet, or copy to the clipboard.
- **Atlas** (ATLAS tab): a curated, offline "museum" that links the stories to authors, magazines, themes, film, radio,
  music, visual art and world events. Every text cites its sources; images come from Wikimedia Commons (free licences,
  credited, loaded online) or the catalog's covers.
  - **Home**: the featured path with progress, *Explore next* (recommendations that always say why), recently explored,
    your lists and a timeline preview; Atlas search.
  - **Timeline**: an overview strip (1890 → today, one row per lane) above decade or year columns; tap an item to see its
    connections (tags, pins and a side sheet); lane filter, jump to year. Phones get a vertical list and a bottom sheet.
  - **Entity pages**: picture with credit, text with citations, connections grouped by type, explore next, sources;
    **Read in Banca** opens the story in the reader (or says the issue has no scan yet); IMDb / Spotify links.
  - **Saved and subject timelines**: *Save view* keeps the zoom, lanes, period, selection and subject under *Your
    timelines*; an Atlas search offers *Timeline of "…"* (the matches and everything curated around them).
    In a saved timeline you can add any Atlas entry (also from its page: *Add to a timeline*, or start a new one with
    it) and your own items (title, year, lane, note, link); *Only what I added* turns it into a personal timeline.
  - **Curator inbox**: *Suggest* (Atlas home, search, any page) and Atlas searches that found nothing are collected in
    Settings → Atlas inbox, exported as Markdown to curate new entries.
  - **Paths**: "From Wells to Foundation" (19 stops) and "From R.U.R. to the Thinking Machine" (robots and AI, 18 stops); the
    home features the path in progress and **Want to…** lists (read / watch / listen / see, done, undo).
- **Downloads (offline reading)**:
  - *Download* on an issue stores its pages (1200 px), thumbnails, page list and OCR text on the device (about
    25–65 MB per issue); the reader then uses the local files, so it works in airplane mode;
  - one issue at a time, 3 requests at once, retries with backoff; pause, resume and remove; downloads resume after
    the app restarts (not while it is closed); *Download only on Wi-Fi* (on by default);
  - badges on every cover (✓ downloaded, n % downloading, paused, failed), a *Downloaded* filter on the magazine
    page and an *On this device* shelf in the Library;
  - **Settings → Storage**: space used, the list of downloaded issues, *Delete all downloads* (with confirmation)
    and *Clear cache*. Removing downloads keeps progress, highlights and bookmarks;
  - reading an issue that is not downloaded shows a small *online* tag; offline, a clear message.

## How it works

```
data/source/<reference guide>.pdf ──┐
tools/sources/ia/<collection>.json ──┴► tools/build_catalog.py ──► app/public/catalog/catalog.db (+ covers/*.webp)
 (IA collection listings, committed)    (tools/sources.toml, one adapter per source) │
                                                                         ▼
Internet Archive ◄── IIIF page images + djvu.xml OCR ──── Capacitor app (React + TypeScript, SQLite)
```

- **Catalog**: a Python builder reads every magazine listed in `tools/sources.toml` into one SQLite schema
  (`tools/catalog/schema.sql`, with categories and FTS5 tables). Amazing Stories comes from a reference guide (with full
  contents, report: [docs/catalog-report.md](docs/catalog-report.md)); the other magazines come from Internet Archive
  collections through a generic adapter that dates each scan, picks the best scan per issue and keeps the others as
  alternates (report: [docs/catalog-sources.md](docs/catalog-sources.md)). Their covers load from the Internet Archive.
  Builds are reproducible and need no network unless `--refresh` re-reads the collections.
- **Reader**: page images come from the IIIF Image API (CORS-enabled, any width). OCR word boxes come from each
  item's `_djvu.xml`, fetched natively because that endpoint sends no CORS headers. The research and measurements behind
  this design are in [docs/archive-findings.md](docs/archive-findings.md) and [docs/DECISIONS.md](docs/DECISIONS.md).
- **Data on the device**: `catalog.db` is shipped read-only and replaced when a new catalog ships. `user.db` holds
  progress, highlights, downloads and settings, and catalog updates never touch it.

## Tech stack

Capacitor 8 (Android) · Vite · React 19 · TypeScript (strict) · `@capacitor-community/sqlite` (device) /
`@sqlite.org/sqlite-wasm` (browser dev and tests) · Python 3.12 + PyMuPDF (catalog tools) · Vitest · pytest.

## Getting started

Requirements: Node 22+, Python 3.11+, JDK 21, Android Studio (SDK + platform-tools), and a device with USB debugging.

```bash
# 1. Python tools
python -m venv .venv
.venv/Scripts/pip install -r tools/requirements.txt        # Windows (use .venv/bin/pip elsewhere)

# 2. Catalog (needs the reference PDF in data/source/, which is not in the repo; --refresh re-reads IA collections)
python tools/build_catalog.py --out app/public/catalog

# 3. App in the desktop browser
cd app && npm install && npm run dev

# 4. App on the tablet
npm run build && npx cap sync android && npx cap run android
# or: cd android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Tests and checks

```bash
cd app && npm run typecheck && npm run lint && npm test     # app (Vitest)
pytest                                                      # catalog tools, from the repo root
```

## Repository layout

| Path | What |
|---|---|
| `app/src/db/` | database backends (native / sqlite-wasm) and `user.db` migrations |
| `app/src/data/` | repositories, the only place with SQL |
| `app/src/nav/` | stack navigator (browser history + Android back button) |
| `app/src/screens/`, `app/src/ui/` | screens, shared components, icons, theme (`app.css`) |
| `app/src/reader/` | reader screen, panels and `ReaderController`; `engine/` = gestures, image pipeline, OCR, IIIF, disk cache |
| `app/src/notes/` | notes gathering, Markdown export (pure, tested), share sheet / web search helpers |
| `app/src/downloads/` | download manager (queue, retries, resume, Wi-Fi policy), file store, React hooks |
| `app/android/.../BancaDisplayPlugin.java` | small native plugin: reader brightness and immersive full screen |
| `content/atlas/` | Atlas entities and guided paths (curated text with sources), checked by `tools/atlas/validate.py` |
| `tools/` | catalog builder, magazine adapters, tests, Internet Archive investigation scripts, `brand/` icon generator |
| `docs/` | decisions log, Internet Archive findings, catalog report, benchmark checklist, backlog |
| `docs/design/` | Banca visual identity (`banca-newsprint.md`), Atlas design spec (`banca-atlas.md`) and mockup sources (`mockups/`) |
| `SPEC.md`, `PHASE*_PROMPT.md`, `CLAUDE.md` | product spec, phase briefs, contributor/agent notes |

## Roadmap

1. ✅ **Spike and catalog**: reader approach chosen (IIIF images + OCR layer, not PDF.js) and catalog extraction.
2. ✅ **App shell**: Library / Magazine / Issue / Person / Search screens and progress.
   ✅ **Design sprint**: name **Banca** and the "Newsprint" identity, tokens and tablet/phone mockups
   ([docs/design/banca-newsprint.md](docs/design/banca-newsprint.md)); applied to the app from Phase 3 on.
3. ✅ **Banca + reader**: identity applied to every screen, phone layouts, production reader (spreads, page index,
   contents, slider, themes, brightness, warm filter, enhance text, OCR page numbers, highlights and bookmarks).
4. ✅ **Downloads**: offline issues, resumable, Wi-Fi only, downloaded filter, storage management.
5. ✅ **Notes and export**: highlight colors, notes, web search, Notes screen, Markdown export.
6. ✅ **Atlas** (pilot path): a curated, offline "museum" linking the stories to authors, themes, film, music, comics
   and visual art, with a timeline, entity pages, "explore next" recommendations and want-to lists. Pilot path:
   *From Wells to Foundation*. Design prompt: [docs/design/atlas-artifact-prompt.md](docs/design/atlas-artifact-prompt.md);
   design spec: [docs/design/banca-atlas.md](docs/design/banca-atlas.md).

   ✅ 7d–7e: saved and subject timelines, a curator inbox, your own items on timelines.
7. 🧪 **New sources** (categories **pulp**, **rpg**, **comics**): 8a ✅ F&SF, Galaxy, Fantastic, Twilight Zone (issue
   level, contents not indexed yet); 8b ✅ Dragon and Dungeon (issues inside multi-issue "pack" items, dated from their
   OCR); 8c 🧪 comics (12 titles, dated by year only; reader option *Two pages side by side: In landscape / Never*, remembered
   per magazine, Peanuts defaults to Never).

## Distribution

This is a personal, non-commercial project that runs from a locally installed build. It does not host any magazine
content: pages are read from the Internet Archive on demand. The catalog source (a reference guide marked *not for
distribution*) and the generated catalog and cover thumbnails are **not** committed to this repository. Publishing the
app on a store would first require clearing copyright, trademark and data-source questions (see the notes in
`docs/DECISIONS.md`).

## Credits

- Scans and OCR: [Internet Archive](https://archive.org) and the volunteers who scanned and uploaded these magazines.
- Issue contents: *Amazing Stories Reference Guide* by Tak Kurosaki (used privately, not redistributed).
- Collection listings and covers of the other magazines: Internet Archive metadata and thumbnails.
- Item type codes: [FictionMags Index](http://www.philsp.com/docs/fm_item_types.html).

# Pulp Reader

A personal Android tablet app for browsing and reading classic pulp magazines scanned by the
[Internet Archive](https://archive.org). The first magazine is **Amazing Stories** (1926–1956): 309 issues,
4,000+ stories, searchable by title, author, editor, cover artist and translator, and readable page by page.

Built for a Samsung Galaxy Tab A9+ (11", 1920×1200). Personal use only. It is not published on any store; see
[Distribution](#distribution).

> Status: **Phase 2 of 5**. Catalog, navigation, search and a first reader work on the tablet. The production reader,
> downloads and highlights come next. See [Roadmap](#roadmap).

## Features

- **Library**: magazines with a cover mosaic, plus a *Continue reading* shelf.
- **Magazine**: cover grid of every issue, with filters by decade and year and a *readable only* toggle.
- **Issue**: large cover, credits, and the table of contents. Tap a story to open the reader at its page. Tap a name
  to see everything that person wrote, edited or illustrated.
- **Search**: SQLite FTS5 over issues, stories and people. It matches word prefixes, ignores accents and case, finds
  real names behind pseudonyms (`otto` → *Eando Binder*), and filters by role and year range. On-device queries take
  under 100 ms.
- **Reader (interim)**:
  - page images come from the Internet Archive IIIF API, loaded low-res first and then sharp, with ±2 pages prefetched;
  - pinch-zoom and pan with inertia; you can turn pages while zoomed by dragging past the page edge or tapping the
    screen edge;
  - an invisible OCR text layer allows long-press selection and highlights (highlights are in memory for now);
  - the current page is saved and resumed.

## How it works

```
data/source/<reference guide>.pdf ──► tools/build_catalog.py ──► app/public/catalog/catalog.db (+ covers/*.webp)
                                     (one adapter per magazine)          │
                                                                         ▼
Internet Archive ◄── IIIF page images + djvu.xml OCR ──── Capacitor app (React + TypeScript, SQLite)
```

- **Catalog**: a Python builder parses a magazine reference document into one SQLite schema
  (`tools/catalog/schema.sql`) with FTS5 tables. It also writes a validation report
  ([docs/catalog-report.md](docs/catalog-report.md)). Builds are reproducible, and each magazine is a *source adapter*
  in `tools/adapters/`.
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

# 2. Catalog (needs the reference PDF in data/source/, which is not in the repo)
python tools/build_catalog.py --source data/source/Amazing_Stories_Reference_Guide.pdf --out app/public/catalog

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
| `app/src/screens/`, `app/src/ui/` | screens and shared components |
| `app/src/spike/` | Phase 1 reader prototype (still used by the reader screen until Phase 3) |
| `tools/` | catalog builder, magazine adapters, tests, and Internet Archive investigation scripts |
| `docs/` | decisions log, Internet Archive findings, catalog report, benchmark checklist, backlog |
| `docs/design/` | Banca visual identity: design system spec (`banca-newsprint.md`) and mockup sources (`mockups/`) |
| `SPEC.md`, `PHASE*_PROMPT.md`, `CLAUDE.md` | product spec, phase briefs, contributor/agent notes |

## Roadmap

1. ✅ **Spike and catalog**: reader approach chosen (IIIF images + OCR layer, not PDF.js) and catalog extraction.
2. ✅ **App shell**: Library / Magazine / Issue / Person / Search screens and progress (testing on the device).
   ✅ **Design sprint**: name **Banca** and the "Newsprint" identity, tokens and tablet/phone mockups
   ([docs/design/banca-newsprint.md](docs/design/banca-newsprint.md)); applied to the app from Phase 3 on.
3. **Reader**: production reader with two-page spreads in landscape, themes, in-app brightness and a warm filter, a
   "enhance text" filter for worn type, a contents drawer, page slider, and page numbers corrected from OCR.
4. **Downloads**: Kindle-style offline issues, resumable, Wi-Fi only, storage management.
5. **Highlights and export**: 4 colors, notes, web search, Markdown export; icon and splash screen.

Next sources (content categories **pulp** and **rpg**: F&SF, Galaxy, Fantastic, Asimov's, Twilight Zone, Dragon,
Dungeon, The Space Gamer, …) are tracked in [docs/BACKLOG.md](docs/BACKLOG.md).

## Distribution

This is a personal, non-commercial project that runs from a locally installed build. It does not host any magazine
content: pages are read from the Internet Archive on demand. The catalog source (a reference guide marked *not for
distribution*) and the generated catalog and cover thumbnails are **not** committed to this repository. Publishing the
app on a store would first require clearing copyright, trademark and data-source questions (see the notes in
`docs/DECISIONS.md`).

## Credits

- Scans and OCR: [Internet Archive](https://archive.org) and the volunteers who scanned and uploaded these magazines.
- Issue contents: *Amazing Stories Reference Guide* by Tak Kurosaki (used privately, not redistributed).
- Item type codes: [FictionMags Index](http://www.philsp.com/docs/fm_item_types.html).

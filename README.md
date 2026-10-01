# Banca

*A newsstand for pulp magazines.* A personal Android tablet (and phone) app for browsing and reading classic pulp magazines scanned by the
[Internet Archive](https://archive.org). The first magazine is **Amazing Stories** (1926–1956): 309 issues,
4,000+ stories, searchable by title, author, editor, cover artist and translator, and readable page by page.

Built for a Samsung Galaxy Tab A9+ (11", 1920×1200), with phone layouts for the Galaxy S25. Personal use only. It is not published on any store; see
[Distribution](#distribution).

> Status: **Phase 5 (downloads) built, testing on the device.** Banca identity, catalog, search, the production reader
> and offline issues work; notes and export come next. See [Roadmap](#roadmap).

## Features

- **Banca "Newsprint" design**: Paper and Night themes, bundled fonts (Big Shoulders Display + Source Serif 4), tablet
  masthead with Pulp / RPG / Atlas tabs and a phone bottom navigation. RPG and Atlas are marked *coming soon*.
- **Library**: magazines with a cover mosaic (upcoming magazines marked *coming soon*), plus a *Continue reading* shelf
  with each issue's progress.
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
  - long-press text selection on an invisible OCR layer, **highlights** and **bookmarks** saved on the device;
  - the exact page and zoom are saved and resumed.
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
| `app/src/screens/`, `app/src/ui/` | screens, shared components, icons, theme (`app.css`) |
| `app/src/reader/` | reader screen, panels and `ReaderController`; `engine/` = gestures, image pipeline, OCR, IIIF, disk cache |
| `app/src/downloads/` | download manager (queue, retries, resume, Wi-Fi policy), file store, React hooks |
| `app/android/.../BancaDisplayPlugin.java` | small native plugin: reader brightness and immersive full screen |
| `tools/` | catalog builder, magazine adapters, tests, Internet Archive investigation scripts, `brand/` icon generator |
| `docs/` | decisions log, Internet Archive findings, catalog report, benchmark checklist, backlog |
| `docs/design/` | Banca visual identity: design system spec (`banca-newsprint.md`) and mockup sources (`mockups/`) |
| `SPEC.md`, `PHASE*_PROMPT.md`, `CLAUDE.md` | product spec, phase briefs, contributor/agent notes |

## Roadmap

1. ✅ **Spike and catalog**: reader approach chosen (IIIF images + OCR layer, not PDF.js) and catalog extraction.
2. ✅ **App shell**: Library / Magazine / Issue / Person / Search screens and progress.
   ✅ **Design sprint**: name **Banca** and the "Newsprint" identity, tokens and tablet/phone mockups
   ([docs/design/banca-newsprint.md](docs/design/banca-newsprint.md)); applied to the app from Phase 3 on.
3. ✅ **Banca + reader**: identity applied to every screen, phone layouts, production reader (spreads, page index,
   contents, slider, themes, brightness, warm filter, enhance text, OCR page numbers, highlights and bookmarks).
4. 🧪 **Downloads**: offline issues, resumable, Wi-Fi only, downloaded filter, storage management (testing on the device).
5. **Notes and export**: highlight colors, notes, web search, Markdown export.

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

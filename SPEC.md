# Pulp Reader — Product Spec (v1)

Personal-use Android tablet app for browsing and reading pulp magazines scanned on the Internet Archive.
First magazine: **Amazing Stories** (1926–1956). Later: Weird Tales, others (Asimov's is lending-only on IA, likely not downloadable — check per magazine).

- Target device: Samsung Galaxy Tab A9+ (SM-X210, ~11", 1920x1200, Snapdragon 695, Android 16 / One UI 8). Mid-range hardware: **performance is a hard requirement**.
- UI language: English. Personal use only, not for publication.

## 1. Stack
- Capacitor (Android) + Vite + React + TypeScript
- SQLite via `@capacitor-community/sqlite` (catalog + user data), FTS5 for search
- Capacitor Filesystem for downloaded pages
- Catalog build script in Python (`tools/`), run on the PC, output shipped in the app
- Reader: **Option B** — page images + OCR text overlay (BookReader-style). Option A (PDF.js) is only a benchmark baseline in the Phase 1 spike. Phase 1 decides final choice.

## 2. Screens
1. **Library** — list of magazines (v1: one). Global search bar.
2. **Magazine** — grid of issues (cover + "Apr 1926", cover artist, editor, story count, download badge). Filters: year/decade. Sort: chronological.
3. **Issue detail** — big cover, metadata, table of contents (page, title, author, type), buttons: **Read now**, **Download / Remove**, resume position ("Continue p. 42").
4. **Reader** — see §4.
5. **Search results** — grouped: Issues, Stories, People (authors/editors/cover artists). Tap → issue (story tap opens reader at that story's page).
6. **Settings** — theme, storage used, Wi-Fi-only downloads, clear cache.
7. **Home shelf** "Continue reading" — issues with progress, most recent first.

## 2.1 Search
FTS5 across: magazine name, issue title/year/month, story titles, authors, editors, translators, cover artists. Prefix matching, accent/case-insensitive. Filters: year range, role (author/editor/artist). Must feel instant (<100 ms on device).

## 3. Data model (SQLite)
- `magazine(id, name, slug, source)`
- `issue(id, magazine_id, year, month, title, volume, number, cover_artist, editor, ia_identifier, availability['ia'|'hathitrust'|'none'], cover_path, page_count)`
- `story(id, issue_id, title, part_info, type_code, type_label, page_printed, ia_leaf, sort_order, note)`
- `person(id, name)`; `story_person(story_id, person_id, role['author'|'editor'|'translator'|'illustrator'])`; `issue_person(issue_id, person_id, role['editor'|'cover_artist'])`
- FTS tables over the above.
User data (separate DB/tables, never overwritten when the catalog is updated):
- `download(issue_id, state['none'|'downloading'|'paused'|'done'|'error'], bytes, pages_done, pages_total, updated_at)`
- `progress(issue_id, page, offset_x, offset_y, zoom, updated_at)`
- `highlight(id, issue_id, page, rects_json /* normalized 0..1 */, text, color, note, created_at)`
- `settings(key, value)`

Catalog is built from `data/source/Amazing_Stories_Reference_Guide.pdf` (see Phase 1, Part B). The app ships a prebuilt `catalog.db` + cover thumbnails (WebP, ~300 px wide). Catalog updates replace catalog tables only.

## 4. Reader requirements
- **Rendering**: page images from the Internet Archive (or local cache). One code path for online and offline; downloading only pre-fills the local cache. Progressive load (low-res first, then sharp), prefetch next/previous 2 pages, cancel stale requests.
- **Layout**: portrait = one page; landscape = two-page spread (cover alone). Tap left/right edges or swipe to turn; pinch-zoom + pan with inertia; double-tap to fit/zoom; center tap toggles chrome.
- **Fullscreen**: immersive mode by default; chrome (top bar, page slider, ToC) auto-hides.
- **Brightness**: in-app slider (0–100%) independent of system brightness (native plugin), restored on exit. Warm-light filter slider.
- **Themes**: light, dark (inverted/dimmed page rendering), sepia.
- **Jump**: ToC drawer of stories (uses `ia_leaf`), page slider with thumbnails if cheap.
- **Text selection & highlights**: OCR word boxes rendered as an invisible text layer over the page. Long-press to select; floating toolbar: Highlight (4 colors), Note, Search web, Copy. Highlights stored as normalized rects + text; re-rendered on load. Highlights list per issue (tap → jump).
- **Search web**: opens `https://www.google.com/search?q=<selection>` in the system browser.
- **Export**: per issue (or all) to Markdown via Android share sheet and save-to-Downloads:
  ```
  # Amazing Stories — Apr 1926
  ## p. 62 — The Man from the Atom
  > highlighted text…
  Note: …
  ```
- **Progress**: save page + offset + zoom on page change (debounced) and on app pause; reopening resumes exactly there.
- **Performance targets (Tab A9+)**: page turn feels < 150 ms with a cached page; pinch-zoom/pan at ≥ 60 fps; cold open of the reader to first page < 1.5 s (cached); memory stays bounded (keep ≤ ~5 decoded pages).

## 5. Downloads (Kindle-style)
- Issue states shown everywhere as a badge: **Cloud** (not downloaded), **Downloading n%**, **Downloaded** (with size).
- Download = store page images (+ OCR data) in app storage; resumable, survives app restart, 3–4 concurrent requests max, retry with backoff, "Wi-Fi only" option, cancel, remove to free space.
- Reading a not-downloaded issue works online; a subtle "online" indicator shows; offline + not downloaded → clear message.
- Internet Archive etiquette: identifying `User-Agent`, throttling, no bulk crawling of the whole magazine.

## 6. Extensibility
Each magazine = a **source adapter** in `tools/` that turns a reference (PDF/CSV/API) into the same catalog schema, plus an IA identifier per issue. The app code must not contain Amazing-Stories-specific logic.

## 7. Non-goals (v1)
Accounts, sync between devices, publishing to Play Store, DRM/lending (borrow-only) content, reflowed text reading mode (possible v2 using the OCR text).

## 8. Phases
1. **Spike + catalog extraction** (see PHASE1_PROMPT.md): validate reader approach on the tablet; build `catalog.db`.
2. App shell: navigation, Library/Magazine/Issue screens, search, from `catalog.db`.
3. Reader: production version (layouts, gestures, themes, brightness, progress).
4. Downloads + offline + storage management.
5. Highlights, notes, web search, Markdown export; polish, icon, splash.

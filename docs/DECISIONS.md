# Decisions

Dated entries for every non-trivial technical decision (newest last).

## 2026-09-30 — Project scaffold
- Vite 8 + React 19 + TypeScript 6 (`strict`) in `app/`, Capacitor 8 Android platform (`appId: local.pulpreader`).
- Toolchain on the dev PC: Node 24 LTS, Python 3.12, Temurin JDK 21, Android Studio (SDK/adb).
- Reference PDFs live in `data/source/` and are git-ignored (marked "not for distribution").

## 2026-09-30 — Reader: Option B (IIIF page images + OCR text layer)
**Decision:** B. PDF.js (A) is dropped.

Evidence (details in `docs/archive-findings.md`, checklist in `docs/benchmark-checklist.md`):
- Tablet (Galaxy Tab A9+, Apr 1926): cached page turn **12 ms**; 60–80 fps, min 36 fps while the OCR file was
  downloading in the background; first page 2.4 s cold over the network (manifest 1.6 s + low-res image);
  text layer 18 ms/page; OCR parse (worker) 687 ms per issue.
- User tablet test: B "far superior"; A slow to open (full PDF download 3–9 MB before page 1) and every page turn shows a
  latency window with low resolution (PDF.js must decode JPX/JBIG2 per page: ~1 s/page even on the desktop PC).
  Gestures, selection and highlight in B worked well.
- B uses one CORS-enabled URL scheme (IIIF) for any width → progressive low-res (400 px) → sharp (≤1200 px) → native on zoom.
- OCR word boxes (`_djvu.xml`) align with the IIIF images exactly (same pixel dimensions in all tested issues).

Known risks / follow-ups:
- **OCR download is slow**: `_djvu.xml` 2.6–5.2 MB, 18 s via CapacitorHttp on the tablet (vs 5–12 s on PC).
  → Phase 3/4: fetch once per issue, convert to compact per-page JSON (~40 % of the size, ~1/3 gzipped), store on disk;
  prefetch it with the issue download. Consider a native streaming download instead of base64-over-bridge.
- First page cold ≈ 2.4 s on network (target 1.5 s is for cached). Cache the manifest per issue; show low-res fast.
- IA availability and latency (1–3 s per image from Brazil): prefetch ±2 pages is essential; downloads fill the same cache.
- Guide leaf numbers are off by 2 in some issues → compute leaf from OCR page numbers (Part B / Phase 3).
- OCR quality is weak on covers/ads; fine for selection on body text.
- Worn/faint type on old scans (user report) → planned **"Enhance text" toggle** in the reader (Phase 3): per-page
  pre-processing of the decoded image off the main thread (levels/contrast + gamma to darken ink + mild unsharp mask),
  cached per page, so zoom/pan stay at full fps. CSS `filter: contrast()` as a zero-cost fallback.

## 2026-09-30 — Catalog extraction (Phase 1, Part B)
- **Parser:** PyMuPDF only (spans with color/size/position + link annotations + embedded images); pdfplumber not
  needed. Pages are rebuilt as position-sorted rows because the PDF content stream is out of order; links are matched
  to text by rectangle. Adapter: `tools/adapters/amazing_stories.py`; shared model/DB/report in `tools/catalog/`.
- **Type codes** are FictionMags Index item types (verified at philsp.com); table in `tools/catalog/item_types.py`.
- **Leaves:** `story.ia_leaf` stores the guide's link leaf as a *hint* (off by 2 in some issues, negative in bound
  volumes → NULL). Correction via OCR page numbers happens lazily in the app when an issue is opened (Phase 3), not at
  build time — that would mean downloading ~229 OCR files (~1 GB), i.e. crawling the collection.
- **Guide errors handled explicitly** (all listed in `docs/catalog-report.md`): May 1931 issue link points to the
  April item while its stories link to the May scan → story links win; a second "1953 Jan" heading (out of
  chronological order, probably Dec 1953/Jan 1954) shared the Jan 1953 item → kept with `availability='none'` and no
  leaves until the real date/item is confirmed.
- **Availability:** 229 `ia`, 80 `none`, 0 `hathitrust` — the guide has no HathiTrust links in issue entries (only in
  its legend). The value stays in the schema for other magazines.
- **Names:** merge only obvious variants (spacing/punctuation/case/accents, titles, degrees); never Jr./Sr.
  Pseudonym notes ("Eando Binder = Earl Binder & Otto O. Binder") are indexed in `story_fts.authors`, so searching the
  real name finds the story. Placeholders ("The Readers", "[uncredited]") are notes, not people.
- **Schema additions** beyond SPEC §3: `issue.slug`, `story_person.raw_name`, `issue_person.raw_name`, `catalog_meta`.
- **Generated catalog is not committed** (`app/public/catalog/` git-ignored): it is reproducible (byte-identical
  rebuilds, verified by a test) and derived from a guide marked "not for distribution", while the repo is public.
  Build it before `npm run build` / `cap sync`. Size: `catalog.db` 2.3 MB, covers 10.7 MB (309 × ~35 kB WebP).

## 2026-09-30 — Reader: turning pages while zoomed
User feedback: having to zoom out to change page is annoying. Spike gestures (to carry into the Phase 3 reader):
dragging a zoomed page past its left/right edge (rubber band, > 90 px) turns the page; edge taps also work when zoomed
(12 % strips instead of 25 %). A gesture turn keeps the zoom level and lands at the top-left of the next page
(bottom-right of the previous one); jumps (ToC, slider) reset to fit.

## 2026-09-30 — Phase 2 app shell
- **Navigation:** in-house stack navigator (`app/src/nav/`), no router dependency. Covered screens stay mounted with
  `content-visibility: hidden`, so Back is instant and keeps scroll/filter state. Browser history is the single source
  of Back: UI back, browser back and the Android hardware button (`@capacitor/app`) all go through `history.back()`.
- **Databases:** `catalog` (read-only, shipped in the APK, reinstalled only when `catalog.sha256` changes) and `user`
  (progress/highlights/downloads/settings, versioned migrations) are separate files, so catalog updates never touch
  user data. Android uses `@capacitor-community/sqlite`; browser dev and unit tests use `@sqlite.org/sqlite-wasm`
  (official build with FTS5 — the plugin's own web mode relies on sql.js without FTS5). The catalog DDL lives in
  `tools/catalog/schema.sql`, shared by the Python builder and the TS tests.
- **Search roles:** a role filter restricts matching to that role's FTS column (`authors`, `translators`, issue
  `editor`, issue `cover_artist`); editor/cover-artist searches return issues and people, not stories.
- **Progress:** saved (page + zoom) 800 ms after a page change, on leaving the reader and on Android `pause`.
  Guide leaves past the end of a scan are clamped to the last page (real fix: OCR page map, Phase 3).
- **Tests:** `vitest` (Vite-native) for repositories, FTS queries and the navigator; a smoke test runs against the real
  `catalog.db` when it has been built.

## 2026-09-30 — Distribution: stays personal (Play Store blockers noted)
Not legal advice; a checklist of what would have to be cleared before any public release.
1. **Magazine copyright (US):** issues published before 1930 are public domain in the US (as of 2026: 1926–1930 is
   public domain). 1931–1956 issues were protected only if their copyright was *renewed*; many pulp issues were not, but
   individual stories and cover art may have been renewed separately by their authors/artists (e.g. famous authors).
   The Internet Archive hosting a scan is not a license. Offline downloads (Phase 4) make the app a copy distributor.
2. **Catalog source:** the reference guide is marked "WIP not for distribution". Bare facts (titles, authors, dates)
   are not copyrightable, but the compilation and the cover thumbnails extracted from it are the author's work →
   needs permission or a rebuild from other sources (e.g. ISFDB / FictionMags data, checking their licences).
3. **Trademark:** "Amazing Stories" is a live brand again (revived as a magazine in the 2010s); using the name/logo in
   the store listing or icon could draw a complaint. A neutral app name is safer.
4. **Internet Archive terms:** access is intended for research/personal use; an app streaming to many users should
   respect rate limits, send an identifying User-Agent and not be monetized.
5. **Google Play process:** developer account (one-time fee, identity verification), privacy policy + Data safety form
   (even with no data collection), current target API level, and for new personal accounts a closed test with a
   minimum number of testers for 14 days before production.
Options if publishing is ever wanted: restrict to verified public-domain issues (pre-1930 + confirmed non-renewals),
own catalog data, neutral branding; or keep distributing privately (sideload / GitHub release APK).

## 2026-10-01 — App name: Banca
The app will be called **Banca** (Portuguese for "newsstand": a stand where magazines of every era hang). "Pulp
Reader" stays as the repo/working name until the design sprint renames the app (Capacitor `appName`, icon, splash,
README title). Design sprint prompt: `docs/design/artifact-prompt.md`.

## 2026-10-01 — Visual identity: "Newsprint" (design sprint)
Three directions were mocked up (A · Night Stand: dark ink-blue + neon yellow, Anton/Literata; B · Newsprint: aged
paper, Ben-Day dots, offset ink shadows, Big Shoulders Display/Source Serif 4; C · Enamel Sign: cobalt kiosk plaque,
Bungee/Newsreader). **B was chosen** as closest to the app's subject; the dark theme ("Night") takes A's ink-blue
ground and yellow glow. Fonts: Big Shoulders Display (condensed signage, fits long magazine names) for titles and
labels, Source Serif 4 (screen serif with tabular figures) for text; both OFL, to be bundled. Mockups are drawn in dp
(tablet 1280×800, assuming the A9+ runs at 1.5×; phone 412×892). Tokens, components and screen notes:
`docs/design/banca-newsprint.md`; canvas sources in `docs/design/mockups/`. Applying them to `app.css` is
implementation work for the next phase (plan first).

## 2026-10-01 — Phase 3: Banca identity + production reader
- **Identity in code**: tokens from `docs/design/banca-newsprint.md` in `app/src/app.css` (Paper default, Night via
  `data-theme` on `<html>`, saved in `user.db` settings); fonts bundled from `@fontsource` packages (no network fonts).
  App renamed to **Banca** (`appId` unchanged so the installed app keeps its data); icon/splash generated by
  `tools/brand/make_icons.py` + `@capacitor/assets`.
- **Phones**: same APK, window size classes (compact < 600 dp). Compact = bottom navigation, 1-column magazine cards,
  3-column issue grids, reader tool row in the bottom bar, pages opened fitted to the width.
- **Reader** moved out of the spike into `app/src/reader/` (the measured engine kept: gestures, prefetch tiers, OCR
  layer). Spread rule: landscape and >= 900 dp wide -> cover alone, then leaf pairs (1-2, 3-4 ...), which puts odd printed
  pages on the right in the tested scans. Reader A (PDF.js) and the spike tools were deleted.
- **Page themes** are CSS only, applied to the scan image (`filter` / `mix-blend-mode`), so zoom/pan stay compositor
  transforms: Sepia = multiply over #E6D2A6; Night = `invert(.92) hue-rotate(180deg) sepia(.25) brightness(.9)`;
  Enhance text = `grayscale(.2) contrast(1.45) brightness(1.06)` (canvas processing only if this proves insufficient on
  the device). Warm filter = multiply overlay.
- **Brightness + full screen**: a ~60-line local Capacitor plugin (`BancaDisplayPlugin.java`) instead of a dependency:
  window brightness override (restored to system on exit) and immersive system bars.
- **Page numbers from OCR, lazily in the app** (not at catalog build time): `pageMap.ts` reads header/footer numbers,
  keeps only those that agree with a neighbour, carries the previous offset across unnumbered plates; result stored in
  `user.db.page_map` per scan. Verified on the three Phase 1 issues (`realOcr.test.ts`): 1926 offset +1 (guide right),
  1940 and 1956 offset -1 (guide 2 leaves off) -> stories now open on the right page.
- **OCR and manifests cached on disk** (`@capacitor/filesystem`, app cache dir) as compact JSON: the 18 s djvu.xml
  download happens once per issue.
- **Highlights and bookmarks persisted** now (user.db v2: `bookmark`, `page_map`, `progress.page_count`); colors,
  notes, web search and export remain Phase 5.
- `loggingBehavior: 'none'` in Capacitor: the debug bridge was logging whole SQL result sets on every query.

## 2026-10-01 — Phase 5: downloads and offline reading
- **What is stored per issue** (`files/downloads/<ident>/`, the app *data* dir so Android never evicts it): `p<leaf>.jpg`
  at 1200 px (the reader's sharp size), `t<leaf>.jpg` at 200 px (strip + page index), `manifest.json`, `ocr.json`
  (compact OCR). Native resolution for deep zoom stays online-only. Measured in the browser: Apr 1926, 100 pages =
  63 MB (large-format scan); later digest-size issues are expected to be smaller.
- **One code path**: the reader asks the store for the issue's local files first; a local page skips the low-res
  placeholder and loads the 1200 px file directly; manifest/OCR come from the download before the cache and network.
- **Writing files**: `Filesystem.downloadFile` (deprecated in favour of `@capacitor/file-transfer`, but present in v8 and
  avoids a new dependency; it streams to disk natively, no base64 over the bridge). Written to `<file>.part` and renamed,
  so a file cut by an app kill never counts as complete; resume = skip files that exist.
- **Manager** (`downloads/manager.ts`, tested with a memory store): one issue at a time, 3 concurrent requests
  (IA etiquette), 5 attempts per file with 1/2/4/8 s backoff, state in `user.db.download` (v3 adds `ia_identifier`,
  `error`), interrupted downloads restart on launch. No background service: downloads only progress while the app is
  open (a WorkManager job would be a separate native piece; revisit if needed).
- **Network policy**: `@capacitor/network` (official plugin; new dependency) for connected / connection type. *Wi-Fi
  only* (default on) holds the queue on mobile data; offline holds it too. Applied only on the device (the browser
  reports a speed guess, e.g. '3g' → cellular).
- **Finding downloaded issues**: badges on all covers, *Downloaded* switch in the magazine filter band, *On this
  device* shelf in the Library, Settings → Storage list with per-issue remove and *Delete all downloads* (two-tap
  confirm). The spec's "Cloud" badge for not-downloaded issues was left out: on a 300-cover grid it is noise; absence
  of a badge means online.
- Bug caught by the tests: `bytes += await download()` in concurrent workers lost updates (reads `bytes` before the
  await); fixed by awaiting first.

## 2026-10-01 — Phase 6: highlights, notes, web search, Markdown export
- **Colors** yellow (default) / red / blue / green, no fixed meaning (the user can give them one); the selection bar
  creates a highlight in one tap and remembers the last color. Colors are plain names in `highlight.color`; no
  migration was needed (the v1 table already had `color` and `note`).
- **Editing**: a tap in the middle of the page is hit-tested against the highlight rects of the pages on screen
  (client coordinates through each page's bounding box, 8 px slack) before toggling the chrome; a hit opens the
  highlight card (color, note, search, copy, delete). While a note is being typed, window resizes from the keyboard
  are ignored so the reader does not switch between spread and single page.
- **Search web**: `@capacitor/browser` (official; new dependency) opens Google in a Chrome Custom Tab over the app, so
  Back returns to the same page. Query capped at 300 characters.
- **Export**: Markdown in the SPEC format (`# Magazine — Mon YYYY`, `## p. N — Story`, `> quote`, `Note: …`; bookmarks as
  `*Bookmark*`; non-yellow colors as `*(red)*`). Page labels use the OCR page map when the issue was opened before,
  else leaf + 1. Delivered through `@capacitor/share` (official; new dependency) from a file in the cache dir (covered
  by the existing FileProvider `cache-path`), so the user can save to Files/Drive, mail it or open it in a notes app;
  plus *Copy*. Writing straight into the public Downloads folder was skipped (scoped-storage friction).
- **Notes screen** (`#/notes`, pen icon in the masthead): all issues with notes, most recently annotated first; search
  over quote/note/story, color filter; export applies to what is shown. Story start leaves are computed by one shared
  function (`layout.computeStarts`) for the reader and the Notes screen.
- Fix after the tablet test: taps on a highlight were only checked in the middle zone, so in spreads (where most text
  is inside the 25 % edge zones) they turned the page. Highlights are now hit-tested first for every single tap
  (`PanZoom.onTapAt`). Highlights with a note get a small blue note marker at the end of their first line (tappable).
- Notes screen redesigned after the tablet test (the grid with the cover column collapsed into a one-word-wide
  column): plain rows with a color bar, `p. N · Story`, the text and the note. Highlight text is shown and exported as
  one paragraph (`cleanText`): OCR line breaks become spaces and a word hyphenated at a line end is joined when the
  next line starts lowercase (a real compound split exactly at a line end, e.g. "space-/suits", is joined too).

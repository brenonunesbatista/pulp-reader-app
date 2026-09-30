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

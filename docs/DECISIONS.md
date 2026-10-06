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

## 2026-10-01 — Phase 7 (Atlas): decisions before building
- **No AI at runtime.** The Atlas shows curated content only (offline, no API key on the device). AI may later only
  *suggest* additions into a curator inbox.
- **Content is authored by Claude Code in this repo** (web search, a source URL for every claim, image licence and
  credit), one Markdown file per entity under `content/atlas/` with `status: draft | reviewed`; the owner reviews; a
  builder writes `atlas.db`. No API key or paid pipeline needed.
- **Language:** English, like the rest of the app.
- **Pilot path:** "From Wells to Foundation" (Wells → Amazing Stories 1926 → Golden Age → Asimov, whose first story
  "Marooned off Vesta" is in Amazing Stories, March 1939 → Foundation on screen), ~30–40 entities.
- **Design:** the owner designs the Atlas screens in Claude Artifacts (prompt: `docs/design/atlas-artifact-prompt.md`);
  sub-phases 7a design → 7b pilot content → 7c app → 7d saved timelines / curator inbox / more paths.

## 2026-10-01 — Phase 7b: Atlas content format and pilot path
- **Format:** one Markdown file per entity with **TOML** front matter between `+++` lines (Python 3.11 reads TOML with
  the standard library, so no YAML dependency). Fields and link meanings: `content/atlas/README.md`. Links are stored
  in one direction; the builder will derive inverses. Every factual sentence cites a numbered source.
- **Validator** `tools/atlas/validate.py` (+ pytest): ids = file names, types/lanes/dates, themes exist, links resolve,
  citations match sources, and catalog references (magazine/issue/story) exist in `catalog.db`.
- **Pilot "From Wells to Foundation":** 37 entities (6 people, 2 magazines, 1 issue, 1 cover artwork, 9 literary works,
  6 film/TV/radio, 1 album, 3 events, 1 movement, 6 themes) and a 19-stop path. Sources: Wikipedia articles fetched on
  2026-10-01, plus the catalog itself.
- **Finding:** all four Asimov stories in *Amazing Stories* (incl. "Marooned off Vesta", March 1939) are in the
  catalog but have **no Internet Archive scan**; the Wells reprints (The Time Machine, May 1927; The War of the Worlds,
  Aug–Sep 1927; The New Accelerator, Apr 1926) are readable. The path says so instead of offering "Read in Banca".
- Not yet added (need checking before they go in): IMDb/Spotify ids, Wikimedia images with licences, Wikidata ids.

## 2026-10-01 — Atlas design (mockups)
Tablet and phone mockups for Atlas home, Timeline, Entity page, Path and Want-to lists (Paper; Timeline and Entity
also Night) plus an Atlas component board, in the design canvas (page "Atlas"); sources in `docs/design/mockups/`,
spec in `docs/design/banca-atlas.md`. Timeline layout: **overview strip + stage of decade/year columns** with a side
(tablet) or bottom (phone) sheet, chosen over parallel swimlanes because images stay visible, it scales by grouping
("+N more") and needs no connection lines. Connections are shown as relation tags, overview pins and grouped lists.
Three new lane colors (teal, magenta, warm grey); Night borders use `--edge #4A5276`. The mockups show "Read in
Banca" on *Marooned off Vesta*, which has no scan; the spec adds the "in the catalog, no scan yet" state.

## 2026-10-01 — Phase 7c: Atlas images on demand, external ids, new link types
- **Images are not bundled** (owner's choice): entities store a Wikimedia Commons URL (960 px thumb) with credit,
  licence and source page; the app loads them online and shows the halftone placeholder when offline. Pulp covers use
  the catalog's own WebP covers.
- `tools/atlas/suggest_media.py` takes each entity's Wikipedia article and asks the MediaWiki/Wikidata APIs, in
  batches of 50 titles (≈ 4 requests total, after per-entity requests hit HTTP 429), for the lead image (Commons only,
  free licences only) and IMDb (P345) / Spotify album (P2205) ids. Suggestions are curated by hand: 15 Commons images
  kept (portraits, first-edition covers, posters in the public domain, Hiroshima, Sputnik CC BY-SA, WWII Bundesarchiv
  CC BY-SA), 2 entities use catalog covers, George Pal's suggestion (the 1953 poster) was rejected. IMDb ids for the
  five films/series and the Spotify album for Jeff Wayne's album.
- Link types from the design spec added to the format: `collected_in` (Runaround → I, Robot) and `cover_of` (the
  August 1927 cover → The War of the Worlds). "Same theme" is derived from `themes`.

## 2026-10-01 — Phase 7c: Atlas in the app
- **Third database** `atlas.db` (read-only, shipped like the catalog; `copy-databases.mjs` rebuilds it from
  `content/atlas` on every dev/build run and one sha covers both shipped dbs). User data in `user.db` v4: `want_to`
  (entity, list read/watch/listen/see, done) and `atlas_visit` (first/last/count) — entity ids are stable strings.
- **Recommendations** (`atlas/recommend.ts`): sum of weighted signals around an entity — read next 10, adapted 8,
  influenced 7, created/cover/collected 5, published 4, context 3 (×0.8 seen from the other side; a backwards "read
  next" ×0.2), same theme 4, next path stop 6, same year in another lane 1.5. The strongest contribution names the
  reason. User history: done ×0.2, on a list ×0.8, read in Banca ×0.5, visited ×0.6. Home seeds = entities read in
  Banca (via catalog refs of issues with progress) + the last 5 visits; with no history, the path start.
- **Timeline** follows the spec's layout B: overview strip + stage of decade (6) / year (9) columns with scroll-snap,
  only visible columns ±1 render their cards, max 4/3 cards then "+N more"; no connection lines (tags, pins and the
  sheet instead). Phones: vertical grouped list + peek bottom sheet with a horizontal row of connections.
- **Read in Banca** resolves the content's catalog refs at runtime (magazine slug + month + story title → issue/story);
  an issue without a scan shows the dashed "In Amazing Stories · no scan yet" button that opens the Issue screen.
- Works on the Books lane are labelled "Book", others "Story". The masthead subtitle now shrinks before the title.

## 2026-10-03 — Phase 7d: saved timelines, subject timelines, curator inbox
- **Second path** "From R.U.R. to the Thinking Machine" (20 new entities, reviewed). The Atlas home features the path
  in progress (most recently explored), else the first not started; the others are listed. "Next on your path" works
  across all paths (`recommend` takes `string[][]`).
- **Saved timelines** in `user.db` v5 `saved_timeline` (name + JSON spec: zoom, hidden lanes, first visible year,
  selection, subject). A subject is stored as the search text and recomputed on open, so new content shows up.
- **Subject timeline** = Atlas FTS matches + every entity directly linked to them + members of a matched theme
  (`atlas/subject.ts`, pure). No AI: only curated links.
- **Curator inbox** in `user.db` v5 `atlas_inbox`: suggestions (with the page they came from) and Atlas searches with
  no result (≥ 3 characters, recorded after 1.5 s without typing, one row per text with a count). Settings → Atlas inbox
  exports it as Markdown (share sheet / copy) for the curation conversation.
- Home lists ("Your timelines") reload when the screen becomes visible again (screens below stay mounted).

## 2026-10-03 — Phase 7e: adding items to saved timelines (user request)
- `user.db` v6 `timeline_item(timeline_id, entity_id | title+year+lane, note, url)`; one row per Atlas entity per
  timeline (partial unique index). Deleting a timeline deletes its items; "Save as new" copies them.
- A timeline shows its added Atlas entries even outside its subject, plus the user's own items in the lane they chose
  (dashed card, "YOURS"); spec flag `mine` = *Only what I added*. Only entries with a lane and a year can be added
  (people/themes are not on the timeline). Composition is pure (`timelineEntries` in `atlas/subject.ts`, tested).
- Own items never leave the device and are not part of the curated Atlas; they are user data like highlights.
- A saved timeline's *Save* now updates it in place (and renames); *Save as new* makes a copy.
- Phase 8 decided with the user: 8a categories + generic IA collection adapter + F&SF, Galaxy, Fantastic, Twilight
  Zone (issue-level contents first); 8b packs (Dragon, Dungeon); 8c comics (all titles on the user's list, personal use,
  accepting that IA may remove items).

## 2026-10-03 — Phase 8a: categories and Internet Archive collections
- **Sources list** `tools/sources.toml`: categories (pulp, rpg, comics) and magazines with their adapter. The catalog is
  one database for all magazines (`category` table, `magazine.category_id` + `sort`, schema_version 2).
- **Collection snapshots** in `tools/sources/ia/<collection>.json` (committed, ~300 KB for four collections): the
  collection's search results (identifier, title, date, image count, has JP2 / OCR, restricted). Builds read them, so they
  are reproducible and offline; `--refresh` re-reads them (one advancedsearch request per 1000 items, 1 s apart,
  descriptive User-Agent).
- **Dating a scan**: `YYYY-MM` in identifier/title, else `Month YYYY` (also abbreviated), else season (Winter 1,
  Spring 4, Summer 7, Fall 10), else `MonYY` at the end of the identifier, else the metadata date (Jan 1 is a year-only
  placeholder and is ignored). Volume/number from `v01n02`, `v-01-n-02`, `Volume 2, Number 11`.
- **One issue per date**: the best scan wins — readable (JP2 + OCR, not lending-only) first, then penalties: missing
  pages −30, foreign reprint (World Editions, UK, Australian) −40, ads removed −15, image/PDF re-upload −5, modified −5,
  then most pages. The others go to `issue_scan` (alternates; no UI yet). Two scans with different known volumes/numbers
  on the same date stay two issues ("May 1975 (vol. 48 no. 5)"). Anthologies, foreign editions, the Galaxy novel series
  and compilations are excluded by a pattern per magazine; every skipped item is listed with its reason in
  `docs/catalog-sources.md`.
- Result: F&SF 596 issues (1949–2007), Galaxy 249 (1950–1980), Fantastic 180 (1952–1980), Twilight Zone 60 (1981–1989);
  1,394 issues in all, `catalog.db` 2.8 MB.
- **Covers** of IA-sourced issues are not shipped: `coverPath = "ia:<identifier>"` resolves to
  `archive.org/services/img/<id>` (~180 px, ~19 KB) in grids and `archive.org/download/<id>/page/cover_medium.jpg`
  (~100 KB) on the issue page; the WebView's HTTP cache keeps them. Offline, a blank cover is shown.
- **Contents**: none yet for these magazines (the issue page says so; the reader's page index is the way in). Candidate
  source for later: ISFDB, after checking its data licence.
- Issue cards (search, person pages) now show the magazine name; the RPG tab lists RPG magazines once indexed.
- **Stable issue ids** (user.db keys progress, highlights and downloads by issue id): Amazing Stories keeps its ids
  1–309; every other magazine has a `block` in sources.toml and its ids are block × 10,000,000 + year × 1000 +
  month × 10 + n. Refreshing a collection or adding a magazine never moves an existing id.

## 2026-10-03 — Phase 8b: pack items (Dragon, Dungeon)
- **Packs**: one IA item holds every issue as a sub-book (`<stem>_jp2.zip`, `<stem>_djvu.xml`, `<stem>_scandata.xml`).
  Dragon `DragonMagazine260_201801`: #1–#430 (no #305, #379) + 15 specials (annuals, best of, web supplements);
  Dungeon `dungeon-magazine`: #1–#221. The catalog stores such a scan as `<item>/<stem>` in `ia_identifier`, so
  progress, page maps, highlights and downloads work unchanged; downloads use a flattened folder name.
- **Pages**: the item's IIIF manifest covers only its first book, so the page list comes from the sub-book's scandata
  (pages with `addToAccessFormats=false` skipped, sizes from the crop box; ~20–40 KB, fetched natively like the OCR).
  Images: IIIF `<item>/<stem>_jp2.zip/<stem>_jp2/<stem>_NNNN.jp2` — but IIIF answers 404 for any name containing `#` or
  `&` (Dungeon #1–#99, "Dungeon Magazine # 1 - … & …"; every encoding tried), so those use the BookReader page URL
  `archive.org/download/<item>/page/n<i>_w<width>.jpg?subPrefix=<stem>` (redirects to the data server). That URL sends
  no CORS headers: the reader's image loader shows it through a plain `<img>` (HTTP cache) instead of fetch → blob.
  First page of a pack issue: several seconds the first time (IA extracts it from the zip); later pages are prefetched.
- **Dates**: sub-book names carry only issue numbers. `tools/catalog/pack_dates.py` reads the first 40 KB (then 400 KB)
  of the OCR text of anchor issues (first, every 10th, last; one ranged request each, 1 s apart, cached in
  tools/spike/out/ocr_heads), fills monthly runs between anchors and bisects irregular stretches; dates read out of
  order are re-picked between their neighbours. Dragon: 72 read, the rest interpolated; #2–#9 (1976–77) are spread
  evenly between #1 (Jun 1976) and #10 (Oct 1977). Dungeon's 1986–2003 OCR has no printed date (it is in the cover
  art), so `sources.toml` holds its schedule from the masthead ("published bimonthly" to #97, monthly from #98) and OCR
  anchors (#1 Oct 1986, #63 Feb 1997, #64 Oct 1997 after TSR's 1997 pause, #150 Sep 2007, #155 Jun 2008, #221 Dec 2013).
  Specials without a readable date take the year in their name (annuals) or their issue's date (web supplements);
  "The Best of Dragon Vol. 1" has neither and is skipped.
- **Ids**: block × 10,000,000 + number × 10 (Dragon block 6, Dungeon block 7); specials block × 10M + 9M + crc32(stem).
- 663 RPG issues; catalog 2,057 issues, 3.1 MB.

## 2026-10-06 — Phase 8c: comics
- **12 titles, 823 issues/volumes**, all IA pack items with page sets + OCR + scandata, read through the pack adapter:
  Amazing Spider-Man / Daredevil / Captain America Masterworks, Hellblazer (Portuguese scans), Turok Son of Stone,
  A Espada Selvagem de Conan (Abril; the "Em Cores" run in the same item is its own series), Conan the Barbarian #1–24,
  Miracleman (Eclipse), Swamp Thing Bronze Age Omnibus, The Complete Peanuts, Asterix. Category `comics`, a COMICS tab
  (tablet masthead and phone bottom nav, now 5 items). Personal use; the user accepted that IA may remove items.
- **Year only** (`year_only`; catalog `month = 0`, shown as the year): comics OCR is lettering, so no cover dates. Years
  come from the file name where it has one (Masterworks: the edition year; Peanuts: the strips' first year; some Turok
  issues), else from `year_anchors` in sources.toml (first/last issue of a run: Hellblazer 1988–2013, Conan the Barbarian
  1970–1973, Miracleman 1985–1989, A Espada Selvagem de Conan 1984–2001 read from the OCR; Asterix: each album's
  original year), interpolated linearly in between — approximate by a year for irregular runs (Turok).
- Titles from a per-series template (`{name} #{n}`, `{name} Vol. {n}`, Asterix album names) and `titles` overrides;
  scan-group tags are dropped. Grids show "#12" / "Vol. 3" / the album title where pulp shows the month.
- **Spreads per magazine**: catalog `magazine.spreads` ('auto' | 'never', schema v3; Peanuts = never, its pages are wide
  strips) and a user override per magazine slug in settings (`spreads`). Display panel: *Two pages side by side: In
  landscape / Never*, applied at once (layout rebuilt).
- Catalog: 19 magazines, 2,880 issues, 3.4 MB.

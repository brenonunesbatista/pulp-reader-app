# Phase 1 — Reader spike + catalog extraction

Read `SPEC.md` and `CLAUDE.md` first. Use plan mode: show me a plan, wait for approval. Work in two parts; **stop and report after Part A** before starting Part B.

## Part A — Reader spike (throwaway-quality code is OK, findings are not)

Goal: decide how the reader gets pages + text, and prove it is fast on the Galaxy Tab A9+.

1. Scaffold the repo per `CLAUDE.md` (`app/` with Vite + React + TS + Capacitor Android; git init; `.gitignore` including `data/source/`).
2. **Investigate the Internet Archive** for one issue, `AmazingStoriesVolume01Number01` (Apr 1926), then repeat for one issue from ~1940 and one from ~1955 to check consistency. Use the metadata API (`https://archive.org/metadata/<id>`) and files listing. Determine and document in `docs/archive-findings.md`:
   - which per-page image sources exist (e.g. jp2 zip, IIIF image API, `BookReaderImages`/page-image endpoints), URL patterns, available sizes, average bytes per page at a size good for a 1920x1200 screen;
   - which OCR-with-coordinates source exists (hOCR, `_djvu.xml`, `_chocr.html.gz`, etc.), its size, and how to map words to normalized page coordinates;
   - whether CORS allows fetching from the app WebView; if not, how to fetch natively (Capacitor `CapacitorHttp`) and store files;
   - whether the `page/nXX` leaf numbers in the reference guide match the image/OCR indexing (leaf 0-based) and any offset;
   - the full-PDF size for comparison; whether the file is downloadable (not lending-only);
   - rate-limit/etiquette observations.
   Write small scripts in `tools/spike/` for this; do not guess — record real responses and numbers.
3. **Prototype reader B** (page image + invisible OCR text overlay): single page, swipe/tap to turn, pinch-zoom/pan, long-press text selection, one-color highlight saved in memory (normalized rects), progressive loading + prefetch. Test in the desktop browser first, then run on the tablet.
4. **Baseline reader A** (PDF.js) with the same issue's PDF, minimal: page turn, pinch-zoom, text selection.
5. **Benchmark both on the tablet** (I will run it and give you numbers/observations; give me a checklist and simple on-screen FPS/timing overlay): time to first page, page-turn latency, zoom/pan smoothness, memory, selection accuracy on the OCR text, bytes per page/issue.
6. Write `docs/DECISIONS.md` entry with the recommendation (B or A) and known risks. Then **stop and report**.

## Part B — Catalog extraction (after I approve Part A)

Input: `data/source/Amazing_Stories_Reference_Guide.pdf` (500 pages, ~300 issues, 1926–1956, by Tak Kurosaki). Structure per issue: heading `Amazing Stories YYYY Mon  cover by <artist>`, a cover thumbnail image, a green "Read issue at Internet Archives" hyperlink (URI `https://archive.org/details/<identifier>`), auction/ABE blocks (ignore in v1), and "Contents include:" with lines like `62) The Man from the Atom [Kirby]  · G. Peyton Wertenbaker · ss`. Each story title is a hyperlink to `https://archive.org/details/<identifier>/page/n58/mode/2up` (the `n58` is the leaf number). Entries can wrap over several lines (translator info, "[Part 1 of 2]"). Type codes seen: `ed` (editorial), `ss` (short story), `n.`/`nv`/`na` (novel/novelette/…), `pm` (poem) — collect the full set of codes actually present and document their meaning. Some lines are green (IA/HathiTrust link) and some are not; some issues may only link to HathiTrust or nothing.

Build `tools/build_catalog.py` (Python, pdfplumber/PyMuPDF; use link annotations by position, not just text):
1. Parse issues → `issue`, stories → `story`, people → `person`/`story_person`/`issue_person` per `SPEC.md` §3. Editors appear as `ed`; cover artist from the heading. Normalize names (trim, unify obvious variants) but keep the raw string.
2. `availability`: `'ia'` if an archive.org identifier exists, `'hathitrust'` if only HathiTrust, else `'none'`.
3. Extract each cover thumbnail from the PDF, resize to ~300 px wide WebP, store in `app/public/catalog/covers/<slug>.webp`.
4. Output `app/public/catalog/catalog.db` with FTS5 tables (prefix search, unicode61 with accent removal).
5. Print a validation report: issue count by year, story count, issues without IA link, without cover, without stories, unusual type codes, entries that failed to parse. Write it to `docs/catalog-report.md`. Aim for zero silent drops.
6. `pytest` tests with a few fixture pages (including wrapped lines, translators, multi-part serials, and an issue with no IA link).
7. Do not include the auction/ABE data, and do not commit the source PDF.

Definition of done for Phase 1: findings + decision documented, spike runs on the tablet, catalog.db builds reproducibly with a clean report. No app UI beyond the spike.

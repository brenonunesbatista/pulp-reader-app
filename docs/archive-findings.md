# Internet Archive findings (Phase 1, Part A)

Measured 2026-09-30 from the dev PC (Brazil, home connection) with the scripts in `tools/spike/`
(raw responses in the git-ignored `tools/spike/out/`). Requests were throttled to 1/s with a descriptive
`User-Agent` (`tools/spike/ia_common.py`).

Issues tested:

| Issue | Identifier | Leaves (IIIF canvases) | `imagecount` | Native page size (px) |
|---|---|---|---|---|
| Apr 1926 | `AmazingStoriesVolume01Number01` | 100 | 100 | 1056–1256 × 1550–1650 |
| Mar 1940 | `Amazing_Stories_v14n03_1940-03_cape1736` | 148 | 149 | 1818–2089 × 2884–2996 |
| Mar 1956 | `Amazing_Stories_v30n03_1956-03` | 130 | 131 | 872–984 × 1252–1429 |

(No 1955 issue has an IA link in the guide; Mar 1956 is the closest.) Identifiers do **not** follow a pattern
(229 distinct ids in the guide, e.g. `AmazingStoriesV24N11195011`, `Amazing_Stories_v25n06_1951-06_Gorgon776_Missing_ibcbc`,
`amazing-stories-v-26n-09-1952-09`), so the catalog must store the identifier from the guide's link verbatim.

## 1. Files per item (`https://archive.org/metadata/<id>`)

All three items: public (no `access-restricted-item`), collections `amazingstoriesmagazine`, `pulpmagazinearchive`.
1926 carries a Public Domain Mark; the others have no rights field.

| File | 1926 | 1940 | 1956 |
|---|---|---|---|
| `<id>.pdf` (Text PDF) | 6.39 MB | 8.67 MB | 3.05 MB |
| `<id>_jp2.zip` (all page JP2s) | 40.2 MB | 127.5 MB | 25.0 MB |
| `<id>_djvu.xml` (OCR + word boxes) | 5.22 MB | 4.58 MB | 2.60 MB |
| `<id>_djvu.txt` (plain OCR) | 0.58 MB | 0.48 MB | 0.28 MB |
| `<id>_scandata.xml` | 0.03 MB | 0.04 MB | 0.04 MB |
| hOCR / `_chocr.html.gz` / `_page_numbers.json` | — | — | — |

These are older derivations (ABBYY FineReader 8 OCR): **no hOCR and no `_page_numbers.json`**; `_djvu.xml` is the only
OCR-with-coordinates source. The PDF is directly downloadable (not lending-only).

## 2. Page images

Endpoints tested (leaf = 0-based canvas index):

| Endpoint | Pattern | CORS | Notes |
|---|---|---|---|
| **IIIF Image API 3** | `https://iiif.archive.org/image/iiif/3/<id>%2F<id>_jp2.zip%2F<id>_jp2%2F<id>_NNNN.jp2/full/<w>,/0/default.jpg` | `*` ✅ | Any width ≤ native; width > native → **HTTP 400** (no upscaling). Service ids come from the manifest. |
| IIIF manifest | `https://iiif.archive.org/iiif/3/<id>/manifest.json` | ✅ | 120–200 kB; canvas list with width/height and image-service id per leaf. |
| BookReaderImages.php | `https://<server>/BookReader/BookReaderImages.php?zip=<dir>/<id>_jp2.zip&file=<id>_jp2/<id>_NNNN.jp2&id=<id>&scale=<1,2,4>&rotate=0` | ✗ | Only power-of-2 reductions. |
| `/download/<id>/page/nXX.jpg` | redirects to BookReaderImages | ✗ | Full size only; `_w<width>` suffix ignored. Slowest (redirect). |

Measured over 8 leaves per issue (bytes are JPEG sizes; latency = full download incl. TLS, from Brazil):

| Variant | 1926 avg kB | 1940 avg kB | 1956 avg kB | Median latency |
|---|---|---|---|---|
| IIIF `w=400` (low-res placeholder) | 92.9 | 74.5 | 77.0 | 1.1–1.4 s |
| IIIF `w=800` | 340.7 | 248.7 | 233.5 | 1.5–1.8 s |
| IIIF `max` (native) | 559.5 (≈1150 px) | 1057.7 (≈2000 px) | 285.1 (≈930 px) | 1.7–3.1 s |
| BookReader scale=1 | 508.7 | 981.7 | 231.1 | 1.6–2.0 s |
| BookReader scale=2 | 168.4 | 326.8 | 80.4 | 1.1–1.4 s |

Estimated per-issue totals: `w=400` ≈ 9–11 MB; `w=800` ≈ 30–37 MB; native ≈ 28 MB (1956) to 156 MB (1940).

**Choice for the reader:** IIIF only (CORS-enabled, arbitrary width, one URL scheme for every item).
Low-res `w=400` first, then sharp `w=min(native, 1200)` (portrait page on the 1200 px-wide tablet screen).
Download-for-offline uses the same sharp width. Latency is high (≈1–3 s per request), so **prefetching ±2 pages is essential**;
a cached page must never wait on the network.

## 3. OCR with coordinates (`_djvu.xml`)

Structure: one `<OBJECT width height>` per leaf (same order and **identical dimensions** as the IIIF canvases in all 3
issues → no scaling offset), then `LINE` → `WORD coords="left,bottom,right,top[,baseline]"` in page pixels, origin top-left.
Normalized box = `(left/W, top/H, right/W, bottom/H)`. Implemented in `tools/spike/ia_ocr.py`.

| | 1926 | 1940 | 1956 |
|---|---|---|---|
| djvu.xml download | 5.2 MB, 12.3 s | 4.6 MB, 6.1 s | 2.6 MB, 5.8 s |
| words / page (avg, max) | 1003, 1240 | 556, 1025 | 371, 504 |
| pages with no words | 0 | 7 | 0 |
| compact per-page JSON (avg) | 40.6 kB (13.1 kB gz) | 22.5 kB (7.8 kB gz) | 14.9 kB (5.2 kB gz) |
| compact JSON whole issue | 4.1 MB (1.3 MB gz) | 3.3 MB (1.2 MB gz) | 1.9 MB (0.7 MB gz) |

OCR quality: good on body text, noisy on covers/illustrations/ads (e.g. `Jlpril,` for "April,"). Fine for selection
and highlights; not for reflow without cleanup.

Plan: fetch `_djvu.xml` once per issue (when first opened or downloaded), convert to compact per-page JSON
(`[text, x0, y0, x1, y1, line]`) and cache it; the reader only ever loads per-page JSON.

## 4. CORS / how the app fetches

Verified with real `fetch()` from a browser page (origin `https://example.com`), not only with headers:

| Resource | Browser fetch |
|---|---|
| `archive.org/metadata/<id>` | ✅ |
| IIIF manifest + IIIF images | ✅ |
| `/download/<id>/<id>_djvu.xml` (and direct `iaXXXX` server URL) | ❌ no `Access-Control-Allow-Origin` |
| `/download/<id>/<id>.pdf` | ❌ |
| BookReaderImages.php | ❌ (fine for `<img>`, not for `fetch`) |

→ On Android: fetch `_djvu.xml` / PDF **natively** with `CapacitorHttp` (bypasses CORS), store with Capacitor Filesystem.
Images can use `fetch` directly (IIIF), so image caching can be done in JS (blob → Filesystem/Cache).
In the desktop dev browser the spike uses a Vite dev-server proxy (`/ia-download/*` → `https://archive.org/download/*`).

## 5. Leaf numbers in the reference guide vs. IA indexing

- IA's `page/nXX` = 0-based index into the item's **access** leaves = IIIF canvas index = `_djvu.xml` OBJECT index.
  `imagecount` can be one more than the canvas count (1940, 1956); always use the manifest/OCR count.
- The guide's story links always use **`n = printed page + 1`** (a formula, not verified per issue).
- Checking against printed page numbers read from the OCR header/footer (`tools/spike/ia_pagemap.py`) and by eye:

| Issue | Real relation (OCR, % of leaves agreeing) | Guide link correct? |
|---|---|---|
| 1926 | `leaf = printed + 1` (72/76 numbered leaves) | ✅ yes (e.g. p.62 "The Man from the Atom" at n63 — verified visually) |
| 1940 | `leaf = printed − 1` (121/121) | ❌ 2 leaves too far (p.8 "Black World" is at n7, guide says n9; n9 shows p.10) |
| 1956 | `leaf = printed − 1` (109/122) | ❌ mostly 2 too far (p.114 at n113, guide n115); guide's own page numbers are sometimes off too ("The Iron Virgin" listed p.8, printed p.10, which happens to be n9) |

**Consequence for Part B:** treat the guide's leaf as a hint. Store `page_printed` and compute `ia_leaf` per issue from the
OCR page-number map (median `leaf − printed` offset) when the issue's OCR is available, falling back to the guide value.
This needs one `_djvu.xml` download per issue (2.6–5.2 MB) — to be decided in Part B whether to do it at catalog-build
time for all ~229 IA issues (≈1 GB, throttled) or lazily in the app on first open (preferred: no bulk crawl).

## 6. Full PDF (reader A baseline)

3.0–8.7 MB per issue — **3–10× smaller** than the IIIF `w=800` images for the whole issue, but it is an MRC-compressed
scan (text layer from the same OCR) and needs native fetch (no CORS). Rendering cost is on the device (PDF.js), see benchmark.

## 7. Rate limits / etiquette

- ~150 requests at 1 req/s across the three items: no 429/503, no throttling headers seen.
- `/download/...` redirects to a datanode (`dnXXXXXX.ca.archive.org` / `.eu.`), adding a round trip.
- App rules: descriptive `User-Agent`, max 3–4 concurrent requests (downloads), cache everything, never pre-fetch whole
  collections.

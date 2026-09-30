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

# Reader spike — tablet benchmark checklist (Galaxy Tab A9+)

Run the spike app on the tablet (`cd app && npx cap sync android && npx cap run android`), Wi-Fi on,
tablet in **portrait**, battery saver **off**. The green overlay (bottom-right) shows live numbers;
tap it to reset `min fps` / `long` frames before each gesture test.

Overlay fields: `fps` (current) · `min` (lowest 1-s window since reset) · `long` (frames > 25 ms) ·
`mem` (JS heap used/total) · `net` (bytes downloaded this session) · `first page` · `turn last` /
`turn med/p90` (tap → new page painted; `(cached)` = page was already decoded) · `text layer` (build time) ·
`ocr download` / `ocr parse` (B) · `pdf download` / `pdf open` / `render` (A).

Do every step for **B** first, then **A**, on **Apr 1926** (and, if time allows, **Mar 1940** — biggest images).
Force-stop the app between B and A (Settings → Apps → Pulp Reader → Force stop) so each starts cold.

| # | Step | What to record |
|---|---|---|
| 1 | Open issue from the home screen, wait until page 1 is sharp | `first page` |
| 2 | Wait ~10 s (prefetch), then tap the **right edge** 20 times, ~1 turn per second | `turn med/p90`, how many were `(cached)`, any blank/blurry flashes |
| 3 | Swipe left/right 10 times quickly | does the page follow the finger? stutter? |
| 4 | Tap overlay (reset), pinch-zoom in/out continuously for ~10 s on a text page | `min` fps, `long` frames, does the zoomed page get sharp after release (B loads full-res) |
| 5 | Zoomed in: pan around with flings for ~10 s | `min` fps, inertia feel |
| 6 | Double-tap centre (zoom 2.5×), double-tap again | smooth? |
| 7 | **B:** "OCR boxes" button → red boxes over words; compare with the scan on 2 pages (a text page and the story page via **Story n63**) | boxes aligned? (yes/mostly/no) |
| 8 | Long-press a word, drag the selection handles over 3–4 lines | does native selection work? handles follow the text? selected text sensible (Copy → paste somewhere)? |
| 9 | **B:** tap **Highlight** on the toolbar | yellow rects on the right words? |
| 10 | Jump **+10** a few times | `turn last` for an uncached page (network) |
| 11 | After ~40 pages: note `mem`, and in `chrome://inspect` (below) the tab's memory | memory stable or growing? |
| 12 | Airplane mode on, turn to an already-visited page and to a new page | what happens (expected: cached works, new page stays blank — offline is Phase 4) |
| 13 | Overall feel: which one is nicer to read? | free text |

## Memory via Chrome remote devtools
1. Tablet: Settings → Developer options → USB debugging on; connect USB.
2. PC Chrome: `chrome://inspect/#devices` → Pulp Reader WebView → **inspect**.
3. Performance monitor (Ctrl+Shift+P → "Show Performance monitor"): note *JS heap size*, *DOM nodes*.
4. Optional: `adb shell dumpsys meminfo local.pulpreader | findstr TOTAL` before and after step 11.

## Results (fill in)

| Metric | B (IIIF + OCR) | A (PDF.js) |
|---|---|---|
| First page (cold) | | |
| Page turn, cached (median / p90) | | |
| Page turn, network | | |
| Pinch-zoom min fps / long frames | | |
| Pan min fps | | |
| Sharp when zoomed? | | |
| Selection works / accuracy | | |
| Highlight correct? | — | |
| JS heap after 40 pages | | |
| `dumpsys meminfo` TOTAL | | |
| Bytes after 20 pages (`net`) | | |
| Subjective | | |

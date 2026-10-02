# Banca — Atlas design spec (v0.1, 2026-10-01)

Mockups: Claude Design canvas <https://claude.ai/artifact/5E8QSLiLmr21jYgZiDjr8K>, page **Atlas**
(components, tablet Paper, tablet Night, phone Paper, phone Night, and the two explored timeline options).
Builds on [banca-newsprint.md](banca-newsprint.md); only what is new is listed here. Sizes are dp (= CSS px).
Sample content is the pilot path "From Wells to Foundation"; texts marked `[…]` are placeholders to be curated.

## Screens
| Screen | Tablet (1280×800) | Phone (412×892) | Interactive in the mockup |
|---|---|---|---|
| Atlas home | `TabAtlasHome` | `PhAtlasHome` | links to every screen |
| Timeline | `TabTimeline` (+ `TabTimelineNight`) | `PhTimeline` (+ `PhTimelineNight`) | select item, zoom Decades/Years, lane filter (tablet) |
| Entity page | `TabEntity` (+ `TabEntityNight`) | `PhEntity` (+ `PhEntityNight`) | type switcher (person/story/film/music/art/theme/event), Want-to toggle |
| Path | `TabPath` | `PhPath` | select stop, Next stop |
| Want to… | `TabWantTo` | `PhWantTo` | tabs, mark done / undo |
| Components | `AtlasDS` | — | — |

## New tokens

```css
:root {                                   /* Paper: fill / text on fill */
  --lane-mag:   #C8321F; --on-lane-mag:   #FFF4DC;   /* magazines & stories (= --pulp-red) */
  --lane-book:  #1F4E8C; --on-lane-book:  #F7EEDA;   /* books (= --press-blue) */
  --lane-film:  #2A2118; --on-lane-film:  #EFE0C2;   /* film, TV, radio (= --ink) */
  --lane-music: #2E7D6E; --on-lane-music: #F7EEDA;   /* new: print teal */
  --lane-art:   #F2B705; --on-lane-art:   #2A2118;   /* visual art (= --pulp-yellow) */
  --lane-comic: #B0457E; --on-lane-comic: #FFF4DC;   /* new: process magenta */
  --lane-world: #7D6B55; --on-lane-world: #FFF4DC;   /* new: warm grey, world events */
  --edge: var(--ink);                                 /* 2 px borders of buttons/cards */
  --rel-influence: #C8321F; --rel-adapt: #1F4E8C; --rel-theme: #2E7D6E;
  --rel-publish: #2A2118;  --rel-next: #8A6A00;      /* link-type colors */
}
:root[data-theme="night"] {
  --lane-mag: #FF5A44; --lane-book: #86A8F0; --lane-film: #F1E4C6; --lane-music: #5BC0A8;
  --lane-art: #FFC93C; --lane-comic: #E07AAE; --lane-world: #B8A68A;
  --on-lane-mag: #0E1222; /* …all --on-lane-* are #0E1222 at night */
  --edge: #4A5276;                         /* ink borders would glare on the dark ground */
  --shadow-print: 3px 3px 0 rgb(0 0 0 / .55);
  --rel-influence: #FF5A44; --rel-adapt: #86A8F0; --rel-theme: #5BC0A8; --rel-publish: #F1E4C6; --rel-next: #FFC93C;
  --sel-glow: 0 0 24px rgb(255 201 60 / .3);  /* the only blurred shadow; selected timeline item only */
}
```
All lane fill/text pairs are ≥ 4.5:1. Lanes are told apart by label and position as well as color (overview rows
are in a fixed order; badges carry icon + text).

Sizes: `--tl-card-w` decade 134 / year 88 (computed from column count), `--tl-thumb-h` 54 / 40, overview height 92
(tablet) / 62 (phone), overview row 8 / 5, side sheet 380 (tablet), bottom sheet 214 (phone), entity hero 286 wide ×
340 portrait / 286 square / 180 wide (phone: full width × 250 / 240 / 170).

## Components (AtlasDS)
- **Entity type badge:** 26 high, radius 3, 14 px icon + label 11/700 caps +0.1em. Fill = lane color. Person and theme
  are outlined (2 px ink) because they are not forms of art. Types: book, story, magazine, film, series, music,
  visual art, comic, event, person, theme (radio and album use the film/music badge with their own label).
- **Link type chip:** 32 high pill, 2 px border and text in the link color: Influenced / Influenced by (red), Adapted
  as / Adapted from (blue), Same theme (teal), Published in / Cover of / Collected in (ink), Read next (ochre).
  Every link is stored once and shown with its inverse from the other side.
- **Timeline item (stage card):** thumb (54/40) with 4 px lane-color bottom edge, title 13/600 (2 lines max), meta
  12 "1938 · Radio". States: normal (1.5 px ink border); **selected** (yellow fill, 2 px border, print shadow; Night:
  glow); **connected** (2 px red border, 3 px red offset shadow, red relation tag over the top-left corner);
  **dimmed** (opacity .5 when something is selected and the item is not connected); **readable** (round red "R"
  stamp top-right). Group: dashed "+N more" button (40 high) at the bottom of the column.
- **Recommendation card:** yellow reason strip on top (11/700 caps, e.g. BECAUSE YOU READ · SAME THEME: ROBOTS ·
  ADAPTED AS · NEXT ON YOUR PATH · HAPPENED THE SAME YEAR), image 50–64, type badge, title 15/700, meta. Whole card is
  one link. No add-to-list button on cards (kept on the entity page).
- **Image credit:** 11/1.35 muted directly under every image: author, work, licence, source link. No image →
  halftone placeholder with dashed border and "NO IMAGE".
- **Citation marker + source:** `[n]` 11/700 superscript link after the sentence; Sources = numbered list 13/1.4
  ("[1] Author, Title · host"). Tapping a marker scrolls to and flashes the source.
- **Add to Want to…:** secondary button "+ WANT TO READ|WATCH|LISTEN|SEE" (verb from the form) → yellow "ON YOUR
  LIST" (tap again offers remove) → ink "READ ✓" when done. Person, theme and event pages have no list button; they
  get "SHOW ON TIMELINE" (filters the timeline to that entity's links).
- **READ IN BANCA:** primary red button with a round "R" stamp; appears whenever the entity (or the issue it is in)
  exists in the catalog; opens the issue at the story's page. External services (IMDb, Spotify, museum page) are
  secondary buttons named in text with an outbound arrow; no third-party logos.
- **In the catalog, no scan:** when the work is in the catalog but its issue has no Internet Archive scan, the
  primary button becomes a disabled-looking secondary "IN AMAZING STORIES · NO SCAN YET" (dashed border, no stamp)
  that still opens the Issue screen. **Mockup caveat:** the canvas shows READ IN BANCA on *Marooned off Vesta*, but
  that issue (March 1939) has no scan (see DECISIONS, Phase 7b); readable pilot examples are the Wells reprints
  (*The New Accelerator*, April 1926; *The Time Machine*, May 1927; *The War of the Worlds*, Aug–Sep 1927).

## Timeline rules
Chosen layout: **B · overview + stage** (option A "lanes", explored and kept on the canvas, was rejected: small
cards, hidden images, line clutter at hundreds of items).
- **Overview (top):** 1890 → today across the full width, one 6 px row per enabled lane, a 3×6 tick per item (bars
  for ranges). A bracket shows the visible period; drag it or tap anywhere to move; it is also the "century" zoom
  level (no separate century stage). Pins: ink = selected, red = its connections, even outside the visible period.
- **Stage (below):** columns = decades (zoom *Decades*, 6 columns) or years (zoom *Years*, ~9 columns). Pinch on the
  stage or the segmented control switches level; the stage centres on the selected item. "Year" field jumps.
- **Sorting inside a column:** selected first, then connected, then by year, then by lane order.
- **Grouping:** at most 4 cards per decade column / 3 per year column; the rest collapse into "+N more" (opens the
  column as a list). Virtualise by column: only visible columns ±1 are rendered.
- **Selection:** tap = select (no navigation). Connected items get the relation tag; others dim. Connections are
  not drawn as lines (they cost redraws and become unreadable with many items); they are shown by the tags, the
  overview pins and the side sheet, which groups them by link type plus "Elsewhere in time" for items outside the
  visible period (tap = jump and select). OPEN in the sheet goes to the entity page.
- **Lane filter:** chips (tablet) / "Lanes" sheet (phone); hidden lanes disappear from overview and stage.
- **Performance:** no blurred shadows except the selected glow at night, no continuous animation; selection change
  re-renders the visible columns only (state per item: selected / connected / dimmed).

## Phone behaviour
- **Timeline:** compact overview strip (62) on top, zoom + Lanes row, then a **vertical list grouped by decade or
  year** (years go down), max 3 rows per group + "+N more in the 1920s"; rows show year, lane square, title, type,
  relation tag and R stamp. A peek **bottom sheet** (214) holds the selected item: badge, title, 2-line summary,
  scrollable connection chips (tap = select), OPEN and Want-to. Bottom nav stays visible (Atlas active).
- **Entity:** single column; hero full width, credit, badge + dates, title 38, primary action + square Want-to
  button ("+" / "✓"), summary, Connections, Explore next, Sources further down.
- **Path:** stops as a vertical line; the current stop expands inline (image, text, why it matters, actions); a
  yellow "NEXT STOP" bar sits above the bottom nav.
- **Want to…:** 4 equal tabs with counts, rows with thumb + title + "type · year · from …" and a done button; remove
  by swiping left; done items move to a struck-through "DONE" group with Undo.

## Decisions
1. **Stage instead of lanes** — images stay the stars, scales to hundreds of items by column grouping, no
   connection lines to recompute; the overview keeps the "everything at once" view.
2. **Overview strip = century zoom** — avoids a third zoom level that would only show dots.
3. **Connections as tags and pins, not lines** — readable at any density and cheap on a mid-range tablet.
4. **Three new lane colors only** (teal, magenta, warm grey); the other four reuse the palette, so the Atlas looks
   like the rest of Banca.
5. **Night borders use `--edge #4A5276`**, not cream ink; one glow allowed (selected item).
6. **Person / theme / event have no Want-to button** — lists hold things to read, watch, listen to or see.
7. **Recommendation reason is always visible** (yellow strip), as the Atlas exists to recommend.
8. **External services as text buttons** — no logos to license; music → Spotify, film/series → IMDb, art → museum or
   Wikimedia Commons page.
9. **Prototype-only controls** (entity type switcher, dashed "PREVIEW AS") are not part of the app.

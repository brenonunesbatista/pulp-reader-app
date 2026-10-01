# Banca — "Newsprint" design system (v0.1, 2026-10-01)

Chosen direction from the design sprint (Phase 2.5). Mockups live in a Claude Design canvas:
<https://claude.ai/artifact/5E8QSLiLmr21jYgZiDjr8K> (private; page **Newsprint system** = this system, page
**Directions** = the three candidates A · Night Stand, B · Newsprint, C · Enamel Sign). The canvas sources are
copied in [`mockups/`](mockups/) (`.dc.html` = one artboard each; open the canvas to view them rendered).

## Idea
The app is a newsstand. Direction B borrows from cheap pulp paper and four-colour presses: aged paper, warm
near-black ink, Ben-Day halftone dots, 2 px ink borders with offset (unblurred) shadows, a misregistered blue shadow
under the wordmark, price tags on covers ("APR 1926 · 25¢") and a round "READABLE" stamp. Covers stay the stars:
the interface is flat paper and ink around them. The **Night** theme borrows direction A's neon: deep ink-blue
ground and a soft yellow glow on covers and the reader slider.

## Sizes
Mockups are drawn in **dp = CSS px in the WebView**: tablet landscape **1280×800** (Galaxy Tab A9+, 1920×1200 px at
1.5×, assumption to verify with `window.innerWidth` on the device), phone portrait **412×892** (Galaxy S25).
Touch targets ≥ 48 dp (chips 40–44 dp high inside a 48 dp row).

## Color tokens

| Token | Paper (default) | Night | Sepia (reader only) | Use |
|---|---|---|---|---|
| `--bg` | `#EEE2C6` | `#0E1222` | `#DCC8A0` | screen ground |
| `--surface` | `#F7EEDA` | `#171C30` | `#E9D9B6` | cards, fields, sheets |
| `--surface-2` | `#E4D4AF` | `#222842` | `#D2BC90` | pressed states, tracks |
| `--ink` | `#2A2118` | `#F1E4C6` | `#3B2A18` | text, 2 px borders |
| `--text-muted` | `#5E4E3A` | `#ABA38C` | `#6A5236` | meta text (≥ 4.5:1 on `--bg`) |
| `--line` | `#2A2118` | `#3A4160` | `#3B2A18` | 2 px rules and borders |
| `--rule` | `#D6C6A2` | `#2A3150` | `#C4AC7E` | hairlines between rows |
| `--pulp-red` | `#C8321F` | `#FF5A44` | `#B02E1C` | primary buttons, masthead, story-start marks |
| `--on-red` | `#FFF4DC` | `#0E1222` | `#FFF4DC` | text on red |
| `--pulp-yellow` | `#F2B705` | `#FFC93C` | `#E0A800` | selection, active chip/tab, price tags, progress |
| `--press-blue` | `#1F4E8C` | `#86A8F0` | `#1F4E8C` | links (people), serial tag, wordmark shadow |
| `--marker` | `#F2B70566` | `#FFC93C55` | `#E0A80066` | text highlights |

Effects: `--halftone` = `radial-gradient(rgb(255 240 200 / .16) 1.3px, transparent 1.8px) 0 0 / 7px 7px` over red
(masthead) or `rgb(42 33 24 / .16)` dots over paper; `--shadow-print` = `4px 4px 0 var(--ink)` (cards 6 px);
`--glow` (Night only) = `0 10px 24px rgb(0 0 0 / .6), 0 0 30px rgb(255 201 60 / .18)`.
The halftone belongs to UI surfaces and placeholder covers only, never over real scans.

```css
:root {                       /* Paper */
  --bg: #EEE2C6; --surface: #F7EEDA; --surface-2: #E4D4AF; --ink: #2A2118; --text-muted: #5E4E3A;
  --line: #2A2118; --rule: #D6C6A2; --pulp-red: #C8321F; --on-red: #FFF4DC; --pulp-yellow: #F2B705;
  --press-blue: #1F4E8C; --marker: #F2B70566;
  --shadow-print: 4px 4px 0 var(--ink); --cover-shadow: var(--shadow-print);
  color-scheme: light;
}
:root[data-theme="night"] {
  --bg: #0E1222; --surface: #171C30; --surface-2: #222842; --ink: #F1E4C6; --text-muted: #ABA38C;
  --line: #3A4160; --rule: #2A3150; --pulp-red: #FF5A44; --on-red: #0E1222; --pulp-yellow: #FFC93C;
  --press-blue: #86A8F0; --marker: #FFC93C55;
  --cover-shadow: 0 10px 24px rgb(0 0 0 / .6), 0 0 30px rgb(255 201 60 / .18);
  color-scheme: dark;
}
.reader[data-theme="sepia"] { --bg: #DCC8A0; --surface: #E9D9B6; --ink: #3B2A18; --text-muted: #6A5236; }
.num { font-variant-numeric: tabular-nums lining-nums; }
```

Reader page rendering per theme: Paper = scan as is; Sepia = scan multiplied over `#E6D2A6`; Night = scan inverted
on `#1C1A16` with ink `#D9CBB0`. "Enhance text" = contrast/threshold filter on the scan (to be measured in Phase 3).

## Typography
- **Big Shoulders Display** 800–900, all caps: wordmark, screen titles, section headers, button labels. Condensed
  newsstand-signage face (Chicago street signs) — narrow, so long magazine names fit; less overused than Bebas/Oswald.
- **Source Serif 4** 400/600/700: everything else. Optical sizes, good on screen at small sizes, tabular figures for
  pages, dates and counts.
- Both from Google Fonts (OFL); bundle them in the APK (no network font loading).

| Token | Spec | Example |
|---|---|---|
| `--t-display-xl` | BSD 900 · 64/0.9 | AMAZING STORIES (issue hero) |
| `--t-display-l` | BSD 900 · 40/1 | screen title |
| `--t-section` | BSD 900 · 28/1 (phone 24) | CONTINUE READING |
| `--t-title` | SS4 600 · 22/1.25 | The Man from the Atom |
| `--t-body` | SS4 400 · 17/1.5 | body text |
| `--t-meta` | SS4 400 · 14/1.4 | Cover by Frank R. Paul |
| `--t-label` | SS4 700 · 12, +0.12em, caps | SHORT STORY |

## Components
- **Masthead:** red + halftone, 3 px ink bottom border; wordmark yellow with `3px 3px 0 var(--press-blue)`; tabs
  Pulp / RPG / Atlas (active = yellow fill). Phone: bottom navigation Pulp · RPG · Atlas · Search (active = yellow pill).
- **Buttons:** height 52 (min 48), radius 4, 2 px ink border, `--shadow-print`; label BSD 800 21 px +0.06em caps.
  Primary = red / `--on-red`; secondary = surface / ink. Pressed: `transform: translate(4px,4px); box-shadow: none`.
- **Chips:** height 40–44, radius 4, 2 px ink border; selected = yellow fill; year chips are pills; "Readable only"
  is a switch (52×30, yellow when on).
- **Story type tags:** Serial = blue fill, Novelette = yellow fill, Novel = red fill, Short story = ink outline,
  Editorial = dashed muted outline.
- **Cover (`<Cover>`):** ratio 1 : 1.387 (300×416); 2 px ink border (1 px under 90 px wide) + print shadow (Night:
  glow). Optional price tag (yellow, rotated −5°, shelves and issue hero only), "NO SCAN" band + desaturated
  (`saturate(.2) brightness(.92) contrast(.8)`) for issues without a scan, round red "READABLE" stamp (issue hero).
  Shelf progress = 4 px bar under the cover (red on paper, yellow at night).
- **Shelf ("Continue reading"):** covers hang from a 3–4 px ink wire, horizontal scroll.
- **Reader chrome:** top and bottom bars at 92–94 % ink, fade + 8 px slide in 160 ms, toggled by a tap on the
  centre third. Top: back, story — author, issue line, then Contents (drawer), Page index, Display, Enhance text,
  Highlights, Bookmark (toggles active = yellow pill). Bottom: thumbnail strip (current page larger, yellow border),
  slider with yellow progress and red ticks at story starts, "p. 42–43 / 100" + "N pages to the end of the story".
  Phone: the tool buttons move to a 5-button row in the bottom bar. Display panel: theme segmented control
  (Paper / Sepia / Night), brightness, warm filter, Enhance text switch.
- **Page index:** thumbnail grid (tablet 10 columns + story list on the left; phone 4 columns grouped by story);
  current page = yellow border, story start = red border + red corner + title under the thumbnail.
- **Icons:** 24 px grid, 2 px stroke, round caps/joins, in 48 dp targets (set in the DS artboard: back, close,
  search, settings, contents, pages, light, theme, enhance, download, bookmark, highlight, read, filter, atlas, person).

## Screens in the canvas
Tablet and phone: Library, Magazine, Issue, Reader (chrome visible; tablet = Sepia spread with working theme switch,
Enhance toggle and contents drawer; phone = Night), Page index, Atlas (sketch). Not yet drawn: Person, Search,
Settings. Sample data (page numbers, "7 readable") is illustrative.

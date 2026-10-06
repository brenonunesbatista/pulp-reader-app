# Backlog

Ideas and sources to add later. Items move into a phase brief when they are scheduled.

## Proposed order (after Phase 2 tests, 2026-10-01)

| Step | Scope | Why this order |
|---|---|---|
| ✅ now | Reader prefetch: 1 behind + 2 ahead decoded, pages 3–5 ahead downloaded | user report: fast page flips showed blurry pages |
| ✅ **2.5 Design sprint** | name, visual identity, design tokens, mockups of Library / Issue / Reader for **tablet and phone** (Claude Artifacts, reviewed on the devices) | everything after this is built once, in the final look |
| ✅ **3 Reader** | new reader chrome in the new design; **page index** (thumbnail grid + contents markers); contents drawer; page slider; landscape spread; themes / brightness / warm filter; "enhance text"; OCR page-number fix; phone reading mode (fit width, column panning) | SPEC phase 3 + test feedback |
| ✅ **4 Phones** (layouts done in Phase 3; tablet verified 2026-10-01; S25 test pending) | responsive app shell (S25 first: ~412 dp wide, bottom navigation, 2-column grids), any Android phone ≥ Android 8 | cheap if the design sprint already covers phone layouts |
| ✅ **5 Downloads** (verified on the tablet 2026-10-01) | SPEC phase 4 + user request: *Delete all* in Settings, a way to see what is downloaded (filter) | |
| ✅ **6 Highlights & export** (verified on the tablet 2026-10-01) | SPEC phase 5: 4 colors, notes, web search, Notes screen, Markdown export | |
| ✅ **7 Atlas (Explore / Hall)** — pilot verified 2026-10-02; second path (robots & AI) 2026-10-02; 7d saved/subject timelines + curator inbox verified 2026-10-03; 🧪 7e items added to timelines built 2026-10-03 | curated knowledge layer: interactive timeline, stories, authors, characters, themes, influence on film/music/manga; AI-drafted entries with web sources, reviewed by the user | needs a content pipeline + curation time; its data model starts in a spike early (see below) |
| 🧪 **8 New sources** — 8a pulp collections verified on the tablet 2026-10-03; 8b packs (Dragon, Dungeon) verified on the tablet 2026-10-06; 🧪 8c comics built 2026-10-06 | categories `pulp` / `rpg` / `comics` and the sources listed below | each source = adapter + dedupe + (later) contents |

## Atlas (Explore / Hall) — design notes
- **What:** an in-app "museum" to *discover*: a timeline (1900s → today) with lanes for magazines, stories, authors,
  world events, films/series, music, manga/anime; entity pages (story, author, character, theme, magazine, movement)
  linked into a graph ("influenced", "adapted as", "same theme", "read next").
- **Content pipeline (on the PC, not in the app):** `tools/atlas/` drafts entries with the Claude API + web search
  (every claim and every recommended article / interview / film comes from a search result with its URL; links are
  checked to resolve) → Markdown/JSON files with `status: draft | reviewed` → the user curates → the builder writes
  `atlas.db` (entities, links, sources, themes, FTS). The app ships the reviewed content and works offline. No API keys
  in the app or the repo.
- **Seed interests:** science fiction, manga, other countries'/eras' cultures, literature, cinema, music, and how art
  shapes humanity. Seed authors: Asimov, Tolkien, Frank Herbert, H. G. Wells, Orwell, Dostoevsky → expand by
  influence links to pulp authors that are actually in the catalog (e.g. Wells reprinted in Amazing Stories 1926).
- **Open data to link:** Wikidata (influences, adaptations, dates), ISFDB, SF Encyclopedia, FictionMags, Open Library,
  TMDB (films), MusicBrainz, AniList/MyAnimeList (manga). Check each licence/terms before storing data.
- **Start small:** one "path" (e.g. *H. G. Wells → Amazing Stories → Golden Age → Asimov → Foundation on screen*) to
  validate format, tone, and timeline UX before scaling.

### Atlas — user ideas to organize when the phase starts (2026-10-01)
Raw list, kept as stated; to be discussed and prioritized together before building.
1. **Recommendations are the core goal.** The Atlas exists so the user *discovers* and gets interested in new stories
   and subjects. Every entity page and timeline should end in "what to explore next".
2. **Searches and suggestions feed a curator inbox.** Whatever is searched or suggested in the app also comes back to
   the owner as a *recommendation* to review and possibly curate into the Atlas (e.g. an "Inbox" in the content
   pipeline built from search logs + accepted suggestions).
3. **Personalized timeline on demand.** The user searches a subject and a timeline is assembled *for that subject, at
   that moment*. Options to evaluate: (a) built from the curated graph in `atlas.db` (offline, instant, no AI at
   runtime); (b) AI-generated on demand (needs a Claude API key stored only on the device, network, cost per query,
   output not curated); (c) hybrid: graph first, AI suggests additions that go to the curator inbox.
4. **Save timelines** (named, editable) in `user.db`.
5. **Want-to lists:** want to read / watch / listen / see, with items added from anywhere (timeline, entity page,
   recommendation).
6. **All art forms, not only literature, music and cinema.** Painting and visual art get equal weight, along with
   comics/manga, illustration (pulp cover art itself), theatre, photography and architecture.
   - Paintings and images: Wikimedia Commons / museum open-access APIs (e.g. Met, Rijksmuseum, Art Institute of
     Chicago) with licence and attribution stored per image.
   - Music: Spotify link (open the Spotify app via deep link); MusicBrainz for metadata.
   - Films/series: short description plus an IMDb link (IMDb data itself is not freely reusable; take descriptions from
     TMDB/Wikidata with attribution and link out to IMDb).
7. Interests to seed: science fiction, manga, cultures of other countries and eras, literature, cinema, music, visual
   arts, and how art shapes humanity. Favorite authors: Asimov, Tolkien, Frank Herbert, H. G. Wells, Orwell, Dostoevsky.

## Phone support — notes
- Same APK, responsive layout (window size classes: compact < 600 dp, medium, expanded ≥ 840 dp; the A9+ is
  expanded, the S25 is compact in portrait).
- Reader on phones: pulp pages are dense two-column text → "fit width" + column-by-column panning, double-tap to zoom
  a column; landscape = single page fit width.
- iOS is technically possible with Capacitor but needs a Mac + Xcode; out of scope.

## Categories (content types)

The catalog currently has only magazines of one kind. New sources come in **categories**, and the app must keep them
apart (separate shelves, filters and search facets), with room for more categories later:

| Category | What | Sources below |
|---|---|---|
| `pulp` | pulp / genre fiction magazines and dime novels | Amazing Stories (done), F&SF, Fantastic, Galaxy, Asimov's, Twilight Zone, Fame and Fortune Weekly, Bolsilibros |
| `rpg` | tabletop RPG magazines, read for campaign inspiration | Dungeon, Dragon, The Space Gamer |

Planned model change (when the first new source is added): `category` table (`id, slug, name, sort`) plus
`magazine.category_id`. Library groups magazines by category, and search can filter by category. Adapters stay
category-agnostic.

## Candidate sources (surveyed 2026-09-30)

Measured with `tools/spike/ia_survey.py` (Internet Archive metadata only, throttled). "Reader-ready" means each issue
has a `_jp2.zip` page set and `_djvu.xml` OCR, which is what reader B uses.

| Source | Link type | Items | Years | Reader-ready | Notes |
|---|---|---|---|---|---|
| The Magazine of Fantasy & Science Fiction | collection `fantasyandsciencefiction` | 621 | 1949–1984 | yes | open, not lending |
| Bolsilibros: Selección Terror | collection `bolsilibros_seleccion_terror` | 649 | 1973–1985 | yes | **Spanish** pocket novels (books, not magazines): one item per novel |
| Fame and Fortune Weekly | collection `fameandfortuneweekly` | 512 | 1905–1928 | yes | dime novel weekly; `date` metadata missing → parse from identifier (`..._1907-12-27`) |
| Fantastic | collection `fantasticsfstories` | 365 | 1952–… | yes | several scans of the same issue (e.g. v01n01 ×4) → pick the best one |
| Rod Serling's The Twilight Zone Magazine | collection `twilightzonemagazine` | 66 | 1981–1989 | yes | some items are "noads" or cover-upgrade variants |
| Asimov's Science Fiction | collection `asimovmagazine` | 440 | 1978–2014 | yes (samples) | also holds non-magazine items (e.g. anthologies) → filter by title pattern |
| Galaxy | collection `galaxymagazine` | 446 | 1950–… | yes | duplicates (World Editions reprints vs originals) |
| Dungeon (magazine) | item **pack** `dungeon-magazine` | 1 item, 221 issues | 1986–2007 | yes | one item bundling 221 JP2 sets + OCR (see "Packs") |
| Dungeon (by subject) | search `subject:"Dungeon magazine"` | 180 | — | mostly | includes unrelated items (podcasts) → filter `mediatype:texts`; overlaps with the pack |
| Dragon | item **pack** `DragonMagazine260_201801` | 1 item, 443 issues | 1976–2013 | yes | same pack structure as Dungeon |
| The Space Gamer | collection `space-gamer` | 88 | 1975–… | yes | |
| D&D (by subject) | search `subject:"Dungeons and Dragons (Game)"` | 157 | — | **mixed** | many are **lending-only** books (`access-restricted-item`, `inlibrary`) → cannot be read; keep only open items |

### Can the app reach every volume from these links? Yes, with source-specific work:
- **Collections and searches:** the advanced search API returns all items (paged). One request per page of 100
  results is metadata, not crawling.
- **Packs** (Dungeon, Dragon): one IA item with hundreds of issues. The item's IIIF manifest covers **only the first
  book** (72 pages = Dungeon #1), but every issue's pages can still be reached. The item's file list names each
  `<issue>_jp2.zip` + `<issue>_djvu.xml`, and IIIF image ids are built from the zip path (the same scheme reader B
  already uses). The adapter lists the sub-books from `/metadata/<id>` and gets page counts from each sub-book's OCR.
  The app needs an optional `sub_book` on the issue.
- **Duplicates:** choose one scan per issue (prefer complete, no "Missing", higher `imagecount`) and keep the others as
  alternates.
- **Contents (ToC):** unlike Amazing Stories, these have no reference guide. Options: IA metadata (title/date/volume
  only), FictionMags/ISFDB data for the fiction magazines, or issue-level only at first (cover + date, no story list).

## Comics (user list, 2026-10-01) — for Phase 8, together with the other new titles
A third category next to `pulp` and `rpg`: **`comics`**. Links as given by the user (not surveyed yet):

| Title | IA item | Shape of the link |
|---|---|---|
| Amazing Spider-Man Masterworks v01 (2003) | `marvel-masterworks-amazing-spider-man-v-1-27` | pack: one item, several volumes (file path in the URL) |
| Hellblazer (1988) #1 | `pinkcomics-hellblazer-1988` (`hellblazer-001`) | pack of issues |
| Swamp Thing Bronze Age Omnibus | `swamp-thing-bronze-age-omnibus-original-color-edition` | single book |
| Turok, Son of Stone 001 (Dell 4C) | `turok-son-of-stone-1954-1982-complete-collection_202306` | pack: complete 1954–1982 run |
| A Espada Selvagem de Conan 001 (Abril, BR) | `aespadaselvagemdeconan2` | pack, **Portuguese** |
| The Complete Peanuts vol. 1 (1950–1952) | `the-complete-peanuts-volume-1-26` | pack of 26 volumes; **landscape strip format** |
| Asterix the Gaul | `35-asterix-and-the-picts` (`01_Asterix_the_Gaul`) | pack of albums |
| Miracleman #16 | `miracleman-reprints` | pack |
| Daredevil Masterworks v01 (2003) | `marvel-masterworks-daredevil-v-1-19` | pack |
| Captain America Masterworks v17 (2025) | `marvel-masterworks-captain-america-v-1-17` | pack |
| Conan the Barbarian #1 (Marvel, 1970) | `conan-the-barbarian-1-24` (`Conan The Barbarian 001`) | pack: issues 1–24 |

Notes for when this is built:
- Almost all are **packs** (one item, many books addressed by file path), so they reuse the pack work planned for
  Dungeon/Dragon (`sub_book` per issue). Need to check per item whether pages come as `_jp2.zip` (IIIF-ready) or only as
  CBR/CBZ/PDF (would need another page source).
- Comics have little or no useful OCR (lettering), so search inside pages, highlights and the page map mostly do not
  apply; contents = one entry per issue/story from IA metadata or a manual list.
- **Reader option requested:** "single page even in landscape" (Peanuts strips are wide). Make it a reader setting
  (Spreads: auto / always single page), possibly remembered per title. Cheap; can be done earlier if wanted.
- **Rights, to discuss before building** (same concern as the D&D 5e item below): most of these are current
  commercial editions (Marvel Masterworks, including a 2025 volume; Marvel's Conan the Barbarian; Asterix; The Complete
  Peanuts; Hellblazer; Miracleman; Abril's Conan), and the scanner-group tags in the file names ("Digital", "Empire", "pinkcomics") suggest
  unauthorized uploads that IA may take down. 1950s Dell titles like Turok are the most likely to be clear.

## Not planned
- `Livro-de-Regras-DnD-5e` (Guia do Mestre, Livro do Jogador, Manual dos Monstros; one item with 3 books, technically
  readable the same way as the packs). These are current commercial books (D&D 5e, 2014, Portuguese edition still sold),
  so this upload is most likely unauthorized. The free, official alternative is the D&D **SRD 5.1 / 5.2**, published
  by Wizards of the Coast under CC-BY-4.0, which could be added legitimately as reference text.

## Other ideas
- "Enhance text" image filter for worn type (see DECISIONS 2026-09-30, reader).
- OCR-based page-number map to correct guide leaves (Phase 3).

# Atlas content

Curated content for Banca's Atlas (Phase 7). Written by Claude Code with web sources, reviewed by the owner, built into
`atlas.db` by `tools/atlas/` (Phase 7c). English. No AI at runtime: the app only shows what is here.

## Layout
- `entities/<id>.md` — one file per entity.
- `paths/<id>.md` — guided paths (ordered stops).
- Validate with `python tools/atlas/validate.py` (also run by `pytest`).

## Entity file
TOML front matter between `+++` lines, then Markdown.

```toml
+++
id = "the-time-machine"            # = file name; lowercase, hyphens
type = "work"                      # person | work | film | series | radio | music | artwork | magazine | issue
                                   # | event | movement | theme
title = "The Time Machine"
subtitle = "Novella by H. G. Wells" # one line under the title
lane = "books"                     # timeline lane: magazines | books | film-tv | music | visual-art | comics | events
                                   # (omit for person / theme / movement)
date = "1895"                      # YYYY, YYYY-MM or YYYY-MM-DD; when it appears on the timeline
end = "1946-08-13"                 # optional (a life, an era, a run)
themes = ["time-travel"]           # theme ids
status = "draft"                   # draft | reviewed — only reviewed entities ship in the app

[[catalog]]                        # optional: where to read it in Banca
magazine = "amazing-stories"
issue = "1927-05"
story = "The Time Machine"         # omit to point at the whole issue

[image]                            # optional
catalog_cover = "amazing-stories/1927-08"   # a cover already in the catalog
# or: url, credit, license, source (Wikimedia Commons / museum open access)

[[links]]                          # one direction only; the builder adds the inverse
rel = "adapted_as"                 # influenced | adapted_as | published_in | created_by | read_next | context
to = "the-time-machine-1960-film"
note = "First film version"        # optional, shown as the reason

[[sources]]
n = 1
title = "The Time Machine — Wikipedia"
url = "https://en.wikipedia.org/wiki/The_Time_Machine"
accessed = "2026-10-01"
+++
Two to four short paragraphs. Every factual sentence cites a source as [1].

## Why it matters
One or two sentences: the reason to explore it.
```

Link meanings (as read from the file that declares them):
- `influenced` → this entity influenced the target.
- `adapted_as` → the target is an adaptation of this entity.
- `published_in` → this work appeared in the target (magazine or issue).
- `created_by` → the target person made this.
- `read_next` → a recommendation, with `note` as the reason.
- `context` → historical/real-world context (events).

## Review checklist
- Every claim has a source; the sources say what the text says.
- Dates and titles match the sources and the catalog.
- External links (IMDb, Spotify, images) are added only after checking they resolve; images need a licence.
- Set `status = "reviewed"` when done.

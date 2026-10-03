# CLAUDE.md — Banca (repo: pulp-reader-app)

Personal Android tablet + phone app (Galaxy Tab A9+, Galaxy S25) to browse and read pulp magazines from the Internet Archive. Read `SPEC.md` first; it is the source of truth for requirements.

## Stack
Capacitor (Android) · Vite · React · TypeScript (strict) · SQLite (`@capacitor-community/sqlite`) · Python 3.11+ for `tools/` (catalog build).

## Layout
- `app/` — the Capacitor/React app
- `tools/` — Python catalog builders (one adapter per magazine), with tests
- `data/source/` — input reference files (e.g. the Amazing Stories PDF). **Never commit these** (they are marked "not for distribution"); keep in `.gitignore`.
- `content/atlas/` — Atlas entities and paths (TOML front matter + Markdown, one file each; `status = "draft" | "reviewed"`)
- `docs/` — `DECISIONS.md` (append a dated entry for every non-trivial technical decision), `archive-findings.md`
- `SPEC.md`, `PHASE*_PROMPT.md`

## Commands (keep this section up to date)
- App dev in browser: `cd app && npm run dev` (needs the built catalog; SQLite runs via sqlite-wasm in the browser;
  Vite proxies `/ia-download` → archive.org/download, which has no CORS)
- Typecheck / lint / tests: `cd app && npm run typecheck && npm run lint && npm test`
- Android build/run on device: `cd app && npm run build && npx cap sync android && npx cap run android`
  (if `cap run` finds no device: `cd app/android && gradlew assembleDebug` then `adb install -r app/build/outputs/apk/debug/app-debug.apk`)
- Spike IA probes: `python tools/spike/ia_metadata.py <id>` (then `ia_pages.py`, `ia_ocr.py`, `ia_pagemap.py`, `ia_cors.py`); deps in `tools/spike/requirements.txt`
- Icons/splash (after changing the mark): `python tools/brand/make_icons.py` then `cd app && npx capacitor-assets generate --android`
- Python setup (once): `python -m venv .venv && .venv\Scripts\pip install -r tools/requirements.txt`
- Catalog build: `python tools/build_catalog.py --source data/source/Amazing_Stories_Reference_Guide.pdf --out app/public/catalog`
  (writes `catalog.db` + `covers/*.webp`, both git-ignored, and `docs/catalog-report.md`)
- Atlas review page: `python tools/atlas/review_page.py --out <file.html>` (one HTML page, path + all entities, OK/Change marks)
- Atlas media suggestions: `python tools/atlas/suggest_media.py --out media.json` (free Commons images + IMDb/Spotify ids from Wikidata, batched; review before adding)
- Atlas build: `python tools/atlas/build_atlas.py` → `app/public/atlas/atlas.db` (reviewed entities only; also run automatically by the app's `predev`/`prebuild` via `app/scripts/copy-databases.mjs`)
- Atlas content check: `python tools/atlas/validate.py` (front matter, links, themes, citations, catalog references; content in `content/atlas/`, format in its README)
- Tests: `npm test` (app), `pytest` (tools; run from the repo root — synthetic fixture PDF, real-guide smoke test skipped if the PDF is absent)

## App structure (app/src)
- `db/` — `Db` interface (three databases: `catalog` and `atlas` read-only, shipped; `user` read-write); `nativeDb.ts` (@capacitor-community/sqlite, Android) and `wasmDb.ts` (sqlite-wasm: browser dev + tests); `userSchema.ts` migrations for `user.db`
- `data/` — repositories (only place with SQL): `catalogRepo.ts`, `progressRepo.ts`, `annotationRepo.ts`, `downloadRepo.ts`, `settingsRepo.ts`, `fts.ts`
- `downloads/` — `manager.ts` (queue, retries, resume, network policy; pure + tested), `store.ts` (Android app data dir `downloads/<ident>/` or memory), `DownloadsProvider` + hooks (`useDownload`, `useDownloadList`)
- `notes/` — `gather.ts` (highlights + bookmarks with story titles and printed pages), `markdown.ts` (export, pure + tested), `share.ts` (share sheet, clipboard, web search)
- `atlas/` — Atlas screens (Home, Timeline, Entity, Path, Want to), `parts.tsx` components, `forms.ts` vocabulary, `recommend.ts` and `subject.ts` (pure, tested), `TimelineItems.tsx` (own items, add-to-timeline), `useAtlas.ts` (graph + user signals); data in `data/atlasRepo.ts`
- `nav/` — stack navigator (`stack.ts` pure, `Nav.tsx` provider; history + Android back), screens stay mounted underneath
- `screens/`, `ui/` — screens and shared components (`components.tsx`, `icons.tsx`, `SettingsProvider`); `app.css` = Banca tokens (docs/design/banca-newsprint.md)
- `reader/` — `ReaderScreen.tsx` (chrome, panels), `ReaderController.ts` (page DOM, no React state per frame), `pageMap.ts` / `layout.ts` (pure, tested); `engine/` = PanZoom gestures, image loader, OCR parse/worker, IIIF access, disk cache
- Native: `android/app/src/main/java/local/pulpreader/BancaDisplayPlugin.java` (brightness, immersive), registered in `MainActivity`

## Working rules
- Work in the phase requested; don't build later phases early. If something is ambiguous, ask instead of guessing.
- Start each phase with a short plan and wait for approval before large changes.
- Small, reviewable commits; commit only when a step works. Run tests/typecheck/lint before saying "done".
- Add dependencies sparingly and say why. Prefer well-maintained libraries.
- Performance on a mid-range tablet is a requirement: avoid re-renders in the reader, virtualize long lists, use `requestAnimationFrame`/CSS transforms for zoom/pan, decode images off the main path.
- Internet Archive access: always send a descriptive `User-Agent`, throttle requests, cache aggressively, never crawl whole collections.
- Never write secrets or personal data into the repo. Personal use only.
- Log measurements (timings, sizes, fps) in `docs/`, not just conclusions.
- Keep `README.md` current: update it in the same commit whenever features, setup/commands, layout or the roadmap
  status change (at least at the end of every phase).

# CLAUDE.md — Pulp Reader

Personal Android tablet app (Galaxy Tab A9+) to browse and read pulp magazines from the Internet Archive. Read `SPEC.md` first; it is the source of truth for requirements.

## Stack
Capacitor (Android) · Vite · React · TypeScript (strict) · SQLite (`@capacitor-community/sqlite`) · Python 3.11+ for `tools/` (catalog build).

## Layout
- `app/` — the Capacitor/React app
- `tools/` — Python catalog builders (one adapter per magazine), with tests
- `data/source/` — input reference files (e.g. the Amazing Stories PDF). **Never commit these** (they are marked "not for distribution"); keep in `.gitignore`.
- `docs/` — `DECISIONS.md` (append a dated entry for every non-trivial technical decision), `archive-findings.md`
- `SPEC.md`, `PHASE*_PROMPT.md`

## Commands (keep this section up to date)
- App dev in browser: `cd app && npm run dev`
- Android build/run on device: `cd app && npx cap sync android && npx cap run android`
- Catalog build: `python tools/build_catalog.py --source data/source/Amazing_Stories_Reference_Guide.pdf --out app/public/catalog`
- Tests: `npm test` (app), `pytest` (tools)

## Working rules
- Work in the phase requested; don't build later phases early. If something is ambiguous, ask instead of guessing.
- Start each phase with a short plan and wait for approval before large changes.
- Small, reviewable commits; commit only when a step works. Run tests/typecheck/lint before saying "done".
- Add dependencies sparingly and say why. Prefer well-maintained libraries.
- Performance on a mid-range tablet is a requirement: avoid re-renders in the reader, virtualize long lists, use `requestAnimationFrame`/CSS transforms for zoom/pan, decode images off the main path.
- Internet Archive access: always send a descriptive `User-Agent`, throttle requests, cache aggressively, never crawl whole collections.
- Never write secrets or personal data into the repo. Personal use only.
- Log measurements (timings, sizes, fps) in `docs/`, not just conclusions.

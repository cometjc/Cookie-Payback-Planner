# Agent Guide

## Project Summary
- Cookie Clicker mod named "Cookie Payback Planner" (original mod id: BestDealHelper).
- Main mod logic is in `main.js`; metadata lives in `info.txt`.

## Repo Structure
- `main.js`: Core mod implementation and runtime hooks.
- `info.txt`: Mod metadata (name, id, version, dependencies).
- `chroma-js` (bundled into `main.js` by esbuild): color library used by the mod.
- `README.md`: Feature overview and links.
- `RELEASE.md`, `CHANGELOG.md`: Release notes and history.
- `tsconfig.json`: JS type-checking config (allowJs + checkJs).

## Conventions
- Keep compatibility with Cookie Clicker mod loader (`Game.registerMod` usage).
- Keep chroma usage via `chroma-js` imports in `src/main.js`.
- Prefer small, incremental changes in `main.js` and keep JSDoc typings.

## Common Commands
- Type-check (if `tsc` is available): `tsc --noEmit`

## Tests
- No automated tests configured.

# anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop
- Commit: c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b (2026-09-10), copied from `skills/install-anti-slop/assets/anti-slop/` by its `install.mjs`. `sync-skill-assets.mjs --check` confirmed those assets match upstream `src/` (minus tests).
- Installed: `tools/oxlint/anti-slop/` (generic plugin `index.ts`; `effect/` is copied but not registered, as this repo does not use Effect).
- Dependencies: `oxlint` and `@oxlint/plugins` pinned exactly to 1.86.0 (upstream tests against 1.78.0).
- Deviations: `require-readable-spacing` ignores statements that share a line; see `vendor/eslint-stylistic/UPSTREAM.md`.

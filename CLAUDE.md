# Dream Estate Builder — guide for Claude sessions

Client-side 3D estate designer (Vite + TypeScript + Three.js), deployed to GitHub Pages at
https://z1fire.github.io/dream-estate-builder/ from `main` via `.github/workflows/deploy.yml`.
Repo: github.com/z1fire/dream-estate-builder. No backend.

## Commands
- `npm run dev` — dev server (http://localhost:5173/dream-estate-builder/)
- `npm run build` — `tsc --noEmit` + Vite build (must be clean before every commit)
- `npm run lint` — ESLint (must be clean)
- `npm run test:e2e` — Playwright: builds must exist (`npm run build` first); runs `vite preview`, fails on console errors, writes screenshots to `tests/screenshots/` (gitignored PNGs)
- `BASE_URL=https://z1fire.github.io/dream-estate-builder/ npx playwright test tests/smoke.spec.ts` — check the live site
- `npm run build:assets` — download (if missing) + Blender-generate + optimize all models, regenerate catalog + thumbnails
- Blender is NOT on PATH on this machine: scripts resolve `BLENDER_PATH` → PATH → `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`

## Architecture
- **World units**: 1 unit = 1 m. UI displays feet/acres (`core/math.ts` fmtFeet/fmtArea). Ground = XZ, +Y up. World is 1024 m square centred on origin (`core/types.ts` WORLD_SIZE/GRID), 1 m terrain cells.
- **Single source of truth**: `EstateDoc` (`core/types.ts`) — plain serialisable data (heights Float32Array, splat Uint8Array 3 RGBA planes, entity collections). Everything visible is *derived* from it.
- **Store** (`core/store.ts`) holds the doc and broadcasts `Change`s (`terrain`/`splat` rects, `collection` key+ids, `vegetation`, `boundary`, `settings`, `doc`). Systems subscribe and rebuild only their slice.
- **Undo/redo** (`core/commands.ts`): every edit is a `Command` run via `app.cmd.run()` (or `push()` if already applied, e.g. brush strokes). Helpers: `addEntities/removeEntities/updateEntities/composite`, terrain/splat region patches, `vegetationCommand`, `regionWithEntities`. Never mutate the doc outside a command.
- **App** (`app/App.ts`): renderer, scene, `CameraRig`, `Environment`, `TerrainSystem`, registered `System`s (each has `group` + optional `update`), layers, tools, pointer pipeline, picking (objects tag `userData.pick = {kind,id}` or a function of instanceId).
- **Tools** (`editing/Tool.ts`): one active Tool receives pointer events with ground hit + ray. `usesLeft` reserves the left mouse button (camera stays on right/middle).
- **Terrain** (`terrain/`): 16×16 chunks of 64 m with LOD + skirts; splat shader injected into MeshStandardMaterial (`terrainMaterial.ts`) — 10 procedural ground layers (`groundTextures.ts`), boundary SDF fade, grid, brush cursor, snow/season tint.
- Modules: terrain, water, vegetation, paths, buildings, interiors, farming, animals, catalog, editing, environment, camera, persistence, ui.

## Conventions
- Each feature module owns a `*System` (rendering, subscribes to Store) and one or more `Tool`s (interaction) + panel UI built with `ui/dom.ts` helpers (`h`, `slider`, `select`, `segmented`…).
- UI: plain DOM + `ui/theme.css` (parchment/stone medieval theme, Cinzel + Inter). No debug-style panels.
- Use InstancedMesh for anything repeated. Mark pickable things via `userData.pick`.
- Keep code modular; one responsibility per file.

## Adding a model
1. Drop the `.glb` into `public/models/<category>/`.
2. Add one entry in `src/catalog/catalog.ts` (see the `CatalogItem` type).
3. `npm run build:assets` (or `node scripts/gen-thumbnails.mjs`) regenerates thumbnails.

## Progress
See bottom of file (kept up to date per phase).

### Status
- Phase 0 (scaffold + deploy): in progress

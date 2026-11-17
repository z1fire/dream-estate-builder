# Dream Estate Builder: guide for Claude sessions

A client-side 3D estate designer (Vite + TypeScript + Three.js). It deploys to GitHub Pages at
https://z1fire.github.io/dream-estate-builder/ from `main` via `.github/workflows/deploy.yml` (lint + build, then deploy).
Repo: github.com/z1fire/dream-estate-builder (public). There is no backend. Read README.md for the user-facing feature list.

## Commands
- `npm run dev`: dev server at http://localhost:5173/dream-estate-builder/ (`?demo` loads the demo estate, `?new` starts a blank one)
- `npm run check`: `tsc --noEmit` + Vite build + ESLint. **Must exit 0 before every commit.** Don't pipe it into grep; check the exit code (`npm run check > log; echo $?`).
- `npm run test:e2e`: Playwright against `vite preview` (build first). Each spec fails on any console error and writes PNGs to `tests/screenshots/` (gitignored).
  - Per-phase specs: `smoke`, `phase2`–`phase8`, `demo`. `tests/docs.spec.ts` regenerates the README images in `docs/screenshots/*.jpg`.
  - Headless Chromium uses SwiftShader, which renders only **2–10 fps**. Tests must wait on conditions, not fixed frame counts. The walk controller sub-steps with real time for the same reason.
  - Live site check: `BASE_URL=https://z1fire.github.io/dream-estate-builder/ npx playwright test tests/smoke.spec.ts`
- `npm run build:assets`: the full asset pipeline (download → Blender → convert → thumbnails). Flags: `--skip-download --skip-blender --force-thumbs`.
- Blender 5.2 is installed but **not on PATH** on this machine. Scripts resolve `BLENDER_PATH`, then PATH, then `C:/Program Files/Blender Foundation/Blender*/blender.exe`.
- On Windows, Git-Bash `tar` breaks on `C:` paths, so the download script uses `C:/Windows/System32/tar.exe`.

## Architecture
- **Units**: 1 unit = 1 m; the UI shows feet and acres (`core/math.ts`). The world is 1024 m square centred on the origin, with 1 m terrain cells (`core/types.ts`).
- **EstateDoc** (`core/types.ts`) is the single source of truth: plain serialisable data plus `heights` (Float32 1025²) and `splat` (3 RGBA planes, 10 ground layers).
- **Store** (`core/store.ts`) broadcasts `Change`s; systems subscribe and rebuild only their slice. **Commands** (`core/commands.ts`): every edit goes through `app.cmd.run(cmd)`, or `push()` when it's already applied (brush strokes). Never mutate the doc outside a command (exception: transient gizmo drags, which push one command at drag end).
- **Non-destructive terrain** (`terrain/TerrainSystem.ts` + `terrain/features.ts`): `doc.heights`/`doc.splat` hold the *sculpted base*. `FeatureProvider`s (moats, ponds, streams, roads, retaining walls, building pads, fields/pastures splat) compute `terrain.final` / `terrain.finalSplat`. **Always sample `app.terrain.heightAt()` (final)**; brushes edit the base. Features re-profile when the base changes (debounced). Feature keys are `"<collection>:<id>"`, and `sig` decides whether a feature recomputes.
- **App** (`app/App.ts`): renderer, scene, `CameraRig` (orbit / plan / walk), `Environment`, `TerrainSystem`, systems, layers, tools, picking (`userData.pick = {kind,id}` or a function of instanceId, plus `groundPickers` for flat things such as roads and fields), `blockers` (occupied ground), `boxResolvers` (selection boxes), `inspectors` (properties panels).
- **Input**: pointer listeners are attached to the **viewport div** (OrbitControls captures the pointer there). A tool with `usesLeft` reserves the left button.
- **Modules** (`src/modules.ts`) wire up every system and tool. `main.ts` boots, creates the UI and handles save/load/demo.
- **Buildings** (`buildings/`): `presets.ts` creates `BuildingDef`s (floors, rooms, openings, stairs, starter furniture), and `BuildingMesher.ts` turns one into meshes (per-level groups, a roof group, an `anim` group). Exterior edge `i` comes from `footprint()`; edge 2 / `frontEdge()` faces +Z (front). Openings are `{wall:'ext:i'|interiorWallId, floor, t, …}`. Interior objects are `PlacedObject`s with `buildingId` + `floor` in building-local coordinates (`editing/transform.ts` buildingToWorld/worldToBuilding). Free-standing objects store `pos[1]` as a *height above ground*.
- **Curtain walls** (`buildings/CurtainWallSystem.ts`): towers and gatehouses are separate `BuildingDef`s tagged `extra.wallId` (`wallBuildings()` creates them).
- **Interiors** (`interiors/`): `InteriorSystem` controls cutaway (`BuildingSystem.setCutaway`), the floor bar and room labels; `FloorPlanTool` and `FurnishTool` edit them.
- **Vegetation** is `doc.vegetation[catalogId] = [x,z,scale,rot,tint,…]`, rendered instanced in 64 m cells with distance culling, wind and season tint.
- **Lights**: `environment/Lights.ts` pools N point lights (by quality) and assigns them to the nearest sources each 0.25 s. Lights stay "visible" (intensity 0) so shader light counts never change.
- **Catalog**: `src/catalog/catalog.json` (generated and hand-editable) plus `catalog.ts` types. Models are meshopt-compressed (the loader sets MeshoptDecoder).

## Conventions
- One system per feature (render + subscribe) and one or more `Tool`s (interaction + `panel()`). Inspectors are registered per collection key.
- UI is plain DOM via `ui/dom.ts` (`h`, `slider`, `editSlider` [commits on release = one undo step], `segmented`, `select`, `toggle`) with `ui/theme.css` (parchment and stone, Cinzel + Inter).
- Use InstancedMesh for anything repeated, and `GeoBuilder` (`core/geom.ts`) for procedural meshes (one draw call per material).
- Commit per phase with clear messages ending in the Co-Authored-By line, then push so Pages redeploys. `gh run list` shows deploy status.

## Adding assets
See the README section "Adding a new model". For packs: unzip into `assets-raw/<pack>/`, add a group to `scripts/asset-selection.mjs` (file, id, name, real-world height, extras), then run `node scripts/build-assets.mjs --skip-download --skip-blender`.

## Status (2026-11-17)
All phases are complete and deployed: 0 scaffold, 1 asset pipeline (273 models), 2 terrain + UI + persistence, 3 water and landscaping, 4 castle, 5 interiors, 6 village and farming, 7 animals, 8 walk mode, day/night, seasons, weather, minimap, photo, tour, 9 demo estate "Ravensmoor Castle" + README.

### Known gaps / next steps
- Quaternius' full packs (Medieval Village MegaKit, Stylized Nature MegaKit, full Ultimate Animated Animals) are itch.io / Google Drive downloads that can't be scripted. Only individual poly.pizza models are in. If the user downloads them, add groups to `asset-selection.mjs`.
- Rooms are rectangles; interior wall surfaces use the floor's wall material (rooms don't override wall material).
- Walk collision uses raycasts at two heights against nearby meshes; furniture is solid but there's no crouching or swimming.
- Test FPS is meaningless (SwiftShader). Profile on a real GPU before deep optimisation.

## Future ideas
- Vertex-handle editing for drawn shapes (moats, roads, fields) instead of redrawing them.
- Non-rectangular rooms, curved walls, balconies and bay windows; roof dormers.
- Townsfolk, guards on the wall-walk, carts travelling the roads.
- Impostor billboards for distant trees, GPU-instanced grass, a web-worker terrain feature solver.
- Shareable estate links (compressed doc in the URL hash), and glTF export of the whole estate.
- Sound: ambient birds, water, the tavern, rain.
- Seasonal crops (fields auto-advance with the season), and snow on roofs.
- Multiplayer walk-throughs via WebRTC.

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
- **Chinese style**: `roof: 'eaves'` is meshed by `buildings/chineseRoof.ts` (lofted concave hip roof with upturned corners, skirts, bracket bands, columns, terrace), driven by `extra.{hip, doubleEave, tiers, columns, open, terrace, finial, taper}`. `taper` (m per storey) insets each storey: use `levelInset(b, level)` / `topInset(b)` from `footprint.ts` wherever a storey's footprint matters (mesher, roofs, floor-plan/furnish tools, presets); `fitTaper()` refits rooms and stairs. The presets are `cn_*` (group `'chinese'`, `style: 'chinese'` uses `CN_ROOM_FURNITURE`). Fence styles `cn_wall` (with moon gates at gates) and `bamboo`. Assets come from `blender/generate_chinese.py` (ids `cn_*`, `tree_cherry`, `tree_plum_blossom`, `bamboo*`, tagged `chinese`). The `place:chinese` filter uses a tag. Demo: `persistence/demoChinese.ts` (`?demo=chinese`).
- **Curtain walls** (`buildings/CurtainWallSystem.ts`): towers and gatehouses are separate `BuildingDef`s tagged `extra.wallId` (`wallBuildings()` creates them).
- **Wall ranges** (`buildings/wallRanges.ts`): `lineWallWithRanges(app, wall, opts, doc?)` fills the free stretches along a wall's segments (obstacles: all building footprints incl. arcades, other walls and the wall's own other segments) with range buildings (`range` preset = lodgings with a generated plan; or stables/barracks/storehouse/workshop/great_hall). `backOntoWall(b, wallH)` = blank back (no `ext:0` openings, `extra.backToWall`), `roof: 'lean'` with `extra.roofRise` tucked under the wall-walk. `snapToWall()` drives BuildingTool snapping. Mesher: `roof: 'lean'` (high side at local -Z), `extra.arcade` (m) = arcade along the front (`buildArcade`, pentice roof, or the lean-to carried over it on one-storey buildings). Demo: `persistence/demoCourtyard.ts` (`?demo=estate`), tested by `tests/estate.spec.ts`.
- **Floor plans** (`interiors/planGenerator.ts`): `generatePlan(b, program, style)` lays out every storey of a rect building around a core at the front door (stair hall, or the living room in small single-storey homes; the core moves to one end in narrow buildings and the front door moves with it). Wings are double-loaded (deep), front-corridor, or enfilade; small rooms tuck into the main room's bay when space is tight; spare length goes to main rooms or becomes a sitting room. `furnishBuilding(b)` furnishes rooms by type via `RECIPES[look]` (modern / period / cn) with `RoomPlacer` (wall placement clear of door/window/stair obstacles). `extra.interiorStyle` ('modern'|'period') and `extra.program` (JSON) live on the building. Presets with `plan` generate on creation. The Layout sub-tool in `FloorPlanTool` drives it (`rebuild()` = one undo step incl. furniture). `tests/homes.spec.ts` audits that every bedroom/kitchen/bathroom is furnished.
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
All phases are complete and deployed: 0 scaffold, 1 asset pipeline (434 models), 2 terrain + UI + persistence, 3 water and landscaping, 4 castle, 5 interiors, 6 village and farming, 7 animals, 8 walk mode, day/night, seasons, weather, minimap, photo, tour, 9 demo estate "Ravensmoor Castle" + README. Later: the Quaternius full packs (nature, Medieval Village building kit, wolf) and the Chinese style (buildings, roofs, walls, garden pieces, furniture and the "Jade Lotus Garden" demo, `tests/chinese.spec.ts`). Livable homes (floor-plan generator). Wall ranges + lean-to roofs + arcades and "The Hundred Acre Estate" demo.

### Known gaps / next steps
- Quaternius' full packs are manual downloads (itch.io / Google Drive). They're unzipped in `assets-raw/Quaternius */` and used as groups `QN`, `QU`, `QV`, `QA` in `asset-selection.mjs`: 133 models, ids prefixed `q_` (nature) and `mv_` (Medieval Village, category `building_kit`), plus `wolf`. A fresh clone without them just reports those sources as missing.
- Rooms are rectangles; interior wall surfaces use the wall's own material (rooms don't override it). The generator handles rectangular buildings only (round towers keep their single room per storey).
- Interior furniture is culled beyond 90 m from the camera (`PropsSystem`).
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

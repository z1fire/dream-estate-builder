import type { App } from './app/App';
import { PlaceTool } from './catalog/PlaceTool';
import { PropsSystem } from './catalog/PropsSystem';
import { LightManager } from './environment/Lights';
import { FenceSystem } from './paths/FenceSystem';
import { PathSystem } from './paths/PathSystem';
import { FenceTool, PathTool, RetainingTool, registerPathInspectors } from './paths/PathTools';
import { RetainingSystem } from './paths/RetainingSystem';
import { registerObjectInspector } from './catalog/inspector';
import { GardenTool, ScatterTool } from './vegetation/VegetationTools';
import { VegetationSystem } from './vegetation/VegetationSystem';
import { WaterSystem } from './water/WaterSystem';
import { BuildingSystem } from './buildings/BuildingSystem';
import { CurtainWallSystem } from './buildings/CurtainWallSystem';
import { BuildingTool, CurtainTool, registerBuildingInspectors } from './buildings/BuildingTools';
import { exteriorWallSnap } from './buildings/wallSnap';
import { InteriorSystem } from './interiors/InteriorSystem';
import { FloorPlanTool } from './interiors/FloorPlanTool';
import { FurnishTool } from './interiors/FurnishTool';
import { MoatTool, PondTool, StreamTool, registerWaterInspectors } from './water/WaterTools';

export interface ModuleHooks {
  photo?: () => void;
  tour?: () => void;
  afterDemo?: () => Promise<void>;
}

/** Shared systems that later modules need to reach. */
export interface Systems {
  lights: LightManager;
  props: PropsSystem;
  water: WaterSystem;
  vegetation: VegetationSystem;
  paths: PathSystem;
  fences: FenceSystem;
  buildings: BuildingSystem;
  walls: CurtainWallSystem;
  interior: InteriorSystem;
}

/** Registers feature modules (systems + tools). Each phase adds its module here. */
export function registerModules(app: App): ModuleHooks & { systems: Systems } {
  const lights = new LightManager(app);
  // --- Phase 3: water & landscaping ---
  const water = app.addSystem(new WaterSystem(app), 'water') as WaterSystem;
  app.water = water;
  const vegetation = app.addSystem(new VegetationSystem(app), 'vegetation') as VegetationSystem;
  app.isTreeKind = vegetation.isTreeKind;
  const props = new PropsSystem(app, lights);
  app.addSystem(props);
  app.addToLayer('props', props.exterior);
  app.addToLayer('interiors', props.interior);
  const paths = app.addSystem(new PathSystem(app), 'paths') as PathSystem;
  const fences = app.addSystem(new FenceSystem(app), 'paths') as FenceSystem;
  app.addSystem(new RetainingSystem(app), 'terrain');

  app.registerTool(new MoatTool(app, water));
  app.registerTool(new PondTool(app, water));
  app.registerTool(new StreamTool(app));
  app.registerTool(new ScatterTool(app));
  app.registerTool(new GardenTool(app));
  app.registerTool(new PathTool(app));
  app.registerTool(new FenceTool(app));
  app.registerTool(new RetainingTool(app));
  for (const f of ['nature', 'garden', 'castle', 'village', 'farm']) app.registerTool(new PlaceTool(app, f));
  registerWaterInspectors(app);
  registerPathInspectors(app);
  registerObjectInspector(app);

  // --- Phase 4: castle & buildings ---
  const buildings = app.addSystem(new BuildingSystem(app), 'buildings') as BuildingSystem;
  const walls = app.addSystem(new CurtainWallSystem(app), 'buildings') as CurtainWallSystem;
  app.registerTool(new CurtainTool(app));
  for (const g of ['castle', 'village', 'farm'] as const) app.registerTool(new BuildingTool(app, g));
  registerBuildingInspectors(app, water);
  // outdoor wall-mounted items (torches, banners) snap to facades and curtain walls
  for (const f of ['castle', 'village', 'farm', 'garden']) app.registerTool(new PlaceTool(app, f, (ev, item) => exteriorWallSnap(app, ev, item)));

  // --- Phase 5: interiors ---
  const interior = app.addSystem(new InteriorSystem(app, buildings, props)) as InteriorSystem;
  app.registerTool(new FloorPlanTool(app, interior));
  app.registerTool(new FurnishTool(app, interior));

  const hooks: ModuleHooks & { systems: Systems } = { systems: { lights, props, water, vegetation, paths, fences, buildings, walls, interior } };
  return hooks;
}

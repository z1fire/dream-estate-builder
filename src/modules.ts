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

  const hooks: ModuleHooks & { systems: Systems } = { systems: { lights, props, water, vegetation, paths, fences } };
  return hooks;
}

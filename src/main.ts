import './ui/theme.css';
import * as THREE from 'three';
import { App } from './app/App';
import { newEstate, rectBoundary } from './core/estate';
import { bboxOf } from './core/math';
import type { EstateDoc } from './core/types';
import { MeasureTool } from './editing/MeasureTool';
import { SelectTool } from './editing/SelectTool';
import { Selection } from './editing/Selection';
import { Autosave } from './persistence/Autosave';
import { downloadText, exportEstateJSON, importEstateJSON, lastEstateId, listEstates, loadEstate, pickFile } from './persistence/storage';
import { BoundarySystem, BoundaryTool } from './terrain/BoundarySystem';
import { PaintTool, TerrainTool } from './terrain/TerrainTools';
import { toast } from './ui/dom';
import { Labels } from './ui/Labels';
import { UI } from './ui/UI';
import { estatesDialog, newEstateWizard, type WizardResult } from './ui/Wizard';
import { registerModules } from './modules';

async function boot() {
  const params = new URLSearchParams(location.search);
  let doc: EstateDoc | null = null;
  let firstRun = false;
  if (!params.has('new') && !params.has('demo')) {
    try {
      const last = await lastEstateId();
      if (last) doc = await loadEstate(last);
    } catch (e) { console.warn('Could not load last estate', e); }
  }
  if (!doc) {
    firstRun = !params.has('new') && !params.has('demo') && (await listEstates().catch(() => [])).length === 0;
    doc = newEstate('My Dream Estate', rectBoundary(400, 400), { seed: 7 });
  }

  const root = document.getElementById('app')!;
  const app = new App(root, doc);
  app.labels = new Labels(app);
  app.selection = new Selection(app);
  const boundary = new BoundarySystem(app);
  app.addSystem(boundary);

  app.registerTool(new SelectTool(app));
  app.registerTool(new MeasureTool(app));
  app.registerTool(new BoundaryTool(app));
  app.registerTool(new TerrainTool(app));
  app.registerTool(new PaintTool(app));
  const mods = registerModules(app);

  const autosave = new Autosave(app);

  const frameEstate = () => {
    const b = app.store.doc.boundary;
    if (b.length < 3) return;
    const bb = bboxOf(b);
    const size = Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ);
    const c = new THREE.Vector3((bb.minX + bb.maxX) / 2, 0, (bb.minZ + bb.maxZ) / 2);
    app.rig.orbit.target.copy(c);
    app.rig.persp.position.set(c.x + size * 0.45, size * 0.55, c.z + size * 0.75);
  };

  const replaceDoc = (d: EstateDoc) => {
    app.store.replace(d);
    app.selection.clear();
    frameEstate();
  };

  const createFromWizard = (r: WizardResult) => {
    const d = newEstate(r.name, rectBoundary(r.widthM, r.depthM), { hills: r.hills });
    replaceDoc(d);
    void autosave.saveNow();
    if (r.mode === 'draw') { ui.setMode('select', 'boundary'); toast('Click the corners of your property to draw its boundary'); }
    else toast(`Welcome to ${r.name}!`);
  };

  const loadDemo = async () => {
    toast('Building the demo estate…', 4000);
    if (app.store.dirtySinceSave) await autosave.saveNow(); // never lose the estate you were working on
    await new Promise((r) => setTimeout(r, 30));
    const { buildDemoEstate } = await import('./persistence/demo');
    await buildDemoEstate(app); // loads itself into the store
    app.selection.clear();
    frameEstate();
    await mods.afterDemo?.();
    void autosave.saveNow();
    toast('Welcome to Ravensmoor — try Views ▸ Play guided tour, or press K to walk around', 5000);
  };

  const ui = new UI(app, {
    newEstate: () => newEstateWizard(createFromWizard),
    openEstates: () => void estatesDialog(app.store.doc.id, async (id) => {
      if (app.store.dirtySinceSave) await autosave.saveNow();
      const d = await loadEstate(id);
      if (d) { replaceDoc(d); toast(`Opened ${d.name}`); }
    }, () => newEstateWizard(createFromWizard), () => void loadDemo()),
    save: async () => { if (await autosave.saveNow()) toast('Estate saved'); },
    exportJSON: async () => {
      const text = await exportEstateJSON(app.store.doc);
      downloadText(`${app.store.doc.name.replace(/[^\w-]+/g, '_')}.estate.json`, text);
      toast('Estate exported');
    },
    importJSON: async () => {
      const f = await pickFile('.json,application/json');
      if (!f) return;
      try {
        const d = await importEstateJSON(await f.text());
        replaceDoc(d);
        void autosave.saveNow();
        toast(`Imported ${d.name}`);
      } catch (e) { toast(`Import failed: ${(e as Error).message}`); }
    },
    loadDemo: () => void loadDemo(),
    rename: (name) => { app.store.doc.name = name; app.store.notify({ type: 'boundary' }); },
    photo: () => mods.photo?.(),
    tour: () => mods.tour?.(),
  });
  app.ui = ui;
  ui.onEnterBuilding = (id) => mods.systems.interior.enter(id);
  (app as any).__interior = mods.systems.interior; // test/debug hook
  autosave.onState = (s) => ui.setSaveState(s);

  frameEstate();
  app.start();
  (window as any).app = app;
  (window as any).deb = { loadDemo, ui, autosave };
  document.getElementById('boot')?.classList.add('hide');

  if (params.has('demo')) await loadDemo();
  else if (firstRun) newEstateWizard(createFromWizard);
}

boot().catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.textContent = `Something went wrong: ${(e as Error).message}`;
});

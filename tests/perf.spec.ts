import { test } from '@playwright/test';

// Run on demand: PERF_DEMOS=estate,courtyard [PERF_FROM=0 PERF_VPS=4] npx playwright test tests/perf.spec.ts
/** Rendering budget probe: draw calls / triangles per scene group from each viewpoint, plus CPU time per frame stage (logged, not asserted). */
for (const demo of (process.env.PERF_DEMOS ?? '').split(',').filter(Boolean)) {
  test(`perf probe: ${demo}`, async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto(`./?demo=${demo}`);
    await page.waitForFunction(() => (window as any).app?.store.doc.buildings.length > 10, null, { timeout: 300_000 });
    await page.evaluate(() => (window as any).app.setQuality('low'));
    await page.waitForTimeout(10000);
    const out = await page.evaluate(async (range) => {
      const app = (window as any).app;
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const vps = app.store.doc.viewpoints;
      // CPU timing per stage: wrap every system update, the terrain/env updates, the scene matrix update and the render call
      const t: Record<string, number> = {};
      const wrap = (obj: any, key: string, label: string) => {
        const f = obj[key].bind(obj);
        obj[key] = (...a: any[]) => { const s = performance.now(); const r = f(...a); t[label] = (t[label] ?? 0) + performance.now() - s; return r; };
      };
      for (const s of app.systems) if (s.update) wrap(s, 'update', s.group?.name || s.constructor.name);
      wrap(app.terrain, 'update', 'terrain.update'); wrap(app.env, 'update', 'env.update'); wrap(app.rig, 'update', 'rig.update');
      wrap(app.scene, 'updateMatrixWorld', 'scene.updateMatrixWorld');
      wrap(app.renderer, 'render', 'renderer.render (incl. matrices)');
      app.frameHooks.forEach((h: any, i: number) => { app.frameHooks[i] = (...a: any[]) => { const s = performance.now(); h(...a); t[`hook${i}`] = (t[`hook${i}`] ?? 0) + performance.now() - s; }; });
      let nodes = 0; app.scene.traverse(() => nodes++);
      const live: Record<string, number> = {};
      const walk = (o: any, k: string) => { live[k] = (live[k] ?? 0) + 1; for (const c of o.children) if (c.matrixWorldAutoUpdate) walk(c, k); };
      for (const c of app.scene.children) walk(c, c.name || c.type);
      const res: any[] = [];
      for (const v of vps.slice(range[0], range[1])) {
        app.rig.cancelFlight?.(); app.rig.persp.position.set(...v.pos); app.rig.orbit.target.set(...v.target); app.rig.orbit.update();
        for (let i = 0; i < 4; i++) await frame();
        for (const k in t) delete t[k];
        const N = 6;
        for (let i = 0; i < N; i++) await frame();
        const row: any = { vp: v.name, calls: app.renderer.info.render.calls, ktris: Math.round(app.renderer.info.render.triangles / 1000) };
        for (const k of Object.keys(t).sort((a, b) => t[b] - t[a])) if (t[k] / N > 0.3) row[k] = +(t[k] / N).toFixed(1);
        res.push(row);
      }
      return { nodes, live, res, objects: app.store.doc.objects.length };
    }, [Number(process.env.PERF_FROM ?? 0), Number(process.env.PERF_VPS ?? 4)]);
    console.log(demo, JSON.stringify(out, null, 1));
  });
}

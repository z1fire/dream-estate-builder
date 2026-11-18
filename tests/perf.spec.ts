import { test } from '@playwright/test';

/** Rendering budget probe: estimated draw calls / triangles per scene group from each viewpoint (logged, not asserted). */
// Run on demand: PERF_DEMOS=estate,courtyard [PERF_FROM=0 PERF_VPS=4] npx playwright test tests/perf.spec.ts
for (const demo of (process.env.PERF_DEMOS ?? '').split(',').filter(Boolean)) {
  test(`perf probe: ${demo}`, async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto(`./?demo=${demo}`);
    await page.waitForFunction(() => (window as any).app?.store.doc.buildings.length > 10, null, { timeout: 300_000 });
    await page.waitForTimeout(10000);
    const out = await page.evaluate(async (vpMax) => {
      const app = (window as any).app;
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const vps = app.store.doc.viewpoints;
      const res: any[] = [];
      for (const v of vps.slice(vpMax[0], vpMax[1])) {
        app.rig.cancelFlight?.(); app.rig.persp.position.set(...v.pos); app.rig.orbit.target.set(...v.target); app.rig.orbit.update();
        for (let i = 0; i < 3; i++) await frame();
        const cam = app.rig.camera; cam.updateMatrixWorld();
        const F = new cam.frustumCulled.constructor; void F;
        const fr = new (app.rig.camera.constructor.prototype.constructor === undefined ? Object : Object)();
        void fr;
        const THREE_Frustum = (window as any).deb?.THREE?.Frustum;
        const row: any = { vp: v.name, calls: app.renderer.info.render.calls, tris: Math.round(app.renderer.info.render.triangles / 1000) + 'k' };
        const sum: Record<string, [number, number, number]> = {};
        app.scene.traverseVisible((o: any) => {
          if (!o.isMesh) return;
          let p = o; while (p.parent && p.parent !== app.scene) p = p.parent;
          const k = p.name || p.type;
          const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
          const inst = o.isInstancedMesh ? o.count : 1;
          sum[k] ??= [0, 0, 0]; sum[k][0]++; sum[k][1] += n * inst; if (o.castShadow) sum[k][2]++;
        });
        for (const k in sum) row[k] = `${sum[k][0]} meshes (${sum[k][2]} shadow) ${Math.round(sum[k][1] / 1000)}k tris`;
        void THREE_Frustum;
        res.push(row);
      }
      return { res, buildings: app.store.doc.buildings.length, objects: app.store.doc.objects.length, interior: app.store.doc.objects.filter((o: any) => o.buildingId).length, quality: app.quality, veg: Object.fromEntries(Object.entries(app.store.doc.vegetation).map(([k, v]: any) => [k, v.length / 5])) };
    }, [Number(process.env.PERF_FROM ?? 0), Number(process.env.PERF_VPS ?? 4)]);
    console.log(demo, JSON.stringify(out, null, 1));
  });
}

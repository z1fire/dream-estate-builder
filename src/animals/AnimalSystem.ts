import * as THREE from 'three';
import type { App, System } from '../app/App';
import { catalogItem } from '../catalog/catalog';
import { instantiate } from '../catalog/loader';
import { bboxOf, pointInPolygon, rng, type V2 } from '../core/math';
import type { AnimalDef, Species } from '../core/types';

export const SPECIES: { id: Species; label: string; variants: [string, string][]; speed: number; roam: number }[] = [
  { id: 'horse', label: 'Horse', variants: [['horse', 'Bay'], ['horse_white', 'White'], ['donkey', 'Donkey']], speed: 1.5, roam: 18 },
  { id: 'cow', label: 'Cow', variants: [['cow', 'Cow'], ['bull', 'Bull']], speed: 0.9, roam: 14 },
  { id: 'sheep', label: 'Sheep', variants: [['sheep', 'Sheep'], ['alpaca', 'Alpaca']], speed: 0.8, roam: 12 },
  { id: 'goat', label: 'Goat', variants: [['goat', 'Goat']], speed: 0.9, roam: 12 },
  { id: 'pig', label: 'Pig', variants: [['pig', 'Pig']], speed: 0.7, roam: 9 },
  { id: 'chicken', label: 'Chicken', variants: [['chicken', 'Hen'], ['chick', 'Chick']], speed: 0.6, roam: 7 },
  { id: 'duck', label: 'Duck', variants: [['duck', 'Mallard']], speed: 0.5, roam: 10 },
  { id: 'dog', label: 'Dog', variants: [['dog', 'Hound'], ['husky', 'Wolfhound'], ['shiba', 'Terrier']], speed: 1.5, roam: 25 },
  { id: 'deer', label: 'Deer', variants: [['deer', 'Doe'], ['stag', 'Stag'], ['fox', 'Fox']], speed: 1.3, roam: 30 },
];
export const speciesInfo = (s: Species) => SPECIES.find((x) => x.id === s)!;
export const modelOf = (a: AnimalDef) => a.variant ?? speciesInfo(a.species).variants[0][0];

type Mode = 'idle' | 'eat' | 'walk' | 'run' | 'swim';
interface Agent {
  def: AnimalDef;
  sig: string;
  holder: THREE.Group;
  mixer?: THREE.AnimationMixer;
  actions: Partial<Record<Mode, THREE.AnimationAction>>;
  current?: THREE.AnimationAction;
  pos: THREE.Vector2;
  heading: number;
  target: THREE.Vector2 | null;
  mode: Mode;
  timer: number;
  rnd: () => number;
}

function pickClip(clips: THREE.AnimationClip[], tests: RegExp[]): THREE.AnimationClip | undefined {
  for (const t of tests) { const c = clips.find((x) => t.test(x.name)); if (c) return c; }
  return undefined;
}

/** Animated livestock & wildlife wandering inside pastures (or around home), ducks swimming. */
export class AnimalSystem implements System {
  group = new THREE.Group();
  private agents = new Map<string, Agent>();
  private v2 = new THREE.Vector2();

  constructor(private app: App) {
    this.group.name = 'animals';
    app.store.subscribe((c) => {
      if (c.type === 'doc') this.sync(true);
      else if (c.type === 'collection' && (c.key === 'animals' || c.key === 'pastures')) this.sync(false);
    });
    app.boxResolvers.set('animals', (id) => { const a = this.agents.get(id); return a ? new THREE.Box3().setFromObject(a.holder) : null; });
    this.sync(true);
  }

  get count() { return this.agents.size; }

  sync(force: boolean) {
    const doc = this.app.store.doc;
    const ids = new Set(doc.animals.map((a) => a.id));
    for (const [id, a] of this.agents) if (!ids.has(id) || force) { this.group.remove(a.holder); this.agents.delete(id); }
    for (const def of doc.animals) {
      const sig = JSON.stringify(def);
      const cur = this.agents.get(def.id);
      if (cur && cur.sig === sig) continue;
      if (cur) {
        // moved/edited: respawn at the new home but keep the model
        cur.def = def; cur.sig = sig; cur.pos.set(def.pos[0], def.pos[1]); cur.target = null; cur.timer = 0.5;
        cur.holder.scale.setScalar(def.scale);
        if (modelOf(def) === cur.holder.userData.model) continue;
        this.group.remove(cur.holder); this.agents.delete(def.id);
      }
      this.spawn(def, sig);
    }
  }

  private spawn(def: AnimalDef, sig: string) {
    const model = modelOf(def);
    const item = catalogItem(model);
    const holder = new THREE.Group();
    holder.userData.pick = { kind: 'animals', id: def.id };
    holder.userData.model = model;
    holder.scale.setScalar(def.scale);
    const seed = def.id.split('').reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
    const agent: Agent = { def, sig, holder, actions: {}, pos: new THREE.Vector2(def.pos[0], def.pos[1]), heading: (seed % 628) / 100, target: null, mode: 'idle', timer: (seed % 300) / 100, rnd: rng(seed) };
    this.agents.set(def.id, agent);
    this.group.add(holder);
    this.place(agent);
    if (!item) return;
    void instantiate(item.model).then(({ object, animations }) => {
      if (this.agents.get(def.id) !== agent) return;
      holder.add(object);
      if (animations.length) {
        const mixer = new THREE.AnimationMixer(object);
        agent.mixer = mixer;
        const A = (re: RegExp[]) => { const c = pickClip(animations, re); return c ? mixer.clipAction(c) : undefined; };
        agent.actions.idle = A([/(^|\|)Idle$/, /Idle/]);
        agent.actions.walk = A([/(^|\|)Walk$/, /Walk/]);
        agent.actions.eat = A([/(^|\|)Eating$/, /Idle_Eating$/, /Eat$/, /Idle_Peck$/, /Idle_Headlow$/, /HeadLow/]) ?? agent.actions.idle;
        agent.actions.run = A([/(^|\|)Gallop$/, /(^|\|)Run$/]) ?? agent.actions.walk;
        agent.actions.swim = A([/Swim/]) ?? agent.actions.idle;
        this.play(agent, agent.mode);
        mixer.update(agent.rnd() * 3);
      }
      this.app.selection.refreshHelpers();
    });
  }

  private play(a: Agent, m: Mode) {
    const act = a.actions[m] ?? a.actions.idle;
    if (!act || act === a.current) return;
    act.reset().setEffectiveWeight(1).fadeIn(0.35).play();
    a.current?.fadeOut(0.35);
    a.current = act;
  }

  /** Movement area polygon for an animal (pasture) or null for free roaming. */
  private area(a: Agent): V2[] | null {
    if (!a.def.pastureId) return null;
    return this.app.store.doc.pastures.find((p) => p.id === a.def.pastureId)?.points ?? null;
  }

  private valid(a: Agent, x: number, z: number): boolean {
    const water = this.app.water;
    if (a.def.species === 'duck' && a.def.waterId) return !!water && water.bodyAt(x, z) === a.def.waterId;
    const area = this.area(a);
    if (area && !pointInPolygon(x, z, area)) return false;
    if (!area && Math.hypot(x - a.def.pos[0], z - a.def.pos[1]) > speciesInfo(a.def.species).roam) return false;
    if (water?.isWater(x, z, 0.8)) return false;
    if (this.app.isBlocked(x, z) && !area) return false;
    const b = this.app.store.doc.boundary;
    if (b.length > 2 && !pointInPolygon(x, z, b)) return false;
    return true;
  }

  private newTarget(a: Agent): THREE.Vector2 | null {
    const area = this.area(a);
    const sp = speciesInfo(a.def.species);
    for (let k = 0; k < 12; k++) {
      let x: number, z: number;
      if (a.def.species === 'duck' && a.def.waterId && this.app.water) {
        const p = this.app.water.randomPointOn(a.def.waterId, a.rnd);
        if (!p) return null;
        [x, z] = p;
      } else if (area && k > 5) {
        const bb = bboxOf(area);
        x = bb.minX + a.rnd() * (bb.maxX - bb.minX); z = bb.minZ + a.rnd() * (bb.maxZ - bb.minZ);
      } else {
        const ang = a.rnd() * Math.PI * 2, r = 2 + a.rnd() * sp.roam * 0.6;
        x = a.pos.x + Math.cos(ang) * r; z = a.pos.y + Math.sin(ang) * r;
      }
      if (this.valid(a, x, z)) return new THREE.Vector2(x, z);
    }
    return null;
  }

  private place(a: Agent) {
    let y = this.app.terrain.heightAt(a.pos.x, a.pos.y);
    if (a.def.species === 'duck' && a.def.waterId && this.app.water) y = (this.app.water.levelOf(a.def.waterId, a.pos.x, a.pos.y) ?? y) - 0.08;
    a.holder.position.set(a.pos.x, y, a.pos.y);
    a.holder.rotation.y = a.heading;
  }

  update(dt: number) {
    if (!this.agents.size) return;
    const cam = this.app.rig.camera.position;
    const list = [...this.agents.values()];
    for (const a of list) {
      const far = a.holder.position.distanceToSquared(cam) > 300 * 300;
      const step = far ? dt : dt;
      a.timer -= step;
      const sp = speciesInfo(a.def.species);
      if (a.mode === 'walk' || a.mode === 'run' || (a.mode === 'swim' && a.target)) {
        if (!a.target) { a.mode = 'idle'; a.timer = 2; }
        else {
          const speed = sp.speed * (a.mode === 'run' ? 2.6 : 1) * a.def.scale;
          this.v2.subVectors(a.target, a.pos);
          const d = this.v2.length();
          // separation from neighbours
          for (const b of list) {
            if (b === a || b.def.pastureId !== a.def.pastureId) continue;
            const dx = a.pos.x - b.pos.x, dz = a.pos.y - b.pos.y, dd = dx * dx + dz * dz;
            if (dd < 2.5 && dd > 1e-4) { this.v2.x += (dx / dd) * 1.2; this.v2.y += (dz / dd) * 1.2; }
          }
          const want = Math.atan2(this.v2.x, this.v2.y);
          let diff = want - a.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          a.heading += Math.max(-2.5 * dt, Math.min(2.5 * dt, diff));
          const move = Math.min(d, speed * dt) * Math.max(0, Math.cos(diff));
          const nx = a.pos.x + Math.sin(a.heading) * move, nz = a.pos.y + Math.cos(a.heading) * move;
          if (this.valid(a, nx, nz)) a.pos.set(nx, nz);
          else { a.target = this.newTarget(a); }
          if (d < 0.4 || a.timer < -20) { a.target = null; a.mode = a.def.species === 'duck' && a.def.waterId ? 'swim' : a.rnd() < 0.55 ? 'eat' : 'idle'; a.timer = 2 + a.rnd() * 6; }
        }
      } else if (a.timer <= 0) {
        a.target = this.newTarget(a);
        if (a.target) {
          a.mode = a.def.species === 'duck' && a.def.waterId ? 'swim' : a.rnd() < 0.08 && sp.speed > 1 ? 'run' : 'walk';
          a.timer = 0;
        } else { a.mode = 'idle'; a.timer = 3; }
      }
      this.play(a, a.mode === 'swim' && !a.target ? 'swim' : a.mode);
      this.place(a);
      if (!far) a.mixer?.update(dt);
    }
  }
}

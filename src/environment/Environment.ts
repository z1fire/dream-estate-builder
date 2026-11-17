import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { clamp, lerp, smoothstep } from '../core/math';
import type { Season, Weather } from '../core/types';

export const SEASON_TINT: Record<Season, { grass: THREE.Color; leaves: THREE.Color; snow: number }> = {
  spring: { grass: new THREE.Color(1.0, 1.08, 0.9), leaves: new THREE.Color(0.95, 1.1, 0.85), snow: 0 },
  summer: { grass: new THREE.Color(1, 1, 1), leaves: new THREE.Color(1, 1, 1), snow: 0 },
  autumn: { grass: new THREE.Color(1.12, 0.95, 0.7), leaves: new THREE.Color(1.6, 0.8, 0.35), snow: 0 },
  winter: { grass: new THREE.Color(0.9, 0.9, 0.85), leaves: new THREE.Color(0.75, 0.72, 0.65), snow: 1 },
};

/** Sky, sun/moon, fog, day-night, season and weather. */
export class Environment {
  sky = new Sky();
  sun = new THREE.DirectionalLight('#fff4e0', 3);
  hemi = new THREE.HemisphereLight('#cfe3ff', '#5a5040', 1.1);
  moon = new THREE.DirectionalLight('#8aa4ff', 0);
  stars: THREE.Points;
  fog: THREE.FogExp2;
  time = 15;
  season: Season = 'summer';
  weather: Weather = 'clear';
  /** 0 = full day, 1 = full night */
  night = 0;
  private rain: THREE.LineSegments;
  private rainVel: Float32Array;
  private snowFlakes: THREE.Points;
  private sunDir = new THREE.Vector3();
  onSeason: (s: Season) => void = () => {};
  shadowTarget = new THREE.Vector3();
  shadowSize = 160;

  constructor(scene: THREE.Scene) {
    this.sky.scale.setScalar(20000);
    this.sky.userData.noPick = true;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 1500;
    scene.add(this.sun, this.sun.target, this.hemi, this.moon, this.moon.target);

    this.fog = new THREE.FogExp2('#c8d6e0', 0.0009);
    scene.fog = this.fog;

    // stars
    const sp = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      sp.set([Math.sin(ph) * Math.cos(th) * 9000, Math.cos(ph) * 9000, Math.sin(ph) * Math.sin(th) * 9000], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.userData.noPick = true;
    scene.add(this.stars);

    // rain
    const N = 6000;
    const rp = new Float32Array(N * 6);
    this.rainVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 120, y = Math.random() * 60, z = (Math.random() - 0.5) * 120;
      rp.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
      this.rainVel[i] = 18 + Math.random() * 8;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#aab8c8', transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.userData.noPick = true;
    scene.add(this.rain);

    const S = 3000;
    const snp = new Float32Array(S * 3);
    for (let i = 0; i < S; i++) snp.set([(Math.random() - 0.5) * 120, Math.random() * 50, (Math.random() - 0.5) * 120], i * 3);
    const sng = new THREE.BufferGeometry();
    sng.setAttribute('position', new THREE.BufferAttribute(snp, 3));
    this.snowFlakes = new THREE.Points(sng, new THREE.PointsMaterial({ color: '#ffffff', size: 0.18, transparent: true, opacity: 0.9 }));
    this.snowFlakes.frustumCulled = false;
    this.snowFlakes.visible = false;
    this.snowFlakes.userData.noPick = true;
    scene.add(this.snowFlakes);
    this.apply();
  }

  setTime(h: number) { this.time = ((h % 24) + 24) % 24; this.apply(); }
  setSeason(s: Season) { this.season = s; this.apply(); this.onSeason(s); }
  setWeather(w: Weather) { this.weather = w; this.apply(); }

  get sunDirection() { return this.sunDir; }

  apply() {
    // sun path: rises 6h east (+x), sets 18h west, peaks at ~60° elevation, slightly south
    const t = (this.time - 6) / 12; // 0..1 during day
    const elev = Math.sin(clamp(t, -0.15, 1.15) * Math.PI) * rad(62);
    this.sunDir.set(Math.cos(t * Math.PI) * Math.cos(elev), Math.sin(elev), Math.sin(t * Math.PI) * Math.cos(elev) * 0.5 + 0.15).normalize();
    if (this.time < 5 || this.time > 19) this.sunDir.y = -0.3;
    const dayAmt = smoothstep(-0.08, 0.18, this.sunDir.y);
    this.night = 1 - dayAmt;
    const overcast = this.weather === 'overcast' || this.weather === 'rain' ? 1 : this.weather === 'fog' ? 0.6 : 0;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.rayleigh.value = lerp(1.6, 3.5, overcast * 0.5);
    u.turbidity.value = lerp(6, 18, overcast);
    this.sky.visible = true;

    const golden = smoothstep(0.35, 0.02, this.sunDir.y) * dayAmt;
    this.sun.color.setRGB(1, lerp(0.96, 0.7, golden), lerp(0.88, 0.45, golden));
    this.sun.intensity = dayAmt * lerp(3.2, 0.9, overcast);
    this.sun.castShadow = dayAmt > 0.05 && overcast < 0.9;
    this.hemi.intensity = lerp(0.18, 1.15, dayAmt) * lerp(1, 1.1, overcast);
    this.hemi.color.setRGB(lerp(0.35, 0.82, dayAmt), lerp(0.42, 0.89, dayAmt), lerp(0.7, 1, dayAmt));
    this.hemi.groundColor.setRGB(lerp(0.12, 0.38, dayAmt), lerp(0.12, 0.33, dayAmt), lerp(0.16, 0.25, dayAmt));
    this.moon.intensity = this.night * 0.55;
    this.moon.position.set(-200, 400, -150);

    (this.stars.material as THREE.PointsMaterial).opacity = this.night * (1 - overcast) * 0.9;

    // fog colour follows the sky horizon
    const dayFog = new THREE.Color().setRGB(lerp(0.78, 0.7, overcast), lerp(0.84, 0.73, overcast), lerp(0.9, 0.76, overcast));
    const duskFog = new THREE.Color('#d9a07a');
    const nightFog = new THREE.Color('#141b2b');
    const fc = dayFog.clone().lerp(duskFog, golden * 0.6).lerp(nightFog, this.night);
    this.fog.color.copy(fc);
    this.fog.density = this.weather === 'fog' ? 0.012 : this.weather === 'rain' ? 0.0035 : overcast ? 0.0018 : 0.0009;
    if (this.night > 0.6) this.sky.visible = true;

    this.rain.visible = this.weather === 'rain' && this.season !== 'winter';
    this.snowFlakes.visible = (this.weather === 'rain' || this.weather === 'overcast') && this.season === 'winter';
  }

  /** Background clear colour (used under the sky at night). */
  get clearColor() { return this.fog.color; }

  update(dt: number, camera: THREE.Camera) {
    // shadow camera follows the focus point
    const s = this.shadowSize;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    if (sc.right !== s) { sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.updateProjectionMatrix(); }
    const tgt = this.shadowTarget;
    // texel snapping to avoid shimmering
    const texel = (2 * s) / this.sun.shadow.mapSize.x;
    const tx = Math.round(tgt.x / texel) * texel, tz = Math.round(tgt.z / texel) * texel;
    this.sun.target.position.set(tx, tgt.y, tz);
    this.sun.position.set(tx, tgt.y, tz).addScaledVector(this.sunDir, 600);
    this.moon.target.position.copy(this.sun.target.position);
    this.moon.position.copy(this.sun.target.position).add(new THREE.Vector3(-200, 400, -150));

    const cp = camera.position;
    if (this.rain.visible) {
      this.rain.position.set(cp.x, cp.y - 30, cp.z);
      const p = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      for (let i = 0; i < this.rainVel.length; i++) {
        const o = i * 6;
        let y = a[o + 1] - this.rainVel[i] * dt;
        if (y < 0) y += 60;
        a[o + 1] = y; a[o + 4] = y - 0.7;
      }
      p.needsUpdate = true;
    }
    if (this.snowFlakes.visible) {
      this.snowFlakes.position.set(cp.x, cp.y - 25, cp.z);
      const p = this.snowFlakes.geometry.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      const tt = performance.now() / 1000;
      for (let i = 0; i < a.length; i += 3) {
        a[i + 1] -= dt * 1.5;
        a[i] += Math.sin(tt + i) * dt * 0.3;
        if (a[i + 1] < 0) a[i + 1] += 50;
      }
      p.needsUpdate = true;
    }
  }

  get seasonTint() { return SEASON_TINT[this.season]; }
}

function rad(d: number) { return (d * Math.PI) / 180; }

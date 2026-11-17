import * as THREE from 'three';
import { rng } from '../core/math';
import type { MaterialKind, SurfaceMat } from '../core/types';

/** Procedural canvas textures for building surfaces (stylised, tileable). World size of one tile in metres. */
type TexDef = { size: number; draw: (g: CanvasRenderingContext2D, S: number) => void };

const S = 256;
function noise(g: CanvasRenderingContext2D, amt: number, seed: number) {
  const img = g.getImageData(0, 0, S, S), r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}
function blocks(g: CanvasRenderingContext2D, base: string, mortar: string, rows: number, cols: number, vary: number, seed: number, rough = 0) {
  const r = rng(seed);
  g.fillStyle = mortar; g.fillRect(0, 0, S, S);
  const rh = S / rows;
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * 0.5;
    const cw = S / cols;
    for (let x = -1; x <= cols; x++) {
      const c = new THREE.Color(base).multiplyScalar(1 + (r() - 0.5) * vary);
      g.fillStyle = `#${c.getHexString()}`;
      const x0 = (x + off) * cw + 2, y0 = y * rh + 2;
      g.fillRect(x0 + (r() - 0.5) * rough, y0, cw - 4, rh - 4);
    }
  }
}

const DEFS: Record<string, TexDef> = {
  greystone: { size: 2.4, draw: (g) => { blocks(g, '#8f8c85', '#6c6962', 6, 4, 0.18, 1, 3); noise(g, 18, 11); } },
  sandstone: { size: 2.4, draw: (g) => { blocks(g, '#c9b089', '#a68e69', 6, 4, 0.14, 2, 3); noise(g, 16, 12); } },
  whitewash: { size: 3, draw: (g) => { g.fillStyle = '#ece6d8'; g.fillRect(0, 0, S, S); noise(g, 14, 13); } },
  brick: { size: 1.2, draw: (g) => { blocks(g, '#9b4e38', '#c9bfae', 12, 4, 0.2, 3); noise(g, 12, 14); } },
  timber: {
    size: 3, draw: (g) => {
      g.fillStyle = '#ece4d0'; g.fillRect(0, 0, S, S); noise(g, 12, 15);
      g.fillStyle = '#4a3322';
      const b = 16;
      g.fillRect(0, 0, b, S); g.fillRect(0, S - b, S, b); g.fillRect(0, S * 0.5 - b / 2, S, b);
      g.save(); g.translate(0, S * 0.5); g.lineWidth = b; g.strokeStyle = '#4a3322';
      g.beginPath(); g.moveTo(b, 0); g.lineTo(S, -S * 0.5); g.stroke(); g.restore();
    },
  },
  // interior surfaces
  stone: { size: 2, draw: (g) => { blocks(g, '#8c877d', '#6a655c', 5, 3, 0.16, 4, 2); noise(g, 14, 16); } },
  plaster: { size: 3, draw: (g) => { g.fillStyle = '#e3d6bd'; g.fillRect(0, 0, S, S); noise(g, 10, 17); } },
  woodpanel: {
    size: 1.6, draw: (g) => {
      g.fillStyle = '#6e4a2c'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 4; i++) { g.fillStyle = '#5a3b22'; g.fillRect(i * S / 4, 0, 6, S); g.strokeStyle = '#835a37'; g.lineWidth = 4; g.strokeRect(i * S / 4 + 18, 24, S / 4 - 36, S / 2 - 40); g.strokeRect(i * S / 4 + 18, S / 2 + 16, S / 4 - 36, S / 2 - 40); }
      noise(g, 10, 18);
    },
  },
  tapestry: {
    size: 2, draw: (g) => {
      g.fillStyle = '#7d1f1a'; g.fillRect(0, 0, S, S);
      g.strokeStyle = '#c9a24a'; g.lineWidth = 6;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const cx = i * S / 4 + S / 8, cy = j * S / 4 + S / 8;
        g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx + 18, cy); g.lineTo(cx, cy + 18); g.lineTo(cx - 18, cy); g.closePath(); g.stroke();
      }
      noise(g, 10, 19);
    },
  },
  plank: {
    size: 2, draw: (g) => {
      const r = rng(20);
      for (let i = 0; i < 8; i++) { const c = new THREE.Color('#8a6038').multiplyScalar(0.85 + r() * 0.3); g.fillStyle = `#${c.getHexString()}`; g.fillRect(0, i * S / 8, S, S / 8 - 3); }
      g.fillStyle = '#4d331d';
      for (let i = 0; i < 8; i++) { g.fillRect(((i * 97) % S), i * S / 8, 3, S / 8); g.fillRect(0, i * S / 8 + S / 8 - 3, S, 3); }
      noise(g, 12, 21);
    },
  },
  flagstone: { size: 2.4, draw: (g) => { blocks(g, '#8a8378', '#5c574f', 4, 3, 0.22, 5, 6); noise(g, 16, 22); } },
  rug: {
    size: 4, draw: (g) => {
      g.fillStyle = '#7b2a22'; g.fillRect(0, 0, S, S);
      g.strokeStyle = '#d0a85a'; g.lineWidth = 10; g.strokeRect(16, 16, S - 32, S - 32);
      g.strokeStyle = '#1f3c66'; g.lineWidth = 6; g.strokeRect(34, 34, S - 68, S - 68);
      g.fillStyle = '#d0a85a'; g.beginPath(); g.arc(S / 2, S / 2, 40, 0, Math.PI * 2); g.fill();
      noise(g, 8, 23);
    },
  },
  roof_tiles: {
    size: 2, draw: (g) => {
      g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S);
      const r = rng(24);
      for (let y = 0; y < 10; y++) for (let x = -1; x < 9; x++) {
        const v = 150 + r() * 70;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x * 32 + (y % 2) * 16 + 1, y * 26 + 1, 30, 24);
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x * 32 + (y % 2) * 16 + 1, y * 26 + 20, 30, 5);
      }
    },
  },
  thatch: {
    size: 2, draw: (g) => {
      g.fillStyle = '#b8954f'; g.fillRect(0, 0, S, S);
      const r = rng(25);
      for (let i = 0; i < 2600; i++) { const x = r() * S, y = r() * S; g.strokeStyle = r() > 0.5 ? '#d2b067' : '#8f6f35'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + 10 + r() * 10); g.stroke(); }
      for (let y = 0; y < 6; y++) { g.fillStyle = 'rgba(60,40,10,.25)'; g.fillRect(0, y * S / 6, S, 4); }
    },
  },
  ceiling_beams: {
    size: 3, draw: (g) => {
      g.fillStyle = '#d8ccb4'; g.fillRect(0, 0, S, S); noise(g, 10, 26);
      g.fillStyle = '#4e3522'; g.fillRect(0, S / 2 - 18, S, 36); g.fillStyle = '#3c281a'; g.fillRect(0, S / 2 + 12, S, 6);
    },
  },
  glass: { size: 1, draw: (g) => { g.fillStyle = '#7f98a6'; g.fillRect(0, 0, S, S); g.strokeStyle = '#2d2a26'; g.lineWidth = 8; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * S / 4, 0); g.lineTo(i * S / 4, S); g.stroke(); g.beginPath(); g.moveTo(0, i * S / 4); g.lineTo(S, i * S / 4); g.stroke(); } } },
  stained: {
    size: 1, draw: (g) => {
      const cols = ['#a3242a', '#2a4ea3', '#d4a529', '#2f7a3a', '#6a2f8a'];
      const r = rng(27);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(i * S / 6, j * S / 6, S / 6, S / 6); }
      g.strokeStyle = '#1d1a16'; g.lineWidth = 6;
      for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(i * S / 6, 0); g.lineTo(i * S / 6, S); g.stroke(); g.beginPath(); g.moveTo(0, i * S / 6); g.lineTo(S, i * S / 6); g.stroke(); }
    },
  },
  door_planks: {
    size: 1.2, draw: (g) => {
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#6b4528' : '#7a5030'; g.fillRect(i * S / 6, 0, S / 6, S); g.fillStyle = '#3e2816'; g.fillRect(i * S / 6, 0, 3, S); }
      g.fillStyle = '#2b2b2e'; g.fillRect(0, S * 0.18, S, 14); g.fillRect(0, S * 0.78, S, 14);
      noise(g, 10, 28);
    },
  },
  // ---- Chinese style ----
  redlacquer: {
    size: 3, draw: (g) => {
      g.fillStyle = '#a3261c'; g.fillRect(0, 0, S, S); noise(g, 12, 40);
      g.fillStyle = '#6e1712'; g.fillRect(0, 0, 18, S); g.fillRect(S / 2 - 6, 0, 12, S); // posts
      g.fillStyle = '#d8cfbd'; g.fillRect(0, S - 30, S, 30); // pale stone dado at the base
      g.fillStyle = '#7d1b14'; g.fillRect(0, S - 34, S, 5);
    },
  },
  greybrick: { size: 1.2, draw: (g) => { blocks(g, '#6f747a', '#9ea2a5', 12, 4, 0.12, 41); noise(g, 10, 42); } },
  cn_tiles: {
    // glazed barrel tiles: vertical channels (u across the roof, v down the slope), tinted by roofColor
    size: 1.2, draw: (g) => {
      const n = 8, w = S / n;
      for (let i = 0; i < n; i++) {
        const grd = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
        grd.addColorStop(0, '#6a6a6a'); grd.addColorStop(0.35, '#f2f2f2'); grd.addColorStop(0.7, '#b8b8b8'); grd.addColorStop(1, '#5a5a5a');
        g.fillStyle = grd; g.fillRect(i * w, 0, w, S);
      }
      g.fillStyle = 'rgba(0,0,0,.28)';
      for (let y = 0; y < 6; y++) for (let i = 0; i < n; i++) g.fillRect(i * w + 2, y * S / 6 + ((i % 2) * S) / 12, w - 4, 3);
    },
  },
  lattice: {
    // rice-paper window with a red geometric lattice (also glows at night)
    size: 1, draw: (g) => {
      g.fillStyle = '#efe3c6'; g.fillRect(0, 0, S, S);
      g.strokeStyle = '#7a1a12'; g.lineWidth = 7;
      const k = 8;
      for (let i = 0; i <= k; i++) { g.beginPath(); g.moveTo(i * S / k, 0); g.lineTo(i * S / k, S); g.stroke(); g.beginPath(); g.moveTo(0, i * S / k); g.lineTo(S, i * S / k); g.stroke(); }
      g.lineWidth = 4;
      for (let i = 0; i < k; i += 2) for (let j = 0; j < k; j += 2) { g.strokeRect(i * S / k + S / (k * 2) - 6, j * S / k + S / (k * 2) - 6, S / k + 12, S / k + 12); }
      g.strokeStyle = '#5a120d'; g.lineWidth = 14; g.strokeRect(0, 0, S, S);
    },
  },
  door_lattice: {
    size: 2.6, draw: (g) => {
      g.fillStyle = '#9b2318'; g.fillRect(0, 0, S, S);
      for (const x0 of [0, S / 2]) {
        g.fillStyle = '#efe3c6'; g.fillRect(x0 + 14, 14, S / 2 - 28, S * 0.55);
        g.strokeStyle = '#7a1a12'; g.lineWidth = 4;
        for (let i = 0; i <= 6; i++) { const x = x0 + 14 + i * (S / 2 - 28) / 6; g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 14 + S * 0.55); g.stroke(); }
        for (let j = 0; j <= 8; j++) { const y = 14 + j * S * 0.55 / 8; g.beginPath(); g.moveTo(x0 + 14, y); g.lineTo(x0 + S / 2 - 14, y); g.stroke(); }
        g.fillStyle = '#7a1a12'; g.fillRect(x0 + 20, S * 0.66, S / 2 - 40, S * 0.28);
        g.fillStyle = '#d4a529'; g.beginPath(); g.arc(x0 + (x0 ? 14 : S / 2 - 14), S * 0.6, 6, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#5a120d'; g.fillRect(S / 2 - 3, 0, 6, S);
    },
  },
  hardwood: {
    size: 2.4, draw: (g) => {
      const r = rng(50);
      for (let i = 0; i < 16; i++) for (let k = 0; k < 3; k++) {
        const c = new THREE.Color('#a8784a').multiplyScalar(0.82 + r() * 0.3);
        g.fillStyle = `#${c.getHexString()}`;
        const off = ((i * 37) % 3) * S / 3 * 0.5;
        g.fillRect(((k * S) / 3 + off) % S, (i * S) / 16, S / 3 - 2, S / 16 - 2);
      }
      noise(g, 8, 51);
    },
  },
  carpet: { size: 2, draw: (g) => { g.fillStyle = '#b9ad9a'; g.fillRect(0, 0, S, S); noise(g, 22, 52); } },
  whitetile: { size: 1.2, draw: (g) => { g.fillStyle = '#c9c9c4'; g.fillRect(0, 0, S, S); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = '#f1f1ee'; g.fillRect(x * S / 4 + 2, y * S / 4 + 2, S / 4 - 4, S / 4 - 4); } noise(g, 5, 53); } },
  paint: { size: 3, draw: (g) => { g.fillStyle = '#efebe3'; g.fillRect(0, 0, S, S); noise(g, 5, 54); } },
  squaretile: { size: 1.6, draw: (g) => { blocks(g, '#5f6064', '#3f4043', 4, 4, 0.1, 43); noise(g, 8, 44); } },
};

const texCache = new Map<string, THREE.CanvasTexture>();
export function texture(name: string): THREE.CanvasTexture {
  let t = texCache.get(name);
  if (t) return t;
  const def = DEFS[name] ?? DEFS.plaster;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  def.draw(g, S);
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(1 / def.size, 1 / def.size);
  texCache.set(name, t);
  return t;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
/** Material for a texture name (+ optional tint), UVs are in metres. */
export function surfaceMaterial(name: string, tint = '#ffffff', opts: { side?: THREE.Side; emissive?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = `${name}|${tint}|${opts.side ?? 0}|${opts.emissive ? 1 : 0}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: texture(name), color: tint, roughness: name === 'glass' || name === 'stained' ? 0.3 : name === 'cn_tiles' ? 0.55 : 0.9, side: opts.side ?? THREE.FrontSide });
  if (opts.emissive) { m.emissive = new THREE.Color(name === 'stained' || name === 'lattice' ? '#ffffff' : '#ffb35a'); m.emissiveMap = texture(name); m.emissiveIntensity = 0; m.userData.nightGlow = true; }
  matCache.set(key, m);
  return m;
}

/** All glowing window materials (driven by night factor). */
export function setWindowGlow(night: number) {
  for (const m of matCache.values()) if (m.userData.nightGlow) m.emissiveIntensity = night * 1.4;
}

export const EXTERIOR_TEX: Record<MaterialKind, string> = { greystone: 'greystone', sandstone: 'sandstone', whitewash: 'whitewash', timber: 'timber', brick: 'brick', redlacquer: 'redlacquer', greybrick: 'greybrick' };
export const SURFACE_TEX: Record<SurfaceMat, string> = {
  stone: 'stone', plaster: 'plaster', woodpanel: 'woodpanel', tapestry: 'tapestry', plank: 'plank', flagstone: 'flagstone', rug: 'rug', brick: 'brick', whitewash: 'whitewash', redlacquer: 'redlacquer', squaretile: 'squaretile', hardwood: 'hardwood', carpet: 'carpet', whitetile: 'whitetile', paint: 'paint',
};
export const SURFACE_LABELS: Record<SurfaceMat, string> = {
  stone: 'Stone', plaster: 'Plaster', woodpanel: 'Wood panelling', tapestry: 'Tapestry', plank: 'Wood planks', flagstone: 'Flagstone', rug: 'Rug', brick: 'Brick', whitewash: 'Whitewash', redlacquer: 'Red lacquer', squaretile: 'Square tiles', hardwood: 'Hardwood', carpet: 'Carpet', whitetile: 'White tiles', paint: 'Painted plaster',
};
export const MATERIAL_LABELS: Record<MaterialKind, string> = { greystone: 'Grey stone', sandstone: 'Sandstone', whitewash: 'Whitewashed', timber: 'Half-timbered', brick: 'Brick', redlacquer: 'Red lacquer (Chinese)', greybrick: 'Grey brick (Chinese)' };

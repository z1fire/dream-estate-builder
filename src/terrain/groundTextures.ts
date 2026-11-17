import * as THREE from 'three';
import { clamp, rng, valueNoise } from '../core/math';
import { GROUND_LAYERS, type GroundLayer } from '../core/types';

/** Stylized, tileable procedural ground textures generated at startup (keeps the low-poly look consistent). */
const SIZE = 256;

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// tileable noise: sample on a torus by wrapping coordinates at period
function tnoise(x: number, y: number, period: number): number {
  const fx = x / SIZE, fy = y / SIZE;
  const a = valueNoise(fx * period, fy * period);
  const b = valueNoise((fx - 1) * period, fy * period);
  const c = valueNoise(fx * period, (fy - 1) * period);
  const d = valueNoise((fx - 1) * period, (fy - 1) * period);
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
function tfbm(x: number, y: number, base: number, oct = 3) {
  let s = 0, a = 0.5, p = base;
  for (let i = 0; i < oct; i++) { s += a * tnoise(x, y, p); p *= 2; a *= 0.5; }
  return s;
}

export const LAYER_COLORS: Record<GroundLayer, string> = {
  grass: '#6d9a3f', meadow: '#8fae4c', dirt: '#8a6a45', mud: '#5d4733', gravel: '#9b968a',
  cobblestone: '#8a857c', sand: '#d6c08c', farmland: '#6e5136', forest: '#4d4a2c', rock: '#7c7a74',
};

function paint(layer: GroundLayer, out: Uint8Array, off: number) {
  const base = hex(LAYER_COLORS[layer]);
  const r = rng(layer.length * 977 + layer.charCodeAt(0));
  const px = (x: number, y: number, c: RGB, k: number) => {
    const i = off + ((y & (SIZE - 1)) * SIZE + (x & (SIZE - 1))) * 4;
    out[i] = clamp(c[0] * k, 0, 255); out[i + 1] = clamp(c[1] * k, 0, 255); out[i + 2] = clamp(c[2] * k, 0, 255); out[i + 3] = 255;
  };
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const n = tfbm(x, y, 8, 3), n2 = tnoise(x, y, 32);
      let k = 1 + n * 0.22 + n2 * 0.06;
      const c: RGB = [...base];
      if (layer === 'grass' || layer === 'meadow') {
        const blade = tnoise(x, y, 64);
        k += blade * 0.08;
        c[1] += n * 14;
        if (layer === 'meadow' && tnoise(x + 17, y, 48) > 0.62) { c[0] = 220; c[1] = 205; c[2] = 110; } // little flowers
      } else if (layer === 'farmland') {
        const row = Math.sin((y / SIZE) * Math.PI * 2 * 16);
        k += row * 0.16;
      } else if (layer === 'rock') {
        k += Math.abs(tnoise(x, y, 16)) * -0.25;
      } else if (layer === 'forest') {
        if (tnoise(x, y, 40) > 0.5) { c[0] = 120; c[1] = 80; c[2] = 40; }
      } else if (layer === 'mud') {
        k += tnoise(x, y, 12) > 0.4 ? -0.15 : 0;
      }
      px(x, y, c, k);
    }
  // overlays: pebbles / stones
  if (layer === 'gravel' || layer === 'dirt' || layer === 'sand') {
    const count = layer === 'gravel' ? 1400 : 220;
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(r() * SIZE), cy = Math.floor(r() * SIZE);
      const rad = layer === 'gravel' ? 1 + r() * 2 : 1 + r();
      const k = 0.75 + r() * 0.5;
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= rad * rad) px(cx + x, cy + y, base, k);
    }
  }
  if (layer === 'cobblestone') {
    // irregular cobbles via jittered grid voronoi
    const cells = 10, pts: [number, number, number][] = [];
    for (let gy = 0; gy < cells; gy++) for (let gx = 0; gx < cells; gx++)
      pts.push([(gx + 0.2 + r() * 0.6) * (SIZE / cells), (gy + 0.2 + r() * 0.6) * (SIZE / cells), 0.8 + r() * 0.35]);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        let d1 = 1e9, d2 = 1e9, tone = 1;
        for (const p of pts)
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const dx = x - (p[0] + ox * SIZE), dy = y - (p[1] + oy * SIZE);
            const d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; tone = p[2]; } else if (d < d2) d2 = d;
          }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const k = edge < 2.2 ? 0.55 : tone * (1 + tnoise(x, y, 32) * 0.1);
        px(x, y, edge < 2.2 ? [90, 80, 65] : base, k);
      }
  }
}

let cached: THREE.DataArrayTexture | null = null;
export function groundTextureArray(): THREE.DataArrayTexture {
  if (cached) return cached;
  const data = new Uint8Array(SIZE * SIZE * 4 * GROUND_LAYERS.length);
  GROUND_LAYERS.forEach((l, i) => paint(l, data, i * SIZE * SIZE * 4));
  const tex = new THREE.DataArrayTexture(data, SIZE, SIZE, GROUND_LAYERS.length);
  tex.format = THREE.RGBAFormat;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}

/** Small RGBA swatch (data URL) for UI buttons. */
export function layerSwatch(layer: GroundLayer, px = 48): string {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const data = new Uint8Array(SIZE * SIZE * 4);
  paint(layer, data, 0);
  const img = g.createImageData(px, px);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const s = ((y * 2) * SIZE + x * 2) * 4, d = (y * px + x) * 4;
    img.data[d] = data[s]; img.data[d + 1] = data[s + 1]; img.data[d + 2] = data[s + 2]; img.data[d + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

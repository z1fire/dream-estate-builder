import * as THREE from 'three';

/** Accumulates flat-shaded, vertex-coloured primitives into one BufferGeometry (one draw call). */
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();

  get vertexCount() { return this.pos.length / 3; }

  /** Add a quad (4 points in order, CCW seen from the front). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color, uvScale = 1) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const base = this.vertexCount;
    for (const p of [a, b, c, d]) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(color.r, color.g, color.b); }
    const w = a.distanceTo(b) / uvScale, hgt = a.distanceTo(d) / uvScale;
    this.uv.push(0, 0, w, 0, w, hgt, 0, hgt);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const base = this.vertexCount;
    for (const p of [a, b, c]) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(color.r, color.g, color.b); }
    this.uv.push(0, 0, 1, 0, 0.5, 1);
    this.idx.push(base, base + 1, base + 2);
  }

  /** Axis-aligned box (in local frame) transformed by matrix. */
  boxM(m: THREE.Matrix4, sx: number, sy: number, sz: number, color: THREE.Color, skipBottom = true) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const P = (px: number, py: number, pz: number) => this.v.set(px, py, pz).applyMatrix4(m).clone();
    const c = [P(-x, -y, -z), P(x, -y, -z), P(x, y, -z), P(-x, y, -z), P(-x, -y, z), P(x, -y, z), P(x, y, z), P(-x, y, z)];
    this.quad(c[4], c[5], c[6], c[7], color); // +z
    this.quad(c[1], c[0], c[3], c[2], color); // -z
    this.quad(c[5], c[1], c[2], c[6], color); // +x
    this.quad(c[0], c[4], c[7], c[3], color); // -x
    this.quad(c[7], c[6], c[2], c[3], color); // +y
    if (!skipBottom) this.quad(c[0], c[1], c[5], c[4], color); // -y
  }

  /** Box centred at (x,y,z), rotated about Y, optional tilt about local X. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, color: THREE.Color, tiltX = 0, tiltZ = 0) {
    this.m.makeRotationFromEuler(new THREE.Euler(tiltX, rotY, tiltZ, 'YXZ')).setPosition(x, y, z);
    this.boxM(this.m, sx, sy, sz, color);
  }

  /** Box spanning from point a to point b (centre-line), with width w (horizontal) and height h (vertical). */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, hgt: number, color: THREE.Color) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const yaw = Math.atan2(d.x, d.z);
    const pitch = -Math.asin(THREE.MathUtils.clamp(d.y / len, -1, 1));
    this.m.makeRotationFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')).setPosition(mid);
    this.boxM(this.m, w, hgt, len, color);
  }

  /** Vertical cylinder / cone (flat shaded) */
  cyl(x: number, y0: number, z: number, r0: number, r1: number, hgt: number, seg: number, color: THREE.Color, cap = true, rotOff = 0) {
    for (let i = 0; i < seg; i++) {
      const a0 = rotOff + (i / seg) * Math.PI * 2, a1 = rotOff + ((i + 1) / seg) * Math.PI * 2;
      const p0 = new THREE.Vector3(x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0);
      const p1 = new THREE.Vector3(x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0);
      const q0 = new THREE.Vector3(x + Math.cos(a0) * r1, y0 + hgt, z + Math.sin(a0) * r1);
      const q1 = new THREE.Vector3(x + Math.cos(a1) * r1, y0 + hgt, z + Math.sin(a1) * r1);
      if (r1 > 1e-4) this.quad(p1, p0, q0, q1, color); else this.tri(p1, p0, q0, color);
      if (cap && r1 > 1e-4) this.tri(new THREE.Vector3(x, y0 + hgt, z), q1, q0, color);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export const C = (hex: string) => new THREE.Color(hex);
/** Slight random brightness variation of a colour (deterministic from seed). */
export function vary(c: THREE.Color, seed: number, amt = 0.08): THREE.Color {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  const k = 1 + ((s - Math.floor(s)) * 2 - 1) * amt;
  return c.clone().multiplyScalar(k);
}

export const vertexColorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });

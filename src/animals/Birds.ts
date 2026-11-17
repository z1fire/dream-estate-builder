import * as THREE from 'three';
import type { App, System } from '../app/App';

/** A few flocks of simple low-poly birds circling over the estate (toggle in Time & Weather). */
export class BirdSystem implements System {
  group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private n = 36;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(private app: App) {
    this.group.name = 'birds';
    // a bird = body + two wing triangles; wing flap is done by scaling the instance's Y of the wing mesh
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([
      0, 0, 0.35, -0.9, 0.05, -0.1, 0, 0, -0.25, // left wing
      0, 0, 0.35, 0, 0, -0.25, 0.9, 0.05, -0.1, // right wing
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#2b2622', side: THREE.DoubleSide, roughness: 1 }), this.n);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noPick = true;
    this.group.add(this.mesh);
    this.group.userData.noPick = true;
  }

  update(_dt: number, t: number) {
    const on = this.app.store.doc.settings.birds && this.app.env.night < 0.6 && this.app.env.weather !== 'rain';
    this.group.visible = on;
    if (!on) return;
    const b = this.app.store.doc.boundary;
    let cx = 0, cz = 0;
    for (const p of b) { cx += p[0]; cz += p[1]; }
    if (b.length) { cx /= b.length; cz /= b.length; }
    for (let i = 0; i < this.n; i++) {
      const flock = i % 3, k = Math.floor(i / 3);
      const R = 70 + flock * 45, speed = 0.06 + flock * 0.015;
      const a = t * speed + flock * 2.1 + k * 0.035;
      const x = cx + Math.cos(a) * R + Math.sin(k * 1.7) * 3, z = cz + Math.sin(a * 1.3) * R * 0.7 + Math.cos(k * 2.3) * 3;
      const y = 45 + flock * 12 + Math.sin(t * 0.5 + k) * 2;
      const dx = -Math.sin(a) * R, dz = Math.cos(a * 1.3) * R * 0.7 * 1.3;
      const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 9 + i * 1.3));
      this.e.set(0, Math.atan2(dx, dz), Math.sin(a) * 0.2);
      this.q.setFromEuler(this.e);
      this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(1.4, 1.4 * flap * 3, 1.4));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

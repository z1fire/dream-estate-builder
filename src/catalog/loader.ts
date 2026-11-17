import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();
export const BASE = import.meta.env.BASE_URL;

export function modelUrl(path: string) {
  return path.startsWith('http') || path.startsWith('/') ? path : BASE + path;
}

export function loadGLTF(path: string): Promise<GLTF> {
  const url = modelUrl(path);
  if (!cache.has(url)) {
    const p = loader.loadAsync(url).then((g) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            const sm = mat as THREE.MeshStandardMaterial;
            if (sm.map) sm.map.anisotropy = 4;
            // emissive flames/glass flagged for night glow
            if (sm.emissive && sm.emissive.getHex() !== 0) sm.userData.glow = true;
          }
        }
      });
      return g;
    });
    cache.set(url, p);
  }
  return cache.get(url)!;
}

/** Fresh instance of a model (skinned/animated models are deep-cloned with SkeletonUtils). */
export async function instantiate(path: string): Promise<{ object: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const g = await loadGLTF(path);
  const animated = g.animations.length > 0;
  const object = animated ? SkeletonUtils.clone(g.scene) : g.scene.clone(true);
  return { object, animations: g.animations };
}

/** Merge a model's meshes into geometry+material pairs (for InstancedMesh use). */
export async function meshParts(path: string): Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material }[]> {
  const g = await loadGLTF(path);
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    const geo = m.geometry.clone();
    // dequantize (meshopt/quantize produce normalized int attributes) then bake the world transform
    for (const name of Object.keys(geo.attributes)) {
      const a = geo.getAttribute(name) as THREE.BufferAttribute;
      if (a.normalized || !(a.array instanceof Float32Array)) {
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
        geo.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
      }
    }
    geo.applyMatrix4(m.matrixWorld);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.length === 1) parts.push({ geometry: geo, material: mats[0] });
    else for (const grp of geo.groups) {
      const sub = geo.clone();
      sub.clearGroups();
      sub.setDrawRange(grp.start, grp.count);
      parts.push({ geometry: sub, material: mats[grp.materialIndex ?? 0] });
    }
  });
  return parts;
}

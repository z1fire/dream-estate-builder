// Headless thumbnail renderer (driven by scripts/gen-thumbnails.mjs through Playwright).
import * as THREE from 'three';
import { loadGLTF } from '../src/catalog/loader';

const SIZE = 192;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#ffffff', '#806a50', 1.6));
const sun = new THREE.DirectionalLight('#fff3dd', 2.4);
sun.position.set(3, 5, 4);
scene.add(sun);
const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);

(window as any).renderThumb = async (model: string): Promise<string> => {
  const g = await loadGLTF(model);
  const obj = g.scene.clone(true);
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.5 + 1e-3;
  const dist = r / Math.sin((cam.fov * Math.PI) / 360) * 1.05;
  const dir = new THREE.Vector3(0.9, 0.62, 1.15).normalize();
  cam.position.copy(c).addScaledVector(dir, dist);
  cam.near = dist / 100; cam.far = dist * 10;
  cam.lookAt(c);
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/webp', 0.85);
  scene.remove(obj);
  return url;
};
(window as any).thumbsReady = true;

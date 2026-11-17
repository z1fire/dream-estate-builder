import * as THREE from 'three';

export interface WaterUniforms {
  uTime: { value: number };
  uSky: { value: THREE.Color };
  uDeep: { value: THREE.Color };
  uShallow: { value: THREE.Color };
  uIce: { value: number };
}

export const waterUniforms: WaterUniforms = {
  uTime: { value: 0 },
  uSky: { value: new THREE.Color('#bcd2e0') },
  uDeep: { value: new THREE.Color('#1f4d63') },
  uShallow: { value: new THREE.Color('#4f8c8a') },
  uIce: { value: 0 },
};

/**
 * Stylised animated water. Geometry attributes:
 *  - color.r = depth factor (0 shallow .. 1 deep), color.g = foam (0..1)
 *  - flow (vec2): scroll direction*speed (streams), 0 for still water
 */
export function createWaterMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.86, depthWrite: true });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 flow;\nattribute vec3 wdata;\nvarying vec3 vW;\nvarying vec2 vFlow;\nvarying vec3 vData;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vW = (modelMatrix * vec4(position, 1.0)).xyz;
vFlow = flow;
vData = wdata;
transformed.y += (sin(vW.x * 0.35 + uTime * 1.3) + cos(vW.z * 0.29 + uTime * 1.1)) * 0.03 * (1.0 - wdata.g);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW;
varying vec2 vFlow;
varying vec3 vData;
uniform float uTime;
uniform vec3 uSky, uDeep, uShallow;
uniform float uIce;
float wh(vec2 p){ return sin(p.x) * cos(p.y * 0.8 + p.x * 0.3); }
float waves(vec2 p, float t){
  return wh(p * 0.9 + vec2(t * 0.7, t * 0.4)) * 0.5 + wh(p * 2.1 - vec2(t * 0.9, -t * 0.6)) * 0.25 + wh(p * 4.7 + vec2(-t * 1.6, t * 1.2)) * 0.12;
}`)
      .replace('#include <color_fragment>', `
vec3 wcol = mix(uShallow, uDeep, clamp(vData.r, 0.0, 1.0));
diffuseColor.rgb = wcol;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
{
  vec2 p = vW.xz * 0.6 - vFlow * uTime * 1.6;
  float t = uTime * (1.0 - uIce);
  float e = 0.08;
  float h0 = waves(p, t);
  float dx = (waves(p + vec2(e, 0.0), t) - h0) / e;
  float dz = (waves(p + vec2(0.0, e), t) - h0) / e;
  float strength = mix(0.12, 0.35, clamp(length(vFlow), 0.0, 1.0)) * (1.0 - uIce * 0.9);
  vec3 nW = normalize(vec3(-dx * strength, 1.0, -dz * strength));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
  totalEmissiveRadiance += uSky * fres * 0.35;
  float foamN = 0.5 + 0.5 * sin(vW.x * 3.1 + uTime * 2.0) * cos(vW.z * 2.7 - uTime * 1.7);
  float foam = clamp(vData.g * (0.6 + 0.6 * foamN), 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.0), foam);
  diffuseColor.a = mix(diffuseColor.a, 1.0, max(foam, uIce));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.9, 0.95), uIce * 0.85);
}`);
  };
  m.customProgramCacheKey = () => 'water-v1';
  return m;
}

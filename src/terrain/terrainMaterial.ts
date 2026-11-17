import * as THREE from 'three';
import { GRID, HALF, WORLD_SIZE } from '../core/types';
import { groundTextureArray } from './groundTextures';

export interface TerrainUniforms {
  uGround: { value: THREE.DataArrayTexture };
  uSplat0: { value: THREE.DataTexture };
  uSplat1: { value: THREE.DataTexture };
  uSplat2: { value: THREE.DataTexture };
  uSdf: { value: THREE.DataTexture };
  uBrush: { value: THREE.Vector4 }; // x, z, radius, visible
  uBrushColor: { value: THREE.Color };
  uGrid: { value: THREE.Vector3 }; // spacing, major every N, enabled
  uOutside: { value: THREE.Color };
  uSnow: { value: number };
  uSeason: { value: THREE.Vector3 }; // grass tint multiplier
  uWet: { value: number };
}

export function makeSplatTexture(data: Uint8Array): THREE.DataTexture {
  const t = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function createTerrainMaterial(splat: Uint8Array, sdf: THREE.DataTexture): { material: THREE.MeshStandardMaterial; uniforms: TerrainUniforms } {
  const PLANE = GRID * GRID * 4;
  const uniforms: TerrainUniforms = {
    uGround: { value: groundTextureArray() },
    uSplat0: { value: makeSplatTexture(splat.subarray(0, PLANE)) },
    uSplat1: { value: makeSplatTexture(splat.subarray(PLANE, 2 * PLANE)) },
    uSplat2: { value: makeSplatTexture(splat.subarray(2 * PLANE, 3 * PLANE)) },
    uSdf: { value: sdf },
    uBrush: { value: new THREE.Vector4(0, 0, 10, 0) },
    uBrushColor: { value: new THREE.Color('#ffe9a8') },
    uGrid: { value: new THREE.Vector3(1.524, 10, 0) },
    uOutside: { value: new THREE.Color('#b9c4b0') },
    uSnow: { value: 0 },
    uSeason: { value: new THREE.Vector3(1, 1, 1) },
    uWet: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position,1.0)).xyz;\nvWNorm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
varying vec3 vWPos;
varying vec3 vWNorm;
uniform sampler2DArray uGround;
uniform sampler2D uSplat0, uSplat1, uSplat2, uSdf;
uniform vec4 uBrush;
uniform vec3 uBrushColor;
uniform vec3 uGrid;
uniform vec3 uOutside;
uniform float uSnow;
uniform vec3 uSeason;
uniform float uWet;
float tHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float tNoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(tHash(i),tHash(i+vec2(1,0)),f.x), mix(tHash(i+vec2(0,1)),tHash(i+vec2(1,1)),f.x), f.y); }
vec3 layerCol(float l, vec2 uv){ return texture(uGround, vec3(uv, l)).rgb; }
`)
      .replace('#include <map_fragment>', `
{
  vec2 suv = (vWPos.xz + ${HALF.toFixed(1)}) / ${WORLD_SIZE.toFixed(1)};
  vec4 s0 = texture2D(uSplat0, suv);
  vec4 s1 = texture2D(uSplat1, suv);
  vec4 s2 = texture2D(uSplat2, suv);
  vec2 tuv = vWPos.xz / 3.0;
  float slope = 1.0 - clamp(vWNorm.y, 0.0, 1.0);
  float rockAuto = smoothstep(0.28, 0.45, slope);
  s2.g = max(s2.g, rockAuto);
  float tot = dot(s0, vec4(1.0)) + dot(s1, vec4(1.0)) + s2.r + s2.g + 1e-4;
  vec3 col = vec3(0.0);
  if (s0.r > 0.01) col += layerCol(0.0, tuv) * s0.r * uSeason;
  if (s0.g > 0.01) col += layerCol(1.0, tuv) * s0.g * uSeason;
  if (s0.b > 0.01) col += layerCol(2.0, tuv) * s0.b;
  if (s0.a > 0.01) col += layerCol(3.0, tuv) * s0.a;
  if (s1.r > 0.01) col += layerCol(4.0, tuv) * s1.r;
  if (s1.g > 0.01) col += layerCol(5.0, tuv * 0.75) * s1.g;
  if (s1.b > 0.01) col += layerCol(6.0, tuv) * s1.b;
  if (s1.a > 0.01) col += layerCol(7.0, tuv) * s1.a;
  if (s2.r > 0.01) col += layerCol(8.0, tuv) * s2.r;
  if (s2.g > 0.01) col += layerCol(9.0, tuv * 0.5) * s2.g;
  col /= tot;
  if (tot < 0.02) col = layerCol(0.0, tuv) * uSeason;
  float macro = tNoise(vWPos.xz / 45.0) * 0.5 + tNoise(vWPos.xz / 13.0) * 0.5;
  col *= 0.86 + macro * 0.24;
  col *= 1.0 - uWet * 0.25;
  // snow on upward faces
  float snow = uSnow * smoothstep(0.55, 0.85, vWNorm.y) * (0.8 + 0.2 * macro);
  col = mix(col, vec3(0.93, 0.95, 0.98), clamp(snow, 0.0, 1.0));
  // outside boundary: fade to haze
  float sd = texture2D(uSdf, suv).r * 200.0 - 20.0; // metres, negative inside
  float out_ = smoothstep(0.0, 70.0, sd);
  vec3 grey = vec3(dot(col, vec3(0.3, 0.59, 0.11)));
  col = mix(col, mix(grey, uOutside, 0.4), out_ * 0.6);
  // plan grid
  if (uGrid.z > 0.5) {
    vec2 g = vWPos.xz / uGrid.x;
    vec2 fw = fwidth(g);
    vec2 gl = abs(fract(g - 0.5) - 0.5) / fw;
    float minor = 1.0 - min(min(gl.x, gl.y), 1.0);
    vec2 gM = g / uGrid.y;
    vec2 fwM = fwidth(gM);
    vec2 glM = abs(fract(gM - 0.5) - 0.5) / fwM;
    float major = 1.0 - min(min(glM.x, glM.y), 1.0);
    float fade = 1.0 - smoothstep(0.15, 0.6, max(fw.x, fw.y));
    col = mix(col, vec3(1.0, 0.97, 0.88), minor * 0.25 * fade + major * 0.55);
  }
  // brush cursor
  if (uBrush.w > 0.5) {
    float d = length(vWPos.xz - uBrush.xy);
    float ring = 1.0 - smoothstep(0.0, max(0.12, uBrush.z * 0.025), abs(d - uBrush.z));
    float fill = (1.0 - smoothstep(0.0, uBrush.z, d)) * 0.12;
    col = mix(col, uBrushColor, clamp(ring * 0.9 + fill, 0.0, 1.0));
  }
  diffuseColor.rgb *= col;
}
`);
  };
  material.customProgramCacheKey = () => 'terrain-v1';
  return { material, uniforms };
}

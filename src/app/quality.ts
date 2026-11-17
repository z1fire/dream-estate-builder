export type QualityLevel = 'high' | 'medium' | 'low';

export const Quality: Record<QualityLevel, { pixelRatio: number; shadows: boolean; shadowMap: number; antialias: boolean; vegDistance: number; maxLights: number }> = {
  high: { pixelRatio: 2, shadows: true, shadowMap: 4096, antialias: true, vegDistance: 700, maxLights: 12 },
  medium: { pixelRatio: 1.25, shadows: true, shadowMap: 2048, antialias: true, vegDistance: 450, maxLights: 8 },
  low: { pixelRatio: 1, shadows: false, shadowMap: 1024, antialias: false, vegDistance: 280, maxLights: 4 },
};

/** Pick a sensible default from the GPU string (integrated GPUs get medium/low). */
export function detectQuality(): QualityLevel {
  try {
    const saved = localStorage.getItem('deb.quality') as QualityLevel | null;
    if (saved && saved in Quality) return saved;
  } catch { /* storage blocked */ }
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software/i.test(r)) return 'low';
    if (/intel|mali|adreno|powervr|apple gpu/i.test(r) && !/arc/i.test(r)) return 'medium';
    if (/Mobi|Android|iPad|iPhone/.test(navigator.userAgent)) return 'low';
    return 'high';
  } catch {
    return 'medium';
  }
}

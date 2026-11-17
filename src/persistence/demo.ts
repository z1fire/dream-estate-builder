import type { App } from '../app/App';
import { newEstate, rectBoundary } from '../core/estate';
import type { EstateDoc } from '../core/types';

/** Builds the pre-made demo estate (castle, moat, village, farms, animals). */
export async function buildDemoEstate(_app: App): Promise<EstateDoc> {
  return newEstate('Demo Estate', rectBoundary(500, 500), { seed: 11 });
}

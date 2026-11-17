import type * as THREE from 'three';
import type { App } from '../app/App';

export interface PickInfo {
  kind: string; // collection key or special
  id: string;
  object: THREE.Object3D;
  point: THREE.Vector3;
  instanceId?: number;
}

export interface ToolEvent {
  e: PointerEvent;
  ground: THREE.Vector3 | null;
  ray: THREE.Ray;
  pick?: PickInfo | null;
}

/** Base class for every interaction mode (terrain brush, moat drawing, select…). */
export abstract class Tool {
  abstract readonly id: string;
  abstract readonly name: string;
  /** reserve left mouse from camera controls while active */
  usesLeft = true;
  /** whether the pointer pipeline should pick objects (more expensive) */
  wantsPick = false;
  constructor(protected app: App) {}
  activate(): void {}
  deactivate(): void {}
  down(_ev: ToolEvent): void {}
  move(_ev: ToolEvent): void {}
  up(_ev: ToolEvent): void {}
  /** return true if handled */
  key(_e: KeyboardEvent): boolean { return false; }
  dblclick(_ev: ToolEvent): void {}
  update(_dt: number): void {}
  /** Options panel content */
  panel(): HTMLElement | null { return null; }
  /** Status bar hint */
  hint = '';
}

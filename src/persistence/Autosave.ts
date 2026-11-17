import type { App } from '../app/App';
import { saveEstate } from './storage';

/** Debounced autosave to IndexedDB. */
export class Autosave {
  private lastChange = 0;
  private saving = false;
  lastSaved = 0;
  onState: (s: 'saved' | 'dirty' | 'saving' | 'error') => void = () => {};
  enabled = true;

  constructor(private app: App) {
    app.store.subscribe((c) => {
      if (c.type === 'doc') { this.lastSaved = Date.now(); this.onState('saved'); return; }
      this.lastChange = Date.now();
      this.onState('dirty');
    });
    window.setInterval(() => this.tick(), 2000);
    window.addEventListener('beforeunload', (e) => {
      if (this.app.store.dirtySinceSave) { void this.saveNow(); e.preventDefault(); }
    });
  }

  private tick() {
    if (!this.enabled || this.saving || !this.app.store.dirtySinceSave || this.app.isPointerDown) return;
    if (Date.now() - this.lastChange < 4000) return;
    void this.saveNow();
  }

  /** Capture a small thumbnail of the current view. */
  thumbnail(): string | undefined {
    try {
      const app = this.app;
      app.renderer.render(app.scene, app.rig.camera);
      const src = app.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 240; c.height = 135;
      const g = c.getContext('2d')!;
      const ar = src.width / src.height, tar = 240 / 135;
      const sw = ar > tar ? src.height * tar : src.width, sh = ar > tar ? src.height : src.width / tar;
      g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 240, 135);
      return c.toDataURL('image/jpeg', 0.75);
    } catch { return undefined; }
  }

  private current: Promise<boolean> | null = null;

  /** Save now; if a save is already running, wait for it and save again so the latest state is persisted. */
  async saveNow(): Promise<boolean> {
    if (this.current) { await this.current; }
    this.current = this.doSave();
    try { return await this.current; } finally { this.current = null; }
  }

  private async doSave(): Promise<boolean> {
    this.saving = true;
    this.onState('saving');
    try {
      this.app.store.dirtySinceSave = false;
      await saveEstate(this.app.store.doc, this.thumbnail());
      this.lastSaved = Date.now();
      this.onState(this.app.store.dirtySinceSave ? 'dirty' : 'saved');
      return true;
    } catch (e) {
      console.warn('Autosave failed', e);
      this.app.store.dirtySinceSave = true;
      this.onState('error');
      return false;
    } finally {
      this.saving = false;
    }
  }
}

import type { App } from './app/App';

export interface ModuleHooks {
  photo?: () => void;
  tour?: () => void;
  afterDemo?: () => Promise<void>;
}

/** Registers feature modules (systems + tools). Each phase adds its module here. */
export function registerModules(_app: App): ModuleHooks {
  const hooks: ModuleHooks = {};
  return hooks;
}

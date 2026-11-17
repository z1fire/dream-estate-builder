import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4173/dream-estate-builder/',
    viewport: { width: 1600, height: 900 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run preview', url: 'http://localhost:4173/dream-estate-builder/', reuseExistingServer: true, timeout: 60_000 },
});

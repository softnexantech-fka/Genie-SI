import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: {
    timeout: 10000
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10000,
    ignoreHTTPSErrors: true,
    video: 'on',             // capture vidéo de chaque test (utile pour debug)
    trace: 'on',             // trace complète pour relecture pas à pas
    screenshot: 'on'         // capture écran à chaque étape (bien visible)
  },
  projects: [
    // Edge en priorité (navigateur principal disponible)
    { name: 'msedge', use: { channel: 'msedge' } },
    // Chrome et Firefox en optionnel (si disponibles)
    { name: 'chromium', use: { channel: 'chrome' } },
    { name: 'firefox' }
  ]
});

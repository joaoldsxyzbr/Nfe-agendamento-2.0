import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: 'line',
  outputDir: 'test-results',
  use: {
    browserName: 'chromium',
    headless: true,
  },
});

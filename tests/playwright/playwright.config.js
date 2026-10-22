import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig({
    testDir: '.',
    testMatch: '**/*.spec.js',
    fullyParallel: false,
    workers: 1,
    timeout: 45_000,
    reporter: 'line',
    outputDir: 'test-results',
    webServer: {
        command: 'npm run build:ui && node scripts/serve-ui-preview.mjs --dist --host 127.0.0.1 --port 4173',
        cwd: repoRoot,
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: false,
        timeout: 30_000,
    },
    use: {
        browserName: 'chromium',
        headless: true,
        baseURL: 'http://127.0.0.1:4173',
    },
});

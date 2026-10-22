import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        setupFiles: ['../../scripts/setup-test-env.mjs'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.js'],
            reporter: ['text', 'json-summary'],
            reportsDirectory: '../../coverage/web',
            thresholds: {
                statements: 53,
                branches: 51,
                functions: 53,
                lines: 55,
                'src/portal/extension-client.js': {
                    statements: 55,
                    branches: 40,
                    functions: 50,
                    lines: 60,
                },
                'src/batch/controller.js': {
                    statements: 43,
                    branches: 47,
                    functions: 45,
                    lines: 45,
                },
                'src/nfe/xml.js': {
                    statements: 95,
                    branches: 75,
                    functions: 95,
                    lines: 95,
                },
                'src/danfe/render.js': {
                    statements: 75,
                    branches: 65,
                    functions: 80,
                    lines: 80,
                },
            },
        },
    },
});

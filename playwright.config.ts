import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    browserName: 'chromium',
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  },
  webServer: [
    {
      command: 'npx vite --config tests/vite.config.ts --host 127.0.0.1 --port 5188 --strictPort',
      url: 'http://127.0.0.1:5188',
      reuseExistingServer: false,
    },
    {
      command: 'npx vite --config tests/vite.config.ts --host 127.0.0.1 --port 5189 --strictPort',
      url: 'http://127.0.0.1:5189',
      env: { TEST_TRACKER_CLOUD: '1' },
      reuseExistingServer: false,
    },
  ],
});

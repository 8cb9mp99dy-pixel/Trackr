// Dev-only: end-to-end tests on the invented fixture (tests/fixtures/demo-data.json).
// Locally they use the installed Google Chrome; in CI, Playwright's own Chromium.
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8080',
    channel: process.env.CI ? undefined : 'chrome',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: { command: 'node tools/dev/serve.js 8080', url: 'http://127.0.0.1:8080/', reuseExistingServer: true, timeout: 20000 },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});

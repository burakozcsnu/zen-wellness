const { defineConfig, devices } = require('@playwright/test');

// PW_CHANNEL=msedge uses the installed Edge locally (no browser download); CI uses bundled Chromium.
const channel = process.env.PW_CHANNEL || undefined;

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 45000,
  // One test at a time: the wizard test shares one test account, so parallel browsers would overwrite each other's state.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3111', screenshot: 'only-on-failure', trace: 'retain-on-failure', channel },
  webServer: { command: 'npx serve . -l 3111', url: 'http://localhost:3111', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel } },
    // Safari's own engine (WebKit) on an iPhone-sized screen. Chromium cannot show Safari-only layout problems
    // (for example the notch height), so the layout specs also run here. Only these specs: the rest are not layout checks.
    { name: 'phone-safari', testMatch: /(mobile-nav|ui-rows|crawl)\.spec\.js/, use: { ...devices['iPhone 13'] } }
  ]
});

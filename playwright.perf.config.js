const base = require('./playwright.config');

// Browser performance tests: Chromium only (CDP metrics), one at a time so timings are not disturbed.
module.exports = {
  ...base,
  testDir: 'tests/perf',
  testMatch: '**/*.spec.js',
  workers: 1,
  retries: 0,
  timeout: 120000,
  projects: [{ name: 'chromium', use: { ...base.projects[0].use } }]
};

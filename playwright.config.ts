import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  outputDir: '/tmp/nori-playwright-results',
  reporter: [['list'], ['json', { outputFile: '/tmp/nori-playwright-report.json' }]],
  use: {
    baseURL: process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
      args: ['--no-sandbox'],
    },
  },
})

import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const chromiumCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((candidate): candidate is string => Boolean(candidate))

const executablePath = chromiumCandidates.find((candidate) => fs.existsSync(candidate))

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
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        viewport: { width: 1440, height: 1000 },
        launchOptions: {
          executablePath,
          args: ['--no-sandbox'],
        },
      },
      testIgnore: ['**/mobile-webkit.spec.ts'],
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 14'],
        browserName: 'webkit',
      },
      testMatch: ['**/mobile-webkit.spec.ts'],
    },
  ],
})

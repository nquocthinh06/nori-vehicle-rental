import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const mainDb = path.resolve('nori.db')
const configuredDbRaw =
  process.env.NORI_SQLITE_PATH?.trim() || process.env.DATABASE_URI?.replace(/^file:/, '').trim()
if (
  process.env.NORI_ALLOW_LIVE_DB_TEST !== '1' &&
  (!configuredDbRaw || path.resolve(configuredDbRaw) === mainDb)
) {
  throw new Error(
    '[NORI SAFETY GUARD] Refusing to run Playwright E2E tests against live ./nori.db. Run "pnpm test:e2e:isolated" or set NORI_SQLITE_PATH / DATABASE_URI to an isolated database copy.',
  )
}

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

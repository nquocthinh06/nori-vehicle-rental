#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const args = new Set(process.argv.slice(2))
const skipBuild = args.has('--skip-build')
const runPgAudit = args.has('--with-pg-audit') || Boolean(process.env.NORI_PG_PARITY_URL)

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const steps = [
  { name: 'Environment validation', cmd: pnpmCmd, cmdArgs: ['env:check'] },
  { name: 'Code formatting check', cmd: pnpmCmd, cmdArgs: ['format:check'] },
  { name: 'TypeScript check', cmd: pnpmCmd, cmdArgs: ['typecheck'] },
  { name: 'Static security & policy lint', cmd: pnpmCmd, cmdArgs: ['lint'] },
  { name: 'Media integrity audit', cmd: pnpmCmd, cmdArgs: ['media:audit'] },
  { name: 'Unit, business, payment & parity tests', cmd: pnpmCmd, cmdArgs: ['test'] },
  { name: 'Isolated admin & migration tests', cmd: pnpmCmd, cmdArgs: ['test:admin'] },
  { name: 'Database migration idempotency', cmd: pnpmCmd, cmdArgs: ['db:check'] },
]

if (runPgAudit) {
  steps.push({ name: 'PostgreSQL schema parity audit', cmd: pnpmCmd, cmdArgs: ['db:pg:audit'] })
}
if (!skipBuild) {
  steps.push({ name: 'Next.js production build', cmd: pnpmCmd, cmdArgs: ['build'] })
}

const results = []
console.log(`\n=== NORI RELEASE QUALITY GATE (${steps.length} checks) ===\n`)

for (const step of steps) {
  const start = performance.now()
  console.log(`>> Running: ${step.name}`)
  const res =
    process.platform === 'win32'
      ? spawnSync(`${step.cmd} ${step.cmdArgs.join(' ')}`, {
          stdio: 'inherit',
          shell: true,
          env: process.env,
        })
      : spawnSync(step.cmd, step.cmdArgs, {
          stdio: 'inherit',
          shell: false,
          env: process.env,
        })
  const elapsedSec = ((performance.now() - start) / 1000).toFixed(2)
  const passed = res.status === 0
  results.push({ name: step.name, passed, elapsedSec, code: res.status })
  if (!passed) {
    console.error(
      `\n[RELEASE GATE BLOCKED] "${step.name}" failed with exit code ${res.status} (${elapsedSec}s).`,
    )
    printSummary(results)
    process.exit(res.status || 1)
  }
}

printSummary(results)
console.log('\n[RELEASE GATE PASS] All quality, integrity, security, and build checks succeeded.\n')

function printSummary(rows) {
  console.log('\n--- Release Gate Summary ---')
  for (const row of rows) {
    console.log(`${row.passed ? '[PASS]' : '[FAIL]'} ${row.name} (${row.elapsedSec}s)`)
  }
}

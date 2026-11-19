import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const ROOTS = ['src', 'tests']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '(payload)'])
const SKIP_FILES = new Set(['payload-types.ts'])

const FORBIDDEN_SNIPPETS = [
  { pattern: /\beval\s*\(/, message: 'Forbidden dynamic eval() usage' },
  { pattern: /\bnew\s+Function\s*\(/, message: 'Forbidden dynamic new Function() usage' },
  { pattern: /dangerouslySetInnerHTML/, message: 'Forbidden dangerouslySetInnerHTML usage' },
  {
    pattern: /@ts-ignore\b|@ts-nocheck\b/,
    message: 'Forbidden @ts-ignore / @ts-nocheck directive',
  },
  { pattern: /\b(TODO|FIXME|HACK|XXX)\b/, message: 'Unresolved TODO/FIXME/HACK/XXX marker' },
]

const CLIENT_FORBIDDEN_ENVS = [
  'PAYLOAD_SECRET',
  'NORI_SESSION_SECRET',
  'FIGMA_OAUTH_CLIENT_SECRET',
  'FIGMA_CONTENT_API_ACCESS_KEY',
  'DATABASE_URI',
  'NORI_ADMIN_PASSWORD',
  'SEPAY_API_KEY',
  'SEPAY_SECRET_KEY',
  'SEPAY_WEBHOOK_SECRET',
]

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full, out)
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !SKIP_FILES.has(entry.name)) {
      out.push(full)
    }
  }
  return out
}

async function main() {
  const files = []
  for (const root of ROOTS) {
    await walk(path.resolve(process.cwd(), root), files)
  }

  const issues = []

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replaceAll('\\', '/')
    const source = await fs.readFile(file, 'utf8')

    // 1. Parse AST with TypeScript Compiler API and forbid debugger statements
    const isJsx = file.endsWith('.tsx')
    const sf = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      false,
      isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    if (sf.parseDiagnostics?.length) {
      for (const d of sf.parseDiagnostics) {
        const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ')
        issues.push(`${rel}: Syntax/parse diagnostic: ${msg}`)
      }
    }
    const visit = (node) => {
      if (node.kind === ts.SyntaxKind.DebuggerStatement) {
        issues.push(`${rel}: Forbidden debugger statement`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)

    // 2. Forbidden unsafe / incomplete code markers
    for (const rule of FORBIDDEN_SNIPPETS) {
      if (
        rule.message.includes('dangerouslySetInnerHTML') &&
        rel === 'src/lib/make-custom-code.tsx'
      ) {
        continue
      }
      if (rule.pattern.test(source)) {
        issues.push(`${rel}: ${rule.message}`)
      }
    }

    // 3. Client bundle must never reference server-only secrets
    const trimmed = source.trimStart()
    if (trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"')) {
      for (const secretKey of CLIENT_FORBIDDEN_ENVS) {
        if (source.includes(secretKey)) {
          issues.push(`${rel}: Client component references forbidden secret ${secretKey}`)
        }
      }
    }

    // 4. Nori mutation API handlers must call assertOrigin (except HMAC /revalidate)
    if (
      rel.startsWith('src/app/(frontend)/nori-api/') &&
      rel.endsWith('/route.ts') &&
      !rel.endsWith('/revalidate/route.ts')
    ) {
      if (/export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/.test(source)) {
        if (!source.includes('assertOrigin(')) {
          issues.push(`${rel}: Mutation route handler missing assertOrigin() guard`)
        }
      }
    }
  }

  if (issues.length) {
    console.error('Static lint failed:')
    for (const issue of issues) console.error(` - ${issue}`)
    process.exit(1)
  }

  console.log(`Static lint passed across ${files.length} files (0 issues).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

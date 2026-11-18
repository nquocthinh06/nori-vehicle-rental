import type { OxfmtConfig } from 'oxfmt'

export default {
  ignorePatterns: [
    '**/payload-types.ts',
    'tsconfig.json',
    'src/app/(payload)/**',
    'data/snapshots/**',
  ],
  printWidth: 100,
  semi: false,
  singleQuote: true,
  sortPackageJson: false,
  trailingComma: 'all',
} satisfies OxfmtConfig

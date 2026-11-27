import { createBrandAdapter } from './generic.ts'

export const mercedesBenzAdapter = createBrandAdapter({
  id: 'mercedes-benz',
  brand: 'Mercedes-Benz',
  domains: ['mercedes-benz.com.vn', 'assets.mercedes-benz.com', 'media.mercedes-benz.com'],
  defaultCategory: 'CAR',
  variantNamePattern:
    /\b(?:C\s*200\s*Avantgarde|C\s*300\s*AMG|E\s*200|E\s*300\s*AMG|GLC\s*200|GLC\s*300|S\s*450)\b/gi,
})

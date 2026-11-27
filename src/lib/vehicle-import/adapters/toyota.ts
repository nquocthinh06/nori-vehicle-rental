import { createBrandAdapter } from './generic.ts'

export const toyotaAdapter = createBrandAdapter({
  id: 'toyota',
  brand: 'Toyota',
  domains: ['toyota.com.vn', 'toyota-global.com'],
  defaultCategory: 'CAR',
  variantNamePattern:
    /\b(?:Fortuner|Vios|Hilux|Camry|Corolla Cross|Veloz|Innova)\s+[A-Z0-9.+/-]{2,24}(?:\s+[A-Z0-9.+/-]{1,12})?\b/gi,
  specPairPatterns: [
    /<li\b[^>]*class="[^"]*spec[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/gi,
  ],
})

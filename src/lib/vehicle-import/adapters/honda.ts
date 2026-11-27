import { createBrandAdapter } from './generic.ts'

export const hondaAdapter = createBrandAdapter({
  id: 'honda',
  brand: 'Honda',
  domains: ['honda.com.vn', 'global.honda'],
  defaultCategory: 'CAR',
  variantNamePattern:
    /\b(?:CR-V|Civic|City|HR-V|BR-V|SH160i|SH350i|PCX|Vision|Wave Alpha|Air Blade)\s*[A-Za-z0-9.+/-]{0,16}\b/gi,
})

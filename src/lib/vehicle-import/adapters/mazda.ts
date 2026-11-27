import { createBrandAdapter } from './generic.ts'

export const mazdaAdapter = createBrandAdapter({
  id: 'mazda',
  brand: 'Mazda',
  domains: ['mazdamotors.vn'],
  defaultCategory: 'CAR',
  defaultOrigin: 'Việt Nam (THACO)',
  variantNamePattern:
    /\b(?:Mazda\s*(?:CX-5|CX-8|CX-3|CX-30|2|3|6)\s*(?:Deluxe|Luxury|Premium|Signature)?)\b/gi,
})

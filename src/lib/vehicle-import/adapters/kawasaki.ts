import { createBrandAdapter } from './generic.ts'

export const kawasakiAdapter = createBrandAdapter({
  id: 'kawasaki',
  brand: 'Kawasaki',
  domains: ['kawasakivietnam.vn'],
  defaultCategory: 'MOTORBIKE',
  defaultOrigin: 'Thái Lan / Nhật Bản',
  defaultFuelType: 'Xăng',
  variantNamePattern: /\b(?:Z650\s*ABS|Z900|Ninja\s*(?:400|500|650|ZX-6R)|Versys\s*650)\b/gi,
})

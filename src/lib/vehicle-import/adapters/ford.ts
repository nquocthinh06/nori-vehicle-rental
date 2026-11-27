import { createBrandAdapter } from './generic.ts'

export const fordAdapter = createBrandAdapter({
  id: 'ford',
  brand: 'Ford',
  domains: ['ford.com.vn', 'media.ford.com'],
  defaultCategory: 'PICKUP',
  defaultOrigin: 'Thái Lan / Việt Nam',
  variantNamePattern:
    /\b(?:Ranger\s+(?:Raptor|Wildtrak|Stormtrak|Sport|XLS|XL)|Everest\s+(?:Titanium|Platinum|Sport)|Territory)\b/gi,
})

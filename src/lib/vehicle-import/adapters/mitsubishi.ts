import { createBrandAdapter } from './generic.ts'

export const mitsubishiAdapter = createBrandAdapter({
  id: 'mitsubishi',
  brand: 'Mitsubishi',
  domains: ['mitsubishi-motors.com.vn'],
  defaultCategory: 'CAR',
  defaultOrigin: 'Indonesia / Thái Lan',
  variantNamePattern:
    /\b(?:Xpander\s+(?:Cross|AT\s+Premium|AT|MT)|Triton\s+(?:Athlete|GLX|4WD)|Xforce|Outlander|Pajero Sport)\b/gi,
  specPairPatterns: [
    /<div\b[^>]*class="[^"]*spec[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi,
  ],
})

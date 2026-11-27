import { createBrandAdapter } from './generic.ts'

export const hyundaiAdapter = createBrandAdapter({
  id: 'hyundai',
  brand: 'Hyundai',
  domains: ['hyundai.thanhcong.vn'],
  defaultCategory: 'CAR',
  defaultOrigin: 'Việt Nam (TC Motor)',
  variantNamePattern:
    /\b(?:Accent|Creta|Tucson|Santa Fe|Custin|Stargazer|Elantra|IONIQ 5)\s*(?:Đặc biệt|Cao cấp|Tiêu chuẩn|N Line|1\.5)?\b/gi,
})

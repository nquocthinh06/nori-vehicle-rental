import { createBrandAdapter } from './generic.ts'

export const yamahaAdapter = createBrandAdapter({
  id: 'yamaha',
  brand: 'Yamaha',
  domains: ['yamaha-motor.com.vn'],
  defaultCategory: 'MOTORBIKE',
  defaultFuelType: 'Xăng',
  variantNamePattern:
    /\b(?:Exciter\s*155\s*VVA|NVX\s*155|Grande|Janus|Sirius|PG-1|R15|MT-15)\s*(?:ABS|Cao cấp|Giới hạn|Tiêu chuẩn)?\b/gi,
})

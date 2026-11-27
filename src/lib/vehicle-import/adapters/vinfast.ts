import { createBrandAdapter } from './generic.ts'

export const vinfastAdapter = createBrandAdapter({
  id: 'vinfast',
  brand: 'VinFast',
  domains: [
    'vinfastauto.com',
    'static.vinfastauto.com',
    'cdn.vinfastauto.com',
    'storage.vinfastauto.com',
  ],
  defaultCategory: 'CAR',
  defaultOrigin: 'Việt Nam',
  defaultFuelType: 'Điện (EV)',
  variantNamePattern:
    /\b(?:VF\s*(?:3|5|6|7|8|9)\s*(?:Eco|Plus|S)?|Evo\s*(?:200|200\s*Lite|Max)|Klara\s*S|Vento\s*S|Theon\s*S|Feliz\s*S)\b/gi,
})

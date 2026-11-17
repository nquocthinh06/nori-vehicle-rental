import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const candidates = JSON.parse(await fs.readFile('.tmp/wikimedia-candidates.json', 'utf8'))

const picks = [
  // Hero & Story
  {
    key: 'nori-hero-1',
    group: 'nori-hero',
    match: 'Lăng Cô, Hải Vân Pass, 2020-01 CN-02.jpg',
    alt: 'Cung đường đèo Hải Vân nhìn ra vịnh Lăng Cô cùng NORI',
    kind: 'HERO',
    year: '2020',
  },
  {
    key: 'nori-hero-2',
    group: 'nori-hero',
    match: 'Lăng Cô, Hải Vân Pass, 2020-01 CN-04.jpg',
    alt: 'Cung đường ven biển miền Trung lúc bình minh cùng NORI',
    kind: 'HERO',
    year: '2020',
  },
  {
    key: 'nori-hero-3',
    group: 'nori-hero',
    match: 'Vietnam road 2.jpg',
    alt: 'Hành trình khám phá cung đường núi Việt Nam cùng NORI',
    kind: 'HERO',
    year: '2020',
  },
  {
    key: 'nori-story',
    group: 'nori-hero',
    match: 'Da Lat - Viet Nam.jpg',
    alt: 'Không gian cao nguyên Đà Lạt trong câu chuyện hành trình NORI',
    kind: 'STORY',
    year: '2020',
  },

  // 1. Toyota Fortuner
  {
    key: 'toyota-fortuner-ext-1',
    group: 'toyota-fortuner',
    match: 'TOYOTA FORTUNER (AN150,AN160) China.jpg',
    alt: 'Toyota Fortuner — Ngoại thất góc nhìn tổng thể',
    kind: 'EXTERIOR',
    year: '2022–2024',
  },
  {
    key: 'toyota-fortuner-ext-2',
    group: 'toyota-fortuner',
    match: 'TOYOTA FORTUNER (AN150,AN160) China (4).jpg',
    alt: 'Toyota Fortuner — Ngoại thất góc nhìn phía sau',
    kind: 'EXTERIOR',
    year: '2022–2024',
  },
  {
    key: 'toyota-fortuner-ext-3',
    group: 'toyota-fortuner',
    match: 'Toyota Fortuner, Cape Town (P1060077).jpg',
    alt: 'Toyota Fortuner — Ngoại thất góc chéo 45 độ',
    kind: 'EXTERIOR',
    year: '2022–2024',
  },
  {
    key: 'toyota-fortuner-int-1',
    group: 'toyota-fortuner',
    match: 'Toyota Fortuner LTD 4x2 interior 20221019.jpg',
    alt: 'Toyota Fortuner — Khoang lái và bảng điều khiển trung tâm',
    kind: 'INTERIOR',
    year: '2022–2024',
  },
  {
    key: 'toyota-fortuner-eng-1',
    group: 'toyota-fortuner',
    match: '2019 Toyota FORTUNER 2.4 2GD-FTV (190428).jpg',
    alt: 'Toyota Fortuner — Khoang động cơ Diesel 2GD-FTV 2.4L',
    kind: 'ENGINE',
    year: '2022–2024',
  },

  // 2. Honda PCX
  {
    key: 'honda-pcx-ext-1',
    group: 'honda-pcx',
    match: 'HONDA PCX 160 China.jpg',
    alt: 'Honda PCX 160 — Tổng thể ngoại thất bên hông',
    kind: 'EXTERIOR',
    year: '2023–2024',
  },
  {
    key: 'honda-pcx-ext-2',
    group: 'honda-pcx',
    match: 'HONDA PCX 160 China (3).jpg',
    alt: 'Honda PCX 160 — Góc nhìn đuôi và thân xe',
    kind: 'EXTERIOR',
    year: '2023–2024',
  },
  {
    key: 'honda-pcx-ext-3',
    group: 'honda-pcx',
    match: '2022 Honda PCX 160 Gray Black.jpg',
    alt: 'Honda PCX 160 — Phiên bản Xám Đen góc trước',
    kind: 'EXTERIOR',
    year: '2022–2024',
  },

  // 3. Ford Ranger Raptor
  {
    key: 'ford-ranger-raptor-ext-1',
    group: 'ford-ranger-raptor',
    match: 'Ford Ranger Raptor (P703) 1X7A6774.jpg',
    alt: 'Ford Ranger Raptor thế hệ mới — Ngoại thất góc chéo trước',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'ford-ranger-raptor-ext-2',
    group: 'ford-ranger-raptor',
    match: 'Ford Ranger Raptor (P703) 1X7A6776.jpg',
    alt: 'Ford Ranger Raptor thế hệ mới — Ngoại thất góc chéo sau',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'ford-ranger-raptor-ext-3',
    group: 'ford-ranger-raptor',
    match: 'Ford Ranger Raptor (P703) DSC 7063.jpg',
    alt: 'Ford Ranger Raptor — Thân xe và bộ lốp địa hình',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'ford-ranger-raptor-int-1',
    group: 'ford-ranger-raptor',
    match: 'Ford Ranger P703 3.0 Raptor EcoBoost V6 interior.jpg',
    alt: 'Ford Ranger Raptor — Khoang lái thể thao và màn hình dọc',
    kind: 'INTERIOR',
    year: '2023–2025',
  },

  // 4. Honda Wave Alpha 110
  {
    key: 'honda-wave-alpha-ext-1',
    group: 'honda-wave-alpha',
    match: 'Honda wave 110 in kuala lumpur.jpg',
    alt: 'Honda Wave 110 — Tổng thể xe số phổ thông',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'honda-wave-alpha-ext-2',
    group: 'honda-wave-alpha',
    match: '2026 Honda Wave 110 Special Edition (Alloy Type).jpg',
    alt: 'Honda Wave 110 — Phiên bản mâm đúc góc ngang',
    kind: 'EXTERIOR',
    year: '2025',
  },

  // 5. Honda Vision 110
  {
    key: 'honda-vision-ext-1',
    group: 'honda-vision',
    match: 'Honda Vision 110-002.JPG',
    alt: 'Honda Vision 110 — Ngoại thất góc chéo trước',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'honda-vision-ext-2',
    group: 'honda-vision',
    match: 'Honda Vision scooter.jpg',
    alt: 'Honda Vision 110 — Tổng thể xe tay ga đô thị',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },

  // 6. Honda SH160i / SH150i
  {
    key: 'honda-sh160i-ext-1',
    group: 'honda-sh160i',
    match: 'Honda SH 150.jpg',
    alt: 'Honda SH 150i/160i — Ngoại thất tổng thể',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'honda-sh160i-ext-2',
    group: 'honda-sh160i',
    match: 'Honda SH150.jpg',
    alt: 'Honda SH 150i/160i — Thân xe và yên đôi',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },

  // 7. Honda SH350i
  {
    key: 'honda-sh350i-ext-1',
    group: 'honda-sh350i',
    match: 'Honda SH 350i 2025.jpg',
    alt: 'Honda SH 350i — Ngoại thất trực diện phần đầu xe',
    kind: 'EXTERIOR',
    year: '2024–2025',
  },
  {
    key: 'honda-sh350i-ext-2',
    group: 'honda-sh350i',
    match: 'Honda SH 350i 2025 EICMA 2024.jpg',
    alt: 'Honda SH 350i — Ngoại thất góc chéo thân xe',
    kind: 'EXTERIOR',
    year: '2024–2025',
  },
  {
    key: 'honda-sh350i-ext-3',
    group: 'honda-sh350i',
    match: 'Honda SH 350i.jpg',
    alt: 'Honda SH 350i — Tổng thể xe tay ga phân khối lớn',
    kind: 'EXTERIOR',
    year: '2023–2024',
  },

  // 8. Yamaha Exciter 155 VVA
  {
    key: 'yamaha-exciter-ext-1',
    group: 'yamaha-exciter-155-vva',
    match: 'Yamaha Y15ZR V2.jpg',
    alt: 'Yamaha Exciter / Y15ZR — Ngoại thất góc chéo thể thao',
    kind: 'EXTERIOR',
    year: '2022–2025',
  },
  {
    key: 'yamaha-exciter-ext-2',
    group: 'yamaha-exciter-155-vva',
    match: 'Yamaha Jupiter MX King 150 - Jakarta Fair 2016 - June 21 2016.jpg',
    alt: 'Yamaha Exciter / MX King — Ngoại thất thân xe',
    kind: 'EXTERIOR',
    year: '2022–2025',
  },
  {
    key: 'yamaha-exciter-feat-1',
    group: 'yamaha-exciter-155-vva',
    match: 'Yamaha Jupiter MX Speedometer.jpg',
    alt: 'Yamaha Exciter — Cụm đồng hồ hiển thị',
    kind: 'FEATURE',
    year: '2022–2025',
  },

  // 9. VinFast Evo200
  {
    key: 'vinfast-evo200-ext-1',
    group: 'vinfast-evo200',
    match: 'Newone - Yellow VinFast Evo & Vento 01.jpg',
    alt: 'VinFast Evo — Xe máy điện đô thị màu vàng',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'vinfast-evo200-ext-2',
    group: 'vinfast-evo200',
    match: 'Newone - olive green VinFast Evo Grand 01.jpg',
    alt: 'VinFast Evo — Phiên bản màu xanh rêu góc chéo',
    kind: 'EXTERIOR',
    year: '2024–2025',
  },

  // 10. Kawasaki Z650
  {
    key: 'kawasaki-z650-ext-1',
    group: 'kawasaki-z650',
    match: 'Kawasaki Z650 schwarz 2020.jpg',
    alt: 'Kawasaki Z650 ABS — Ngoại thất màu đen góc ngang',
    kind: 'EXTERIOR',
    year: '2020–2024',
  },
  {
    key: 'kawasaki-z650-ext-2',
    group: 'kawasaki-z650',
    match: 'Kawasaki Z650.jpg',
    alt: 'Kawasaki Z650 ABS — Góc chéo trước khung sườn Sugomi',
    kind: 'EXTERIOR',
    year: '2020–2024',
  },

  // 11. Toyota Vios
  {
    key: 'toyota-vios-ext-1',
    group: 'toyota-vios',
    match: 'TOYOTA VIOS XP150 China.jpg',
    alt: 'Toyota Vios — Ngoại thất sedan góc chéo trước',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'toyota-vios-ext-2',
    group: 'toyota-vios',
    match: 'Toyota Vios (XP150) sedan front view.jpg',
    alt: 'Toyota Vios — Trực diện phần đầu xe',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'toyota-vios-int-1',
    group: 'toyota-vios',
    match: '2021 Toyota Vios 1.5J MT Super White interior view in Brunei.jpg',
    alt: 'Toyota Vios — Khoang lái và vô lăng',
    kind: 'INTERIOR',
    year: '2021–2024',
  },

  // 12. Mazda CX-5
  {
    key: 'mazda-cx5-ext-1',
    group: 'mazda-cx-5',
    match: 'Mazda CX-5 (KF) Facelift 1X7A0331 (2).jpg',
    alt: 'Mazda CX-5 — Ngoại thất góc chéo trước',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'mazda-cx5-ext-2',
    group: 'mazda-cx-5',
    match: 'Mazda CX-5 Newground 1X7A6786 (cropped).jpg',
    alt: 'Mazda CX-5 — Thân xe thiết kế KODO',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'mazda-cx5-int-1',
    group: 'mazda-cx-5',
    match: 'Mazda CX-5 25S L Package 2WD (6BA-KF5P) interior.jpg',
    alt: 'Mazda CX-5 — Khoang lái và màn hình giải trí',
    kind: 'INTERIOR',
    year: '2023–2025',
  },
  {
    key: 'mazda-cx5-eng-1',
    group: 'mazda-cx-5',
    match: 'Mazda Skyactiv-G 2.0 PE-VPS.jpg',
    alt: 'Mazda CX-5 — Động cơ xăng Skyactiv-G 2.0L',
    kind: 'ENGINE',
    year: '2023–2025',
  },

  // 13. Mitsubishi Xpander
  {
    key: 'mitsubishi-xpander-ext-1',
    group: 'mitsubishi-xpander',
    match: '2022 Mitsubishi Xpander GLS (20221009) 01.jpg',
    alt: 'Mitsubishi Xpander — Ngoại thất góc chéo trước Dynamic Shield',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'mitsubishi-xpander-ext-2',
    group: 'mitsubishi-xpander',
    match: '2022 Mitsubishi Xpander GLS (20221009) 02.jpg',
    alt: 'Mitsubishi Xpander — Ngoại thất góc chéo sau',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'mitsubishi-xpander-int-1',
    group: 'mitsubishi-xpander',
    match: '2020 Mitsubishi Xpander Cross interior (Vietnam).png',
    alt: 'Mitsubishi Xpander — Khoang nội thất tại thị trường Việt Nam',
    kind: 'INTERIOR',
    year: '2022–2025',
  },

  // 14. Honda CR-V
  {
    key: 'honda-crv-ext-1',
    group: 'honda-cr-v',
    match: 'Honda CR-V (6th generation) hybrid 1X7A0866.jpg',
    alt: 'Honda CR-V thế hệ thứ 6 — Ngoại thất góc chéo trước',
    kind: 'EXTERIOR',
    year: '2024–2025',
  },
  {
    key: 'honda-crv-ext-2',
    group: 'honda-cr-v',
    match: 'Honda CR-V (6th generation) hybrid DSC 8550.jpg',
    alt: 'Honda CR-V thế hệ thứ 6 — Ngoại thất góc chéo sau',
    kind: 'EXTERIOR',
    year: '2024–2025',
  },
  {
    key: 'honda-crv-int-1',
    group: 'honda-cr-v',
    match: 'HONDA CR-V PLUG-IN HYBRID SIXTH GENERATION CHINA VERSION INTERIOR (4).jpg',
    alt: 'Honda CR-V thế hệ thứ 6 — Khoang lái lưới tổ ong đặc trưng',
    kind: 'INTERIOR',
    year: '2024–2025',
  },

  // 15. Hyundai Accent
  {
    key: 'hyundai-accent-ext-1',
    group: 'hyundai-accent',
    match: '2020 Hyundai Accent Essential in Urban Grey, Front Right, 05-23-2023.jpg',
    alt: 'Hyundai Accent — Ngoại thất góc chéo trước màu xám',
    kind: 'EXTERIOR',
    year: '2022–2024',
  },
  {
    key: 'hyundai-accent-ext-2',
    group: 'hyundai-accent',
    match: '2020 Hyundai Accent Preferred in Urban Grey, front left, 2026-08-09.jpg',
    alt: 'Hyundai Accent — Ngoại thất góc chéo trái',
    kind: 'EXTERIOR',
    year: '2022–2024',
  },
  {
    key: 'hyundai-accent-int-1',
    group: 'hyundai-accent',
    match: '2020 Hyundai Verna SX(O) 1.5 Diesel interior (India).png',
    alt: 'Hyundai Accent / Verna — Khoang lái và màn hình trung tâm',
    kind: 'INTERIOR',
    year: '2022–2024',
  },

  // 16. VinFast VF 8
  {
    key: 'vinfast-vf8-ext-1',
    group: 'vinfast-vf-8',
    match: 'VinFast VF 8 IAA 2023 1X7A0681.jpg',
    alt: 'VinFast VF 8 — SUV điện cỡ D góc chéo trước',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'vinfast-vf8-ext-2',
    group: 'vinfast-vf-8',
    match: 'VinFast VF 8 DSC 8470.jpg',
    alt: 'VinFast VF 8 — Ngoại thất dải đèn LED chữ V đặc trưng',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'vinfast-vf8-ext-3',
    group: 'vinfast-vf-8',
    match: 'VinFast VF 8 DSC 8568.jpg',
    alt: 'VinFast VF 8 — Ngoại thất góc nhìn phía sau',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'vinfast-vf8-int-1',
    group: 'vinfast-vf-8',
    match: 'Interior of VinFast VF8 car.jpg',
    alt: 'VinFast VF 8 — Khoang lái và màn hình cảm ứng 15.6 inch',
    kind: 'INTERIOR',
    year: '2023–2025',
  },

  // 17. Mercedes-Benz C300 AMG (W206)
  {
    key: 'mercedes-c300-ext-1',
    group: 'mercedes-benz-c300-amg',
    match: 'Mercedes-Benz C300 (W206) Washington DC Metro Area, USA.jpg',
    alt: 'Mercedes-Benz C 300 (W206) — Ngoại thất góc chéo trước',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'mercedes-c300-ext-2',
    group: 'mercedes-benz-c300-amg',
    match: 'Mercedes-AMG C 43 (W206) 1X7A0893.jpg',
    alt: 'Mercedes-Benz C-Class W206 — Thiết kế thân xe thể thao',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'mercedes-c300-int-1',
    group: 'mercedes-benz-c300-amg',
    match: 'Mercedes-Benz C 200 AVANTGARDE (W206) interior.jpg',
    alt: 'Mercedes-Benz C-Class W206 — Khoang lái MBUX màn hình dọc',
    kind: 'INTERIOR',
    year: '2023–2025',
  },

  // 18. Ford Ranger Wildtrak
  {
    key: 'ford-ranger-wildtrak-ext-1',
    group: 'ford-ranger-wildtrak',
    match: 'Ford Ranger (T6, P703) Wildtrak IMG 7320.jpg',
    alt: 'Ford Ranger Wildtrak Next-Gen — Ngoại thất góc chéo trước',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'ford-ranger-wildtrak-ext-2',
    group: 'ford-ranger-wildtrak',
    match: 'Ford Ranger (T6, P703) Wildtrak IMG 7323.jpg',
    alt: 'Ford Ranger Wildtrak Next-Gen — Thùng hàng và góc sau',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },

  // 19. Toyota Hilux
  {
    key: 'toyota-hilux-ext-1',
    group: 'toyota-hilux',
    match: 'Toyota HiLux GR Sport 1X7A7281.jpg',
    alt: 'Toyota Hilux — Ngoại thất bán tải cabin kép',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'toyota-hilux-ext-2',
    group: 'toyota-hilux',
    match: '2026 Toyota Hilux Z.jpg',
    alt: 'Toyota Hilux — Ngoại thất góc chéo tổng thể',
    kind: 'EXTERIOR',
    year: '2024–2025',
  },
  {
    key: 'toyota-hilux-int-1',
    group: 'toyota-hilux',
    match: 'Toyota Hilux GUN126 2.8 GR Sport - interior view.jpg',
    alt: 'Toyota Hilux — Khoang lái cabin kép',
    kind: 'INTERIOR',
    year: '2023–2025',
  },
  {
    key: 'toyota-hilux-eng-1',
    group: 'toyota-fortuner',
    match: 'The engineroom of Toyota HILUX Z (QDF-GUN125-DTTHH).jpg',
    alt: 'Toyota Hilux — Khoang động cơ Diesel',
    kind: 'ENGINE',
    year: '2023–2025',
  },

  // 20. Mitsubishi Triton
  {
    key: 'mitsubishi-triton-ext-1',
    group: 'mitsubishi-triton',
    match: 'Mitsubishi Triton 2.4 Athlete 4WD White Diamond - front.jpg',
    alt: 'Mitsubishi Triton Athlete — Ngoại thất góc trước màu trắng',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
  {
    key: 'mitsubishi-triton-ext-2',
    group: 'mitsubishi-triton',
    match: 'Mitsubishi Triton 2.4 Athlete 4WD White Diamond - rear.jpg',
    alt: 'Mitsubishi Triton Athlete — Góc sau và thùng hàng',
    kind: 'EXTERIOR',
    year: '2023–2025',
  },
]

function findCandidate(group, matchTitle) {
  const terms = candidates[group] ?? {}
  for (const list of Object.values(terms)) {
    if (!Array.isArray(list)) continue
    const found = list.find((item) => item.title === `File:${matchTitle}`)
    if (found) return found
  }
  return null
}

async function fetchImageWithRetry(url, attempt = 0) {
  await sleep(700)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NORI-Vehicle-Rental-Project/1.0 (contact@nori.local)' },
  })
  if (res.status === 429 && attempt < 4) {
    console.log('Rate limited downloading, retrying in 5s...')
    await sleep(5000 * (attempt + 1))
    return fetchImageWithRetry(url, attempt + 1)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

await fs.mkdir('public/seed-media', { recursive: true })
const manifest = {}

for (const pick of picks) {
  const outPath = path.join('public', 'seed-media', `${pick.key}.jpg`)
  const info = findCandidate(pick.group, pick.match)
  if (!info) {
    console.error('MISSING candidate:', pick.key, pick.match)
    continue
  }
  let exists = false
  try {
    const stat = await fs.stat(outPath)
    if (stat.size > 5000) exists = true
  } catch {}
  if (!exists) {
    const buf = await fetchImageWithRetry(info.thumbUrl)
    await sharp(buf)
      .resize(1280, 826, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82 })
      .toFile(outPath)
    console.log('Downloaded:', pick.key)
  } else {
    console.log('Cached:', pick.key)
  }
  manifest[pick.key] = {
    filename: `${pick.key}.jpg`,
    alt: pick.alt,
    kind: pick.kind,
    modelYear: pick.year,
    sourceUrl: info.descriptionUrl,
    sourceName: info.artist || 'Wikimedia Commons',
    license: info.license,
  }
}

await fs.writeFile('src/lib/seed-media-manifest.json', JSON.stringify(manifest, null, 2))
console.log('Saved manifest with', Object.keys(manifest).length, 'verified images.')

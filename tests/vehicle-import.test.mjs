import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import zlib from 'node:zlib'
import sharp from 'sharp'
import {
  MANUFACTURER_ADAPTERS,
  resolveAdapterByBrand,
  resolveAdapterForUrl,
} from '../src/lib/vehicle-import/adapters/registry.ts'
import {
  extractBaseFromHtmlSignals,
  extractFromPdfBuffer,
  extractHtmlSignals,
} from '../src/lib/vehicle-import/extractor.ts'
import { ImportFetchError, safeFetchUrl } from '../src/lib/vehicle-import/fetcher.ts'
import {
  approveAndCommitImportJob,
  buildFieldDiffPreview,
  rollbackImportJob,
  runVehicleImportPreview,
} from '../src/lib/vehicle-import/import-service.ts'
import {
  assertJobNotCancelled,
  createImportJob,
  isLegalJobTransition,
  MAX_CONCURRENT_IMPORT_JOBS,
  recoverStaleImportJobs,
  transitionImportJob,
} from '../src/lib/vehicle-import/job-manager.ts'
import { processAndUploadMediaCandidates } from '../src/lib/vehicle-import/media-processor.ts'
import { normalizeVehicleDraft } from '../src/lib/vehicle-import/normalizer.ts'
import {
  containsSuspiciousBinaryPayload,
  detectImageMagicBytes,
  detectPdfMagicBytes,
  ImportSecurityError,
  isBlockedIpAddress,
  sanitizeImportFilename,
  stripHtmlAndXss,
  validateImportUrl,
} from '../src/lib/vehicle-import/security.ts'

function buildSampleHtml(params) {
  const rows = params.specs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('\n')
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${params.title}</title>
  <meta name="description" content="${params.description}" />
  <meta property="og:title" content="${params.name}" />
  <meta property="og:description" content="${params.description}" />
  <meta property="og:image" content="${params.imageUrl}" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": ${JSON.stringify(params.name)},
    "brand": { "@type": "Brand", "name": ${JSON.stringify(params.brand)} },
    "description": ${JSON.stringify(params.description)},
    "image": [${JSON.stringify(params.imageUrl)}],
    "offers": { "@type": "Offer", "price": ${params.price}, "priceCurrency": "VND" }
  }
  </script>
</head>
<body>
  <h1>${params.name}</h1>
  <p>${params.description}</p>
  ${params.extraBody ?? ''}
  <table>${rows}</table>
  <img src="${params.imageUrl}" alt="${params.name}" width="1200" height="800" />
</body>
</html>`
}

function buildMinimalPdfBuffer(lines, compressed = false) {
  const escaped = lines.map((line) =>
    line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'),
  )
  const btContent = `BT\n/F1 12 Tf\n${escaped.map((l) => `(${l}) Tj`).join('\n')}\nET`
  const streamBytes = compressed
    ? zlib.deflateSync(Buffer.from(btContent, 'latin1'))
    : Buffer.from(btContent, 'latin1')
  const dict = compressed
    ? `<< /Length ${streamBytes.length} /Filter /FlateDecode >>`
    : `<< /Length ${streamBytes.length} >>`
  return Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n${dict}\nstream\n`, 'latin1'),
    streamBytes,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ])
}

function createMockPayload() {
  const store = {
    'vehicle-models': new Map(),
    'vehicle-import-jobs': new Map(),
    media: new Map(),
    vehicles: new Map(),
    'audit-logs': new Map(),
  }
  let seq = 0

  const matchWhere = (doc, where) => {
    if (!where) return true
    if (Array.isArray(where.and)) {
      return where.and.every((clause) => matchWhere(doc, clause))
    }
    for (const [field, cond] of Object.entries(where)) {
      if (cond && typeof cond === 'object') {
        if ('equals' in cond && doc[field] !== cond.equals) return false
        if ('in' in cond && Array.isArray(cond.in) && !cond.in.includes(doc[field])) return false
      }
    }
    return true
  }

  const payload = {
    async find({ collection, where, limit = 50, overrideAccess }) {
      assert.equal(overrideAccess, false, `${collection}.find must pass overrideAccess: false`)
      const docs = [...(store[collection]?.values() ?? [])].filter((d) => matchWhere(d, where))
      return {
        docs: docs.slice(0, limit),
        totalDocs: docs.length,
        page: 1,
        totalPages: 1,
      }
    },
    async count({ collection, where, overrideAccess }) {
      assert.equal(overrideAccess, false, `${collection}.count must pass overrideAccess: false`)
      const docs = [...(store[collection]?.values() ?? [])].filter((d) => matchWhere(d, where))
      return { totalDocs: docs.length }
    },
    async findByID({ collection, id, overrideAccess }) {
      assert.equal(overrideAccess, false, `${collection}.findByID must pass overrideAccess: false`)
      const doc = store[collection]?.get(String(id))
      if (!doc) throw new Error(`Not found: ${collection}/${id}`)
      return structuredClone(doc)
    },
    async create({ collection, data, overrideAccess, file }) {
      if (collection !== 'audit-logs') {
        assert.equal(overrideAccess, false, `${collection}.create must pass overrideAccess: false`)
      }
      const id = String(data.id ?? `${collection}-${++seq}`)
      const now = new Date().toISOString()
      const doc = {
        ...structuredClone(data),
        id,
        ...(file?.name ? { filename: file.name, url: `/api/media/file/${file.name}` } : {}),
        createdAt: now,
        updatedAt: now,
      }
      store[collection]?.set(id, doc)
      return structuredClone(doc)
    },
    async update({ collection, id, data, overrideAccess }) {
      assert.equal(overrideAccess, false, `${collection}.update must pass overrideAccess: false`)
      const prev = store[collection]?.get(String(id))
      if (!prev) throw new Error(`Missing ${collection}/${id}`)
      const next = {
        ...prev,
        ...structuredClone(data),
        id: String(id),
        updatedAt: new Date().toISOString(),
      }
      store[collection]?.set(String(id), next)
      return structuredClone(next)
    },
    async delete({ collection, id, overrideAccess }) {
      assert.equal(overrideAccess, false, `${collection}.delete must pass overrideAccess: false`)
      const prev = store[collection]?.get(String(id))
      store[collection]?.delete(String(id))
      return prev
    },
  }

  return { payload, store }
}

const mockAdminUser = {
  id: 'admin-qa-1',
  email: 'qa-admin@nori.vn',
  collection: 'admins',
  adminRole: 'SUPER_ADMIN',
}

describe('NORI Smart Vehicle Import — Security, Adapters, Normalizer, State Machine & Rollback', () => {
  it('Adapters: resolves and extracts all 10 VN manufacturer adapters + generic fallback', () => {
    assert.equal(MANUFACTURER_ADAPTERS.length, 10)

    const cases = [
      {
        id: 'toyota',
        brand: 'Toyota',
        url: 'https://www.toyota.com.vn/fortuner',
        name: 'Toyota Fortuner Legender 2.8AT 2026',
        price: 1_350_000_000,
        cat: 'CAR',
        specs: [
          ['Động cơ', '2.8L Turbo Diesel'],
          ['Hộp số', 'Tự động 6 cấp'],
        ],
      },
      {
        id: 'honda',
        brand: 'Honda',
        url: 'https://www.honda.com.vn/o-to/cr-v',
        name: 'Honda CR-V L 2025',
        price: 1_099_000_000,
        cat: 'CAR',
        specs: [
          ['Động cơ', '1.5L VTEC Turbo'],
          ['Công suất', '188 hp'],
        ],
      },
      {
        id: 'ford',
        brand: 'Ford',
        url: 'https://www.ford.com.vn/trucks/ranger-raptor',
        name: 'Ford Ranger Raptor 2025',
        price: 1_299_000_000,
        cat: 'PICKUP',
        specs: [
          ['Tải trọng thùng hàng', '750 kg'],
          ['Động cơ', '2.0L Bi-Turbo'],
        ],
      },
      {
        id: 'mitsubishi',
        brand: 'Mitsubishi',
        url: 'https://www.mitsubishi-motors.com.vn/xpander',
        name: 'Mitsubishi Xpander Cross 2025',
        price: 698_000_000,
        cat: 'CAR',
        specs: [
          ['Số chỗ ngồi', '7 chỗ'],
          ['Khoảng sáng gầm', '225 mm'],
        ],
      },
      {
        id: 'mazda',
        brand: 'Mazda',
        url: 'https://mazdamotors.vn/vehicles/mazda-cx-5',
        name: 'Mazda CX-5 Premium 2025',
        price: 829_000_000,
        cat: 'CAR',
        specs: [
          ['Động cơ', 'SkyActiv-G 2.0L'],
          ['Dẫn động', 'FWD'],
        ],
      },
      {
        id: 'hyundai',
        brand: 'Hyundai',
        url: 'https://hyundai.thanhcong.vn/san-pham/hyundai-accent',
        name: 'Hyundai Accent Cao cấp 2025',
        price: 569_000_000,
        cat: 'CAR',
        specs: [
          ['Động cơ', 'Smartstream 1.5L'],
          ['Hộp số', 'IVT'],
        ],
      },
      {
        id: 'mercedes-benz',
        brand: 'Mercedes-Benz',
        url: 'https://www.mercedes-benz.com.vn/vi/passengercars/c300',
        name: 'Mercedes-Benz C 300 AMG 2025',
        price: 2_099_000_000,
        cat: 'CAR',
        specs: [
          ['Động cơ', 'I4 2.0L Turbo EQ Boost'],
          ['Công suất', '258 hp'],
        ],
      },
      {
        id: 'vinfast',
        brand: 'VinFast',
        url: 'https://vinfastauto.com/vn_vi/vf-8',
        name: 'VinFast VF 8 Plus 2025',
        price: 1_199_000_000,
        cat: 'CAR',
        specs: [
          ['Dung lượng pin', '87.7 kWh'],
          ['Quãng đường WLTP', '471 km'],
        ],
      },
      {
        id: 'yamaha',
        brand: 'Yamaha',
        url: 'https://yamaha-motor.com.vn/xe/exciter-155-vva',
        name: 'Yamaha Exciter 155 VVA ABS 2025',
        price: 54_000_000,
        cat: 'MOTORBIKE',
        specs: [
          ['Động cơ', '155cc SOHC VVA'],
          ['Dung tích bình xăng', '5.4 lít'],
        ],
      },
      {
        id: 'kawasaki',
        brand: 'Kawasaki',
        url: 'https://www.kawasakivietnam.vn/vi/motorcycles/z650-abs',
        name: 'Kawasaki Z650 ABS 2025',
        price: 189_000_000,
        cat: 'MOTORBIKE',
        specs: [
          ['Động cơ', '649cc Parallel-Twin'],
          ['Phanh ABS', 'Có'],
        ],
      },
    ]

    for (const tc of cases) {
      const adapter = resolveAdapterForUrl(tc.url)
      assert.equal(adapter.id, tc.id, `Expected adapter ${tc.id} for ${tc.url}`)
      assert.equal(resolveAdapterByBrand(tc.brand).id, tc.id)

      const html = buildSampleHtml({
        title: `${tc.name} | ${tc.brand} Việt Nam`,
        brand: tc.brand,
        name: tc.name,
        description: `Thông tin chính hãng ${tc.name} tại thị trường Việt Nam năm 2025.`,
        price: tc.price,
        imageUrl: `${new URL(tc.url).origin}/images/hero.jpg`,
        specs: tc.specs,
      })
      const signals = extractHtmlSignals(html, tc.url)
      const base = extractBaseFromHtmlSignals(signals, tc.url)
      const extracted = adapter.extract({ url: tc.url, html, signals, base })

      assert.equal(extracted.adapterId, tc.id)
      assert.equal(extracted.brand, tc.brand)
      assert.equal(extracted.category, tc.cat)
      assert.equal(extracted.msrpReferenceVnd, tc.price)
      assert.ok((extracted.specifications?.length ?? 0) >= 2)
      assert.ok((extracted.mediaCandidates?.length ?? 0) >= 1)
    }

    const fallback = resolveAdapterForUrl('https://custom-oem.example.com/model-x')
    assert.equal(fallback.id, 'generic')
    const gHtml = buildSampleHtml({
      title: 'Generic Model X 2025',
      brand: 'OEM',
      name: 'OEM Model X 2025',
      description: 'Mô tả tổng quan dòng xe OEM chính thức.',
      price: 750_000_000,
      imageUrl: 'https://custom-oem.example.com/hero.jpg',
      specs: [['Công suất', '150 hp']],
    })
    const gSig = extractHtmlSignals(gHtml, 'https://custom-oem.example.com/model-x')
    const gRes = fallback.extract({
      url: 'https://custom-oem.example.com/model-x',
      html: gHtml,
      signals: gSig,
      base: extractBaseFromHtmlSignals(gSig, 'https://custom-oem.example.com/model-x'),
    })
    assert.equal(gRes.adapterId, 'generic')
    assert.equal(gRes.modelYear, 2025)
  })

  it('SSRF & Security: enforces HTTPS, allowlist, private IPv4/IPv6/DNS/redirect blocks, magic bytes & XSS sanitization', async () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '64:ff9b::169.254.169.254',
    ]) {
      assert.equal(isBlockedIpAddress(ip), true, `Expected blocked IP: ${ip}`)
    }
    assert.equal(isBlockedIpAddress('1.1.1.1'), false)
    assert.equal(isBlockedIpAddress('2001:4860:4860::8888'), false)

    await assert.rejects(
      validateImportUrl('http://www.toyota.com.vn/fortuner', { skipDnsCheck: true }),
      (e) => e instanceof ImportSecurityError && e.code === 'HTTPS_REQUIRED',
    )
    await assert.rejects(
      validateImportUrl('https://user:pass@www.toyota.com.vn/fortuner', { skipDnsCheck: true }),
      (e) => e instanceof ImportSecurityError && e.code === 'URL_CREDENTIALS_FORBIDDEN',
    )
    await assert.rejects(
      validateImportUrl('https://www.toyota.com.vn:8443/fortuner', { skipDnsCheck: true }),
      (e) => e instanceof ImportSecurityError && e.code === 'PORT_FORBIDDEN',
    )
    await assert.rejects(
      validateImportUrl('https://localhost/admin', { skipDnsCheck: true }),
      (e) => e instanceof ImportSecurityError && e.code === 'SSRF_LOCAL_HOST',
    )
    await assert.rejects(
      validateImportUrl('https://127.0.0.1/secret', { skipDnsCheck: true }),
      (e) => e instanceof ImportSecurityError && e.code === 'IP_LITERAL_FORBIDDEN',
    )
    await assert.rejects(
      validateImportUrl('https://evil.example.com/car', { skipDnsCheck: true }),
      (e) => e instanceof ImportSecurityError && e.code === 'DOMAIN_NOT_ALLOWLISTED',
    )

    await assert.rejects(
      validateImportUrl('https://www.toyota.com.vn/fortuner', {
        dnsLookup: async () => [{ address: '169.254.169.254', family: 4 }],
      }),
      (e) => e instanceof ImportSecurityError && e.code === 'SSRF_PRIVATE_IP',
    )

    await assert.rejects(
      safeFetchUrl('https://www.toyota.com.vn/fortuner', {
        dnsLookup: async () => [{ address: '104.18.10.10', family: 4 }],
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'http://127.0.0.1/latest/meta-data/' },
          }),
      }),
      (e) => e instanceof ImportSecurityError,
    )

    await assert.rejects(
      safeFetchUrl('https://www.toyota.com.vn/fortuner', {
        skipDnsCheck: true,
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://www.toyota.com.vn/next' },
          }),
      }),
      (e) => e instanceof ImportFetchError && e.code === 'TOO_MANY_REDIRECTS',
    )

    await assert.rejects(
      safeFetchUrl('https://www.ford.com.vn/trucks/ranger', {
        skipDnsCheck: true,
        fetchImpl: async () =>
          new Response('Access Denied - Cloudflare Turnstile', { status: 403 }),
      }),
      (e) => e instanceof ImportFetchError && e.code === 'UPSTREAM_WAF_BLOCKED',
    )

    assert.equal(
      detectImageMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.ext,
      'jpg',
    )
    assert.equal(
      detectImageMagicBytes(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
      )?.ext,
      'png',
    )
    assert.equal(detectImageMagicBytes(Buffer.from('RIFF1234WEBP', 'ascii'))?.ext, 'webp')
    assert.equal(detectPdfMagicBytes(Buffer.from('%PDF-1.7\n...', 'ascii')), true)

    const fakeJpgScript = Buffer.from('<script>alert(1)</script> padded bytes here', 'utf8')
    const fakeJpgPhp = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]),
      Buffer.from('<?php system($_GET["c"]); ?>', 'utf8'),
    ])
    assert.equal(detectImageMagicBytes(fakeJpgScript), null)
    assert.equal(containsSuspiciousBinaryPayload(fakeJpgScript), true)
    assert.equal(containsSuspiciousBinaryPayload(fakeJpgPhp), true)

    const safeName = sanitizeImportFilename('../../etc/passwd?Ảnh Xe!.jpg', 'webp', 1)
    assert.ok(!safeName.includes('..') && !safeName.includes('/') && safeName.endsWith('.webp'))
    const sanitized = stripHtmlAndXss(
      '&lt;script&gt;alert(1)&lt;/script&gt;<img src=x onerror=alert(1)>Toyota <a href="javascript:evil()">Fortuner</a>',
    )
    assert.equal(sanitized.includes('<script'), false)
    assert.equal(sanitized.includes('onerror='), false)
    assert.equal(sanitized.includes('javascript:'), false)
    assert.ok(sanitized.includes('Toyota') && sanitized.includes('Fortuner'))
  })

  it('Normalizer & PDF Extractor: enforces EV/Motorbike spec rules and parses PDF with pageRef & uncertainty flags', () => {
    const evDraft = normalizeVehicleDraft({
      brand: 'VinFast',
      name: 'VF 8 Plus',
      category: 'CAR',
      subCategory: 'ELECTRIC_CAR',
      fuelType: 'Điện (EV)',
      modelYear: 2025,
      market: 'VN',
      specifications: [
        { group: 'EV', label: 'Dung lượng pin', value: '87.7 kWh', confidence: 'HIGH' },
        { group: 'ENGINE', label: 'Dung tích bình xăng', value: '60 lít', confidence: 'HIGH' },
        { group: 'ENGINE', label: 'Số xi-lanh', value: '4 xi-lanh thẳng hàng', confidence: 'HIGH' },
      ],
    })
    assert.equal(evDraft.specifications.length, 1)
    assert.equal(evDraft.specifications[0]?.label, 'Dung lượng pin')
    assert.equal(evDraft.verificationStatus, 'VERIFIED')

    const motoDraft = normalizeVehicleDraft({
      brand: 'Yamaha',
      name: 'Exciter 155 VVA',
      category: 'MOTORBIKE',
      modelYear: 2025,
      market: 'US',
      seats: 5,
      driveType: 'AWD',
      interiorOverview: 'Khoang nội thất 5 chỗ bọc da',
      specifications: [
        { group: 'MOTORBIKE', label: 'Động cơ', value: '155cc SOHC', confidence: 'HIGH' },
        { group: 'DIMENSIONS', label: 'Khoang hành lý', value: '450 lít', confidence: 'HIGH' },
        { group: 'OVERVIEW', label: 'Cửa sổ trời', value: 'Toàn cảnh', confidence: 'HIGH' },
      ],
      mediaCandidates: [
        { url: 'https://yamaha-motor.com.vn/ext.jpg', kind: 'EXTERIOR' },
        { url: 'https://yamaha-motor.com.vn/cabin.jpg', kind: 'INTERIOR' },
      ],
    })
    assert.equal(motoDraft.seats, 2)
    assert.equal(motoDraft.driveType, null)
    assert.equal(motoDraft.interiorOverview, null)
    assert.equal(motoDraft.specifications.length, 1)
    assert.equal(motoDraft.mediaCandidates.length, 1)
    assert.ok(motoDraft.uncertaintyFlags.some((f) => f.field === 'market'))

    const pdfBuf = buildMinimalPdfBuffer(
      [
        'Toyota Fortuner 2026',
        'Gia niem yet: 1.155.000.000 VND',
        'Dong co: 2.7L Xang',
        'Muc tieu thu: ~10.5 lit/100km',
      ],
      true,
    )
    const parsedPdf = extractFromPdfBuffer(pdfBuf, 'toyota-fortuner-2026.pdf')
    assert.equal(parsedPdf.pages.length, 1)
    assert.equal(parsedPdf.extracted.brand, 'Toyota')
    assert.equal(parsedPdf.extracted.modelYear, 2026)
    assert.equal(parsedPdf.extracted.msrpReferenceVnd, 1_155_000_000)
    assert.ok((parsedPdf.extracted.specifications?.length ?? 0) >= 2)
    assert.equal(parsedPdf.extracted.specifications?.[0]?.pageRef, 1)
    assert.ok(
      parsedPdf.extracted.uncertaintyFlags?.some(
        (u) => u.severity === 'REVIEW' && u.pageRef === 1 && u.field.includes('Muc tieu thu'),
      ),
    )

    const emptyPdf = Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1')
    const scannedParsed = extractFromPdfBuffer(emptyPdf, 'scanned-brochure.pdf')
    assert.equal(scannedParsed.pages.length, 0)
    assert.ok(scannedParsed.extracted.uncertaintyFlags?.some((u) => u.field === 'pdfTextLayer'))
  })

  it('Media Processor: validates dimensions/magic bytes and deduplicates identical SHA-256 uploads', async () => {
    const { payload, store } = createMockPayload()
    const validPng = await sharp({
      create: { width: 640, height: 400, channels: 3, background: { r: 220, g: 38, b: 38 } },
    })
      .png()
      .toBuffer()

    const res = await processAndUploadMediaCandidates({
      payload,
      user: mockAdminUser,
      modelName: 'Toyota Fortuner',
      modelYear: 2026,
      skipDnsCheck: true,
      candidates: [
        { url: 'https://www.toyota.com.vn/img-1.png', kind: 'OVERVIEW' },
        { url: 'https://www.toyota.com.vn/img-dup.png', kind: 'EXTERIOR' },
        { url: 'https://www.toyota.com.vn/fake.jpg', kind: 'FEATURE' },
      ],
      fetchImpl: async (input) => {
        const u = String(input)
        if (u.endsWith('fake.jpg')) {
          return new Response('<script>alert(1)</script>', { status: 200 })
        }
        return new Response(new Uint8Array(validPng), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      },
    })

    assert.equal(store.media.size, 1, 'Duplicate SHA-256 candidate must not create 2 media rows')
    assert.equal(res.report[0]?.status, 'UPLOADED')
    assert.equal(res.report[1]?.status, 'DEDUPLICATED')
    assert.equal(res.report[2]?.status, 'FAILED')
    assert.ok(res.coverId)

    const res2 = await processAndUploadMediaCandidates({
      payload,
      user: mockAdminUser,
      modelName: 'Toyota Fortuner',
      skipDnsCheck: true,
      candidates: [{ url: 'https://www.toyota.com.vn/img-again.png', kind: 'OVERVIEW' }],
      fetchImpl: async () => new Response(new Uint8Array(validPng), { status: 200 }),
    })
    assert.equal(store.media.size, 1)
    assert.equal(res2.report[0]?.status, 'DEDUPLICATED')
    assert.equal(res2.report[0]?.mediaId, res.coverId)
  })

  it('Job State Machine, Diff Preview, Locked Fields, Idempotency, Demo Separation & Rollback', async () => {
    assert.equal(isLegalJobTransition('QUEUED', 'FETCHING'), true)
    assert.equal(isLegalJobTransition('COMPLETED', 'QUEUED'), false)
    assert.equal(isLegalJobTransition('FAILED', 'QUEUED'), true)

    const { payload, store } = createMockPayload()

    const existingModel = {
      id: 'model-vf8',
      name: 'VinFast VF 8',
      officialName: 'VinFast VF 8',
      slug: 'vinfast-vf-8',
      brand: 'VinFast',
      category: 'CAR',
      subCategory: 'ELECTRIC_CAR',
      shortDescription: 'Mô tả nội bộ đã khóa bởi Admin',
      referenceRentPrice: 1_550_000,
      defaultDepositSuggestion: 15_000_000,
      lockedFields: ['shortDescription'],
      revisionNumber: 3,
      verificationStatus: 'VERIFIED',
      visible: true,
    }
    store['vehicle-models'].set('model-vf8', existingModel)

    const staleJob = await createImportJob({
      payload,
      user: mockAdminUser,
      method: 'URL',
      sourceInput: { url: 'https://www.toyota.com.vn/fortuner' },
    })
    store['vehicle-import-jobs'].set(String(staleJob.id), {
      ...store['vehicle-import-jobs'].get(String(staleJob.id)),
      status: 'FETCHING',
      startedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    })
    const recoveredCount = await recoverStaleImportJobs(payload, mockAdminUser)
    assert.equal(recoveredCount, 1)
    assert.equal(
      store['vehicle-import-jobs'].get(String(staleJob.id))?.errorCode,
      'RECOVERED_AFTER_RESTART',
    )

    const activeJobs = []
    for (let i = 0; i < MAX_CONCURRENT_IMPORT_JOBS; i += 1) {
      const j = await createImportJob({
        payload,
        user: mockAdminUser,
        method: 'BULK',
        sourceInput: { index: i },
      })
      activeJobs.push(String(j.id))
    }
    await assert.rejects(
      createImportJob({ payload, user: mockAdminUser, method: 'URL', sourceInput: {} }),
      /tiến trình nhập dữ liệu/i,
    )
    for (const id of activeJobs) {
      await transitionImportJob({
        payload,
        user: mockAdminUser,
        jobId: id,
        toStatus: 'CANCELLED',
      })
      await assert.rejects(assertJobNotCancelled(payload, mockAdminUser, id), /đã bị hủy/i)
    }

    const previewRes = await runVehicleImportPreview({
      payload,
      user: mockAdminUser,
      method: 'BULK',
      targetModelId: 'model-vf8',
      conflictPolicy: 'OVERWRITE_UNLOCKED',
      jsonPayload: [
        {
          brand: 'VinFast',
          name: 'VinFast VF 8',
          category: 'CAR',
          subCategory: 'ELECTRIC_CAR',
          fuelType: 'Điện (EV)',
          modelYear: 2025,
          msrpReferenceVnd: 1_249_000_000,
          shortDescription: 'Mô tả từ nguồn ngoài (KHÔNG ĐƯỢC GHI ĐÈ)',
          description: 'Mô tả tổng quan mới đã đồng bộ từ hãng.',
          referenceRentPrice: 999,
          defaultDepositSuggestion: 111,
          specifications: [
            { group: 'EV', label: 'Dung lượng pin', value: '87.7 kWh', confidence: 'HIGH' },
          ],
        },
      ],
    })

    const lockedRow = previewRes.diff.find((d) => d.field === 'shortDescription')
    assert.equal(lockedRow?.locked, true)
    assert.equal(lockedRow?.selected, false)

    const approveRes = await approveAndCommitImportJob({
      payload,
      user: mockAdminUser,
      jobId: String(previewRes.job.id),
      publishMode: 'PUBLISH',
      downloadMedia: false,
    })

    assert.equal(store['vehicle-models'].size, 1, 'Idempotent upsert must not duplicate model')
    const saved = store['vehicle-models'].get('model-vf8')
    assert.equal(saved.shortDescription, 'Mô tả nội bộ đã khóa bởi Admin')
    assert.equal(saved.description, 'Mô tả tổng quan mới đã đồng bộ từ hãng.')
    assert.equal(saved.msrpReferenceVnd, 1_249_000_000)
    assert.equal(saved.referenceRentPrice, 1_550_000, 'NORI rental price must never be overwritten')
    assert.equal(saved.defaultDepositSuggestion, 15_000_000)
    assert.equal(approveRes.model.revisionNumber, 4)

    const rbRes = await rollbackImportJob({
      payload,
      user: mockAdminUser,
      jobId: String(previewRes.job.id),
    })
    assert.equal(rbRes.ok, true)
    const afterRollback = store['vehicle-models'].get('model-vf8')
    assert.equal(afterRollback.description ?? null, null)
    assert.equal(afterRollback.revisionNumber, 3)

    await assert.rejects(
      rollbackImportJob({
        payload,
        user: mockAdminUser,
        jobId: String(previewRes.job.id),
      }),
      /đã được Rollback/i,
    )

    const skipDiff = buildFieldDiffPreview({
      existing: existingModel,
      draft: previewRes.preview,
      conflictPolicy: 'SKIP_EXISTING',
    })
    assert.equal(
      skipDiff.some((d) => d.field === 'description' && d.selected),
      false,
    )
  })
})

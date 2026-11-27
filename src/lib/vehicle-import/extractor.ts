import zlib from 'node:zlib'
import { stripHtmlAndXss } from './security.ts'
import type {
  ExtractedFeatureItem,
  ExtractedMediaCandidate,
  ExtractedSpecItem,
  ExtractedVehicleRaw,
  GalleryKind,
  SpecGroup,
  UncertaintyFlag,
} from './types.ts'

export type HtmlExtractionResult = {
  title: string
  description: string
  canonicalUrl: string | null
  ogTitle: string | null
  ogDescription: string | null
  ogImages: string[]
  jsonLdObjects: Record<string, unknown>[]
  tableRows: Array<{ label: string; value: string; section?: string }>
  mediaCandidates: ExtractedMediaCandidate[]
  paragraphs: string[]
}

function resolveMaybeRelativeUrl(raw: string, baseUrl: string): string | null {
  const cleaned = raw.trim()
  if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('javascript:')) return null
  try {
    const resolved = new URL(cleaned, baseUrl)
    if (resolved.protocol !== 'https:') return null
    return resolved.toString()
  } catch {
    return null
  }
}

export function classifyMediaKind(hint: string): GalleryKind {
  const h = hint.toLowerCase()
  if (/interior|noi-that|cabin|cockpit|dashboard|seat|ghe|vo-lang/.test(h)) return 'INTERIOR'
  if (/engine|dong-co|motor|pin|battery|chassis|khung-gam|powertrain/.test(h)) return 'ENGINE'
  if (/feature|tech|cong-nghe|safety|an-toan|adas|detail|chi-tiet/.test(h)) return 'FEATURE'
  if (/banner|hero|overview|tong-the|cover|main/.test(h)) return 'OVERVIEW'
  return 'EXTERIOR'
}

export function classifySpecGroup(label: string, sectionHint = ''): SpecGroup {
  const text = `${sectionHint} ${label}`.toLowerCase()
  if (/pin|battery|kwh|quãng đường|quang duong|wltp|nedc|sạc|sac|range|ev|điện|dien/.test(text)) {
    return 'EV'
  }
  if (
    /yên xe|yen xe|dung tích bình|xe máy|xe may|phuộc|phuoc|côn|con tay|lốp trước|lop truoc/.test(
      text,
    )
  ) {
    return 'MOTORBIKE'
  }
  if (
    /thùng hàng|thung hang|tải trọng|tai trong|gài cầu|gai cau|bán tải|ban tai|towing|payload/.test(
      text,
    )
  ) {
    return 'PICKUP'
  }
  if (
    /động cơ|dong co|công suất|cong suat|mô-men|mo men|torque|power|hộp số|hop so|dẫn động|dan dong|xi-lanh|xi lanh|nhiên liệu|nhien lieu|tăng tốc|tang toc|vận tốc|van toc/.test(
      text,
    )
  ) {
    return 'ENGINE'
  }
  if (
    /kích thước|kich thuoc|dài|dai x r|chiều dài cơ sở|chieu dai co so|khoảng sáng|khoang sang|trọng lượng|trong luong|dung tích khoang|hành lý|hanh ly|lốp|mâm|bánh/.test(
      text,
    )
  ) {
    return 'DIMENSIONS'
  }
  if (
    /treo|phanh|an toàn|an toan|túi khí|tui khi|khung gầm|khung gam|abs|ebd|esp|adas|hỗ trợ lái/.test(
      text,
    )
  ) {
    return 'CHASSIS'
  }
  return 'OVERVIEW'
}

function getAttr(tag: string, attrName: string): string | null {
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const match = tag.match(regex)
  if (!match) return null
  return stripHtmlAndXss(match[1] ?? match[2] ?? match[3] ?? '', 1000) || null
}

function extractJsonLdBlocks(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = []
  const regex = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const rawJson = match[1]?.trim()
    if (!rawJson || rawJson.length > 500_000) continue
    try {
      const parsed = JSON.parse(rawJson) as unknown
      const pushNode = (node: unknown) => {
        if (!node || typeof node !== 'object') return
        const rec = node as Record<string, unknown>
        if (Array.isArray(rec['@graph'])) {
          for (const g of rec['@graph']) pushNode(g)
        } else {
          results.push(rec)
        }
      }
      if (Array.isArray(parsed)) {
        for (const item of parsed) pushNode(item)
      } else {
        pushNode(parsed)
      }
    } catch {
      // Ignore malformed JSON-LD block
    }
  }
  return results
}

export function extractHtmlSignals(html: string, baseUrl: string): HtmlExtractionResult {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = stripHtmlAndXss(titleMatch?.[1] ?? '', 250)

  let description = ''
  let canonicalUrl: string | null = null
  let ogTitle: string | null = null
  let ogDescription: string | null = null
  const ogImages: string[] = []

  const metaRegex = /<meta\b[^>]*>/gi
  let metaMatch: RegExpExecArray | null
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const tag = metaMatch[0]
    const name = (getAttr(tag, 'name') ?? '').toLowerCase()
    const prop = (getAttr(tag, 'property') ?? '').toLowerCase()
    const content = getAttr(tag, 'content') ?? ''
    if (!content) continue
    if (name === 'description' && !description) description = content
    if (prop === 'og:title' && !ogTitle) ogTitle = content
    if (prop === 'og:description' && !ogDescription) ogDescription = content
    if (prop === 'og:image' || prop === 'og:image:secure_url') {
      const resolved = resolveMaybeRelativeUrl(content, baseUrl)
      if (resolved) ogImages.push(resolved)
    }
  }

  const linkRegex = /<link\b[^>]*>/gi
  let linkMatch: RegExpExecArray | null
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const tag = linkMatch[0]
    const rel = (getAttr(tag, 'rel') ?? '').toLowerCase()
    if (rel === 'canonical') {
      const href = getAttr(tag, 'href')
      if (href) canonicalUrl = resolveMaybeRelativeUrl(href, baseUrl)
    }
  }

  const jsonLdObjects = extractJsonLdBlocks(html)

  // Extract table rows <tr><td>...</td><td>...</td></tr>
  const tableRows: Array<{ label: string; value: string; section?: string }> = []
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch: RegExpExecArray | null
  while ((trMatch = trRegex.exec(html)) !== null && tableRows.length < 180) {
    const cells: string[] = []
    const cellRegex = /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRegex.exec(trMatch[1] ?? '')) !== null) {
      const cellText = stripHtmlAndXss(cellMatch[1] ?? '', 300)
      if (cellText) cells.push(cellText)
    }
    if (cells.length >= 2 && cells[0]!.length <= 120) {
      tableRows.push({ label: cells[0]!, value: cells.slice(1).join(' / ') })
    }
  }

  // Extract <dt>/<dd> definition lists
  const dlRegex = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi
  let dlMatch: RegExpExecArray | null
  while ((dlMatch = dlRegex.exec(html)) !== null && tableRows.length < 220) {
    const label = stripHtmlAndXss(dlMatch[1] ?? '', 120)
    const value = stripHtmlAndXss(dlMatch[2] ?? '', 300)
    if (label && value) tableRows.push({ label, value })
  }

  // Extract images (filtering icons/logos/trackers)
  const seenUrls = new Set<string>()
  const mediaCandidates: ExtractedMediaCandidate[] = []
  for (const ogImg of ogImages) {
    if (!seenUrls.has(ogImg)) {
      seenUrls.add(ogImg)
      mediaCandidates.push({
        url: ogImg,
        kind: 'OVERVIEW',
        photoType: 'OG_HERO',
        altText: ogTitle || title || 'Ảnh đại diện catalogue',
        sourceUrl: baseUrl,
        selected: true,
      })
    }
  }

  const imgRegex = /<img\b[^>]*>/gi
  let imgMatch: RegExpExecArray | null
  while ((imgMatch = imgRegex.exec(html)) !== null && mediaCandidates.length < 40) {
    const tag = imgMatch[0]
    const rawSrc =
      getAttr(tag, 'data-src') ?? getAttr(tag, 'data-lazy-src') ?? getAttr(tag, 'src') ?? ''
    const resolved = resolveMaybeRelativeUrl(rawSrc, baseUrl)
    if (!resolved || seenUrls.has(resolved)) continue
    if (/\.svg(\?|$)|favicon|logo|icon|sprite|pixel|spacer|placeholder|1x1/i.test(resolved)) {
      continue
    }
    const altText = getAttr(tag, 'alt') ?? undefined
    const cls = getAttr(tag, 'class') ?? ''
    if (/logo|icon|avatar/i.test(`${altText ?? ''} ${cls}`)) continue
    const widthAttr = Number(getAttr(tag, 'width') ?? 0)
    const heightAttr = Number(getAttr(tag, 'height') ?? 0)
    if ((widthAttr > 0 && widthAttr < 120) || (heightAttr > 0 && heightAttr < 80)) continue

    seenUrls.add(resolved)
    const kind = classifyMediaKind(`${resolved} ${altText ?? ''} ${cls}`)
    mediaCandidates.push({
      url: resolved,
      kind,
      altText,
      sourceUrl: baseUrl,
      width: widthAttr > 0 ? widthAttr : undefined,
      height: heightAttr > 0 ? heightAttr : undefined,
      selected: true,
    })
  }

  // Extract clean informative paragraphs
  const paragraphs: string[] = []
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  let pMatch: RegExpExecArray | null
  while ((pMatch = pRegex.exec(html)) !== null && paragraphs.length < 30) {
    const txt = stripHtmlAndXss(pMatch[1] ?? '', 1200)
    if (txt.length >= 40) paragraphs.push(txt)
  }

  return {
    title,
    description,
    canonicalUrl,
    ogTitle,
    ogDescription,
    ogImages,
    jsonLdObjects,
    tableRows,
    mediaCandidates,
    paragraphs,
  }
}

export function extractBaseFromHtmlSignals(
  signals: HtmlExtractionResult,
  sourceUrl: string,
): Partial<ExtractedVehicleRaw> {
  let name = signals.ogTitle || signals.title
  let description = signals.ogDescription || signals.description || signals.paragraphs[0] || ''
  let listedPrice: number | undefined
  let brand: string | undefined
  const extraMedia: ExtractedMediaCandidate[] = []

  for (const ld of signals.jsonLdObjects) {
    const rawType = String(ld['@type'] ?? '').toLowerCase()
    const isVehicleOrProduct = /\b(product|vehicle|car|motorcycle|individualproduct)\b/.test(
      rawType,
    )
    if (!isVehicleOrProduct) continue
    if (typeof ld.name === 'string' && ld.name.trim()) {
      name = stripHtmlAndXss(ld.name, 140)
    }
    if (typeof ld.description === 'string' && ld.description.trim()) {
      description = stripHtmlAndXss(ld.description, 2500)
    }
    if (ld.brand) {
      if (typeof ld.brand === 'string') brand = stripHtmlAndXss(ld.brand, 80)
      else if (typeof ld.brand === 'object' && ld.brand !== null && 'name' in ld.brand) {
        brand = stripHtmlAndXss((ld.brand as { name?: unknown }).name, 80)
      }
    }
    const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers
    if (offers && typeof offers === 'object') {
      const rec = offers as Record<string, unknown>
      const rawPrice = Number(rec.price ?? rec.lowPrice ?? 0)
      if (Number.isFinite(rawPrice) && rawPrice > 10_000_000) {
        listedPrice = Math.round(rawPrice)
      }
    }
    const imgs = Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : []
    for (const img of imgs) {
      const urlStr = typeof img === 'string' ? img : (img as { url?: string })?.url
      if (urlStr) {
        const resolved = resolveMaybeRelativeUrl(urlStr, sourceUrl)
        if (resolved) {
          extraMedia.push({
            url: resolved,
            kind: 'OVERVIEW',
            altText: name || undefined,
            sourceUrl,
            selected: true,
          })
        }
      }
    }
  }

  const specifications: ExtractedSpecItem[] = signals.tableRows.map((row) => ({
    group: classifySpecGroup(row.label, row.section),
    label: row.label,
    value: row.value,
    source: sourceUrl,
    confidence: 'HIGH',
  }))

  const seenMedia = new Set(signals.mediaCandidates.map((m) => m.url))
  const combinedMedia = [...signals.mediaCandidates]
  for (const em of extraMedia) {
    if (!seenMedia.has(em.url)) {
      seenMedia.add(em.url)
      combinedMedia.unshift(em)
    }
  }

  return {
    brand,
    name: name ? name.split('|')[0]?.split(' - ')[0]?.trim() : undefined,
    officialName: name || undefined,
    shortDescription: description ? description.slice(0, 480) : undefined,
    description: description || undefined,
    listedPrice,
    msrpReferenceVnd: listedPrice,
    specifications,
    mediaCandidates: combinedMedia.slice(0, 30),
    sourceUrl,
    sourceType: 'OFFICIAL_URL',
  }
}

function decodePdfLiteralString(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = raw[i + 1]
    if (!next) break
    i += 1
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next === 'b') out += '\b'
    else if (next === 'f') out += '\f'
    else if (next === '(' || next === ')' || next === '\\') out += next
    else if (/[0-7]/.test(next)) {
      const oct = raw.slice(i, i + 3).match(/^[0-7]{1,3}/)?.[0] ?? next
      out += String.fromCharCode(Number.parseInt(oct, 8))
      i += oct.length - 1
    } else {
      out += next
    }
  }
  return out
}

function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, '')
  if (clean.length < 2) return ''
  const bytes = Buffer.from(clean.length % 2 === 1 ? `${clean}0` : clean, 'hex')
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = ''
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!)
    }
    return out
  }
  return bytes.toString('latin1')
}

function extractTextOperatorsFromStream(streamText: string): string[] {
  const lines: string[] = []
  const btRegex = /BT([\s\S]*?)ET/g
  let btMatch: RegExpExecArray | null
  while ((btMatch = btRegex.exec(streamText)) !== null) {
    const block = btMatch[1] ?? ''
    let currentParts: string[] = []
    const flushLine = () => {
      const joined = currentParts
        .join(' ')
        .replace(/\s{4,}/g, '   ')
        .trim()
      if (joined) lines.push(joined)
      currentParts = []
    }

    // Walk text operators and line-break/positioning commands in order
    const opRegex =
      /\(((?:\\.|[^\\()])*)\)\s*Tj|\[([\s\S]*?)\]\s*TJ|<([0-9A-Fa-f\s]+)>\s*Tj|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+T[dD]\b|\bT\*|\r?\n/g
    let opMatch: RegExpExecArray | null
    while ((opMatch = opRegex.exec(block)) !== null) {
      if (opMatch[1] !== undefined) {
        const s = decodePdfLiteralString(opMatch[1]).trim()
        if (s) currentParts.push(s)
      } else if (opMatch[2] !== undefined) {
        const inner = opMatch[2]
        const segParts: string[] = []
        const segRegex = /\(((?:\\.|[^\\()])*)\)|<([0-9A-Fa-f\s]+)>/g
        let seg: RegExpExecArray | null
        while ((seg = segRegex.exec(inner)) !== null) {
          if (seg[1] !== undefined) segParts.push(decodePdfLiteralString(seg[1]))
          else if (seg[2] !== undefined) segParts.push(decodePdfHexString(seg[2]))
        }
        const joinedSeg = segParts.join('').trim()
        if (joinedSeg) currentParts.push(joinedSeg)
      } else if (opMatch[3] !== undefined) {
        const s = decodePdfHexString(opMatch[3]).trim()
        if (s) currentParts.push(s)
      } else if (opMatch[4] !== undefined && opMatch[5] !== undefined) {
        const dy = Number(opMatch[5])
        if (dy !== 0) {
          flushLine()
        } else if (currentParts.length > 0) {
          // Horizontal column jump on same row -> preserve multi-space separator for table parsing
          currentParts.push('  ')
        }
      } else {
        // T* or newline
        flushLine()
      }
    }
    flushLine()
  }
  return lines
}

export type ParsedPdfBrochure = {
  pages: Array<{ pageNumber: number; lines: string[] }>
  fullText: string
  extracted: ExtractedVehicleRaw
}

export function extractFromPdfBuffer(
  buffer: Buffer,
  filename: string,
  sourceUrl?: string,
): ParsedPdfBrochure {
  const latin = buffer.toString('latin1')
  const pages: Array<{ pageNumber: number; lines: string[] }> = []

  const streamRegex = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)endstream/g
  let streamMatch: RegExpExecArray | null
  let pageCounter = 0

  while ((streamMatch = streamRegex.exec(latin)) !== null && pageCounter < 120) {
    const dict = streamMatch[1] ?? ''
    const rawStreamStr = streamMatch[2] ?? ''
    let decodedStream = rawStreamStr

    if (/\/FlateDecode\b/.test(dict)) {
      const startOffset =
        streamMatch.index +
        streamMatch[0].indexOf('stream') +
        (streamMatch[0].includes('stream\r\n') ? 8 : 7)
      const endOffset = streamMatch.index + streamMatch[0].lastIndexOf('endstream')
      const compressed = buffer.subarray(startOffset, endOffset)
      try {
        decodedStream = zlib.inflateSync(compressed).toString('latin1')
      } catch {
        try {
          decodedStream = zlib.inflateRawSync(compressed).toString('latin1')
        } catch {
          continue
        }
      }
    }

    const lines = extractTextOperatorsFromStream(decodedStream)
    if (lines.length > 0) {
      pageCounter += 1
      pages.push({ pageNumber: pageCounter, lines })
    }
  }

  // Fallback: handle uncompressed UTF-8 text blocks inside simple/test PDFs
  if (pages.length === 0) {
    const utf8Text = buffer.toString('utf8')
    const directLines = extractTextOperatorsFromStream(utf8Text)
    if (directLines.length > 0) {
      pages.push({ pageNumber: 1, lines: directLines })
    }
  }

  const fullText = pages.map((p) => `[Trang ${p.pageNumber}]\n${p.lines.join('\n')}`).join('\n\n')
  const specifications: ExtractedSpecItem[] = []
  const features: ExtractedFeatureItem[] = []
  const uncertaintyFlags: UncertaintyFlag[] = []
  const warnings: string[] = []

  if (pages.length === 0 || fullText.trim().length < 20) {
    warnings.push(
      'PDF không có lớp văn bản có thể trích xuất (có thể là brochure scan ảnh). Cần kiểm tra và nhập bổ sung thủ công.',
    )
    uncertaintyFlags.push({
      field: 'pdfTextLayer',
      reason: 'Không đọc được lớp text/bảng thông số từ PDF; cần xác minh thủ công.',
      severity: 'REVIEW',
      pageRef: 1,
    })
  }

  let detectedName = filename
    .replace(/\.pdf$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  let detectedYear: number | undefined
  let detectedMsrp: number | undefined

  const brandCandidates = [
    'Toyota',
    'Honda',
    'Ford',
    'Mitsubishi',
    'Mazda',
    'Hyundai',
    'Mercedes-Benz',
    'VinFast',
    'Yamaha',
    'Kawasaki',
  ]
  let detectedBrand: string | undefined

  for (const page of pages) {
    for (const line of page.lines) {
      const cleanLine = stripHtmlAndXss(line, 400)
      if (!cleanLine) continue

      if (!detectedBrand) {
        const foundBrand = brandCandidates.find((b) =>
          cleanLine.toLowerCase().includes(b.toLowerCase()),
        )
        if (foundBrand) detectedBrand = foundBrand
      }
      if (!detectedYear) {
        const yrMatch = cleanLine.match(/\b(202[0-9]|203[0-5])\b/)
        if (yrMatch) detectedYear = Number(yrMatch[1])
      }
      if (!detectedMsrp) {
        const priceMatch = cleanLine.match(
          /(?:(?:giá|gia)(?:\s+(?:niêm\s+yết|niem\s+yet|bán|ban|tham\s+khảo|tham\s+khao))?|msrp)\s*[:\-]?\s*([\d.,]{3,15})\s*(?:triệu|trieu|tr|vnđ|vnd|đ)?/i,
        )
        if (priceMatch?.[1]) {
          const digits = Number(priceMatch[1].replace(/[.,]/g, ''))
          if (Number.isFinite(digits)) {
            if (/(?:triệu|trieu|tr)\b/i.test(priceMatch[0]) && digits < 100_000) {
              detectedMsrp = digits * 1_000_000
            } else if (digits >= 10_000_000) {
              detectedMsrp = digits
            }
          }
        }
      }

      // Spec row pattern: "Label: Value" or "Label | Value" or "Label   Value"
      const kvMatch =
        cleanLine.match(/^([^:|]{2,70})\s*[:|]\s*(.{1,180})$/) ??
        cleanLine.match(/^([^\t]{2,60}?)\s{3,}(.{1,160})$/)
      if (kvMatch) {
        const label = kvMatch[1]!.trim()
        const value = kvMatch[2]!.trim()
        const isAmbiguous =
          /\?|tùy chọn|tham khảo|dự kiến|~|approx|tbd/i.test(value) || value.length < 2
        specifications.push({
          group: classifySpecGroup(label),
          label,
          value,
          source: `${filename} (Trang ${page.pageNumber})`,
          confidence: isAmbiguous ? 'LOW' : 'MEDIUM',
          pageRef: page.pageNumber,
          evidenceSnippet: cleanLine.slice(0, 180),
        })
        if (isAmbiguous) {
          uncertaintyFlags.push({
            field: `spec:${label}`,
            reason: `Giá trị từ brochure cần đối chiếu lại ("${value}")`,
            severity: 'REVIEW',
            pageRef: page.pageNumber,
            snippet: cleanLine.slice(0, 160),
          })
        }
      } else if (/trang bị|an toàn|túi khí|camera|phanh|abs|adas|cảm biến/i.test(cleanLine)) {
        features.push({
          name: cleanLine.slice(0, 130),
          category: /an toàn|túi khí|abs|phanh/i.test(cleanLine)
            ? 'SAFETY'
            : /adas|cảm biến|camera|hỗ trợ/i.test(cleanLine)
              ? 'DRIVER_ASSIST'
              : 'COMFORT',
          status: 'UNVERIFIED',
          variantNote: `Brochure trang ${page.pageNumber}`,
        })
      }
    }
  }

  if (pages[0]?.lines[0] && pages[0].lines[0].length <= 100) {
    detectedName = stripHtmlAndXss(pages[0].lines[0], 110) || detectedName
  }

  if (specifications.length === 0 && pages.length > 0) {
    warnings.push('Không phát hiện bảng thông số dạng "Nhãn: Giá trị" rõ ràng trong PDF.')
    uncertaintyFlags.push({
      field: 'specifications',
      reason: 'Brochure có văn bản nhưng không tách được cặp thông số chuẩn; cần rà soát.',
      severity: 'WARN',
      pageRef: 1,
    })
  }

  return {
    pages,
    fullText,
    extracted: {
      brand: detectedBrand,
      name: detectedName,
      officialName: detectedName,
      modelYear: detectedYear,
      market: 'VN',
      listedPrice: detectedMsrp,
      msrpReferenceVnd: detectedMsrp,
      specifications: specifications.slice(0, 80),
      features: features.slice(0, 40),
      sourceUrl: sourceUrl ?? `pdf://${filename}`,
      sourceLabel: `Brochure PDF chính thức: ${filename}`,
      sourceType: 'PDF_BROCHURE',
      warnings,
      uncertaintyFlags,
    },
  }
}

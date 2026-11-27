import type { Payload } from 'payload'
import { sanitizeUntrustedCmsText, stripVietnameseAccents } from './guardrails.ts'
import type { AIPolicyCitation } from './types.ts'

export type KnowledgeChunk = {
  id: string
  title: string
  sourceType: 'POLICY' | 'FAQ' | 'POST' | 'CONTACT' | 'BRANCH'
  href: string
  content: string
  tags: string[]
}

const DEFAULT_PUBLISHED_NORI_RULES: KnowledgeChunk[] = [
  {
    id: 'core-rental-duration',
    title: 'Thời gian thuê & quy tắc tính ngày tại NORI',
    sourceType: 'POLICY',
    href: '/support#conditions',
    tags: ['thoi gian', 'ngay thue', 'ngay tra', 'bao lau', 'mui gio', 'dieu kien'],
    content:
      'Mỗi đơn thuê kéo dài từ 1 đến 30 ngày nguyên theo múi giờ Việt Nam (Asia/Ho_Chi_Minh). Khoảng thời gian thuê tính theo [ngày nhận, ngày trả) (không tính ngày trả vào tiền thuê). Có thể đặt xe trước tối đa 90 ngày.',
  },
  {
    id: 'core-booking-cancel',
    title: 'Quy trình xác nhận & hủy đơn thuê xe',
    sourceType: 'POLICY',
    href: '/support#questions',
    tags: ['huy don', 'xac nhan', 'hoan tien', 'dat xe', 'chinh sua', 'cho xac nhan'],
    content:
      'Đơn mới tạo ở trạng thái Chờ xác nhận (PENDING) và giữ lịch xe nguyên tử. Khách có thể tự chỉnh sửa đơn PENDING hoặc tự hủy miễn phí khi đơn ở trạng thái Chờ xác nhận hoặc Chờ đặt cọc tại mục Đơn thuê của tôi (/my-bookings). Khi đơn đã xác nhận hoặc đang thuê, cần liên hệ NORI trước giờ nhận tối thiểu 24 giờ.',
  },
  {
    id: 'core-pricing-discount',
    title: 'Chính sách chiết khấu dài ngày, phụ phí & dịch vụ bổ sung',
    sourceType: 'POLICY',
    href: '/support#conditions',
    tags: [
      'gia thue',
      'chiet khau',
      'tuan',
      'thang',
      'cuoi tuan',
      'ngay le',
      'bao hiem',
      'phu phi',
    ],
    content:
      'NORI áp dụng chiết khấu 5% cho đơn từ 7 ngày và 12% cho đơn từ 30 ngày (hoặc gói giá tuần/tháng ưu đãi hơn). Đơn qua Thứ 7/Chủ Nhật hoặc ngày lễ Việt Nam có thể áp dụng phụ phí theo cấu hình từng xe. Dịch vụ bổ sung gồm Gói bảo vệ mở rộng (90.000đ/ngày), Ghế trẻ em (100.000đ), Bộ 2 mũ bảo hiểm & áo mưa (40.000đ), Camera hành trình (50.000đ).',
  },
  {
    id: 'core-catalogue-vs-actual',
    title: 'Phân biệt Catalogue dòng xe và cá thể xe thực tế',
    sourceType: 'POLICY',
    href: '/support#questions',
    tags: ['catalogue', 'xe thuc te', 'anh', 'demo', 'odo'],
    content:
      'Ảnh Catalogue chỉ minh họa dòng xe. Mỗi cá thể xe thực tế có mã quản lý, phiên bản, ODO, giá thuê, tình trạng vận hành và ảnh riêng. Các xe phục vụ kiểm thử/minh họa được gắn nhãn DEMO rõ ràng.',
  },
]

function tokenizeVi(input: string): string[] {
  return stripVietnameseAccents(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2)
}

function scoreChunk(chunk: KnowledgeChunk, queryTokens: string[], topic: string): number {
  const titleNorm = stripVietnameseAccents(chunk.title).toLowerCase()
  const contentNorm = stripVietnameseAccents(chunk.content).toLowerCase()
  const tagsNorm = chunk.tags.map((t) => stripVietnameseAccents(t).toLowerCase())

  let score = 0
  if (topic && topic !== 'ALL') {
    const topicMap: Record<string, string[]> = {
      CONDITIONS: ['dieu kien', 'do tuoi', 'giay phep', 'thoi gian'],
      DEPOSIT: ['dat coc', 'coc', 'nhien lieu'],
      CANCELLATION: ['huy don', 'doi lich', 'huy'],
      REFUND: ['hoan tien', 'hoan coc'],
      INSURANCE: ['bao hiem', 'bao ve', 'su co'],
      HANDOVER: ['giao nhan', 'nhan xe', 'tra xe', 'dia diem', 'chi nhanh'],
      PRIVACY: ['bao mat', 'rieng tu', 'du lieu'],
      TERMS: ['dieu khoan', 'su dung'],
      FAQ: ['faq', 'cau hoi'],
      CONTACT: ['lien he', 'hotline', 'email', 'dia chi', 'gio lam viec'],
    }
    const hints = topicMap[topic] ?? []
    for (const h of hints) {
      if (titleNorm.includes(h) || tagsNorm.some((t) => t.includes(h))) score += 6
      else if (contentNorm.includes(h)) score += 3
    }
  }

  for (const tok of queryTokens) {
    if (titleNorm.includes(tok)) score += 4
    if (tagsNorm.some((t) => t.includes(tok))) score += 3.5
    if (contentNorm.includes(tok)) score += 1.5
  }

  return score
}

/**
 * Queries LIVE published CMS sources (nori-site, published posts, active branches)
 * so any Admin edit is immediately visible to AI without stale hardcoded copies.
 * Strictly ignores drafts, hidden documents, and internal operational records.
 */
export async function retrieveNoriKnowledge(
  payload: Payload,
  params: {
    query: string
    topic?: string
    knowledgeNote?: string | null
    limit?: number
  },
): Promise<{
  chunks: KnowledgeChunk[]
  citations: AIPolicyCitation[]
  contactInfo: {
    phone: string
    email: string
    address: string
    openingHours: string
  }
}> {
  const [site, postsRes, branchesRes] = await Promise.all([
    payload
      .findGlobal({
        slug: 'nori-site',
        overrideAccess: false,
        draft: false,
        depth: 0,
      })
      .catch(() => null),
    payload
      .find({
        collection: 'posts',
        overrideAccess: false,
        draft: false,
        depth: 0,
        limit: 30,
        where: { _status: { equals: 'published' } },
        sort: '-publishedAt',
        select: { title: true, slug: true, category: true, excerpt: true, content: true },
      })
      .catch(() => ({ docs: [] })),
    payload
      .find({
        collection: 'branches',
        overrideAccess: true,
        depth: 0,
        limit: 20,
        where: { status: { equals: 'ACTIVE' } },
        select: {
          name: true,
          address: true,
          province: true,
          hotline: true,
          operatingHoursLabel: true,
        },
      })
      .catch(() => ({ docs: [] })),
  ])

  const chunks: KnowledgeChunk[] = [...DEFAULT_PUBLISHED_NORI_RULES]

  const contactInfo = {
    phone: sanitizeUntrustedCmsText(site?.phone, 80) || 'Chưa cập nhật',
    email: sanitizeUntrustedCmsText(site?.email, 120) || 'Chưa cập nhật',
    address: sanitizeUntrustedCmsText(site?.address, 240) || 'Chưa cập nhật',
    openingHours: sanitizeUntrustedCmsText(site?.openingHours, 160) || 'Chưa cập nhật',
  }

  if (site) {
    const policyPairs: Array<{
      id: string
      title: string
      value: string | null | undefined
      href: string
      tags: string[]
    }> = [
      {
        id: 'cms-rental-policy',
        title: 'Chính sách thuê xe chính thức',
        value: site.rentalPolicySummary,
        href: '/support#conditions',
        tags: ['chinh sach thue', 'thue xe', 'dieu kien'],
      },
      {
        id: 'cms-purchase-policy',
        title: 'Chính sách tư vấn & mua xe',
        value: site.purchasePolicySummary,
        href: '/support#conditions',
        tags: ['mua xe', 'lai thu', 'tu van mua'],
      },
      {
        id: 'cms-age-license',
        title: 'Yêu cầu độ tuổi & giấy phép lái xe',
        value: [site.ageRequirement, site.licenseRequirement].filter(Boolean).join('. '),
        href: '/support#conditions',
        tags: ['do tuoi', 'bang lai', 'giay phep lai xe', 'cccd', 'giay to', 'dieu kien'],
      },
      {
        id: 'cms-deposit-policy',
        title: 'Quy định đặt cọc & nhiên liệu/pin',
        value: site.depositPolicy,
        href: '/support#conditions',
        tags: ['dat coc', 'tien coc', 'nhien lieu', 'pin', 'hoan coc'],
      },
      {
        id: 'cms-cancellation-policy',
        title: 'Chính sách hủy đơn & đổi lịch',
        value: site.cancellationPolicy,
        href: '/support#conditions',
        tags: ['huy don', 'doi lich', 'hoan coc', 'huy'],
      },
      {
        id: 'cms-refund-policy',
        title: 'Chính sách hoàn tiền & thanh toán trực tuyến',
        value: [site.refundPolicySummary, site.paymentInstructionNote].filter(Boolean).join(' '),
        href: '/support#conditions',
        tags: ['hoan tien', 'thanh toan', 'vietqr', 'chuyen khoan'],
      },
      {
        id: 'cms-privacy-policy',
        title: 'Chính sách bảo mật thông tin khách hàng',
        value: site.privacyPolicy,
        href: '/support#privacy',
        tags: ['bao mat', 'rieng tu', 'du lieu ca nhan'],
      },
      {
        id: 'cms-terms-of-use',
        title: 'Điều khoản sử dụng NORI',
        value: site.termsOfUse,
        href: '/support#conditions',
        tags: ['dieu khoan', 'quy dinh'],
      },
      {
        id: 'cms-about',
        title: 'Giới thiệu về NORI Vehicle Rental',
        value: site.aboutSummary,
        href: '/about',
        tags: ['gioi thieu', 'nori', 've chung toi'],
      },
    ]

    for (const p of policyPairs) {
      const clean = sanitizeUntrustedCmsText(p.value, 1400)
      if (!clean) continue
      chunks.push({
        id: p.id,
        title: p.title,
        sourceType: 'POLICY',
        href: p.href,
        content: clean,
        tags: p.tags,
      })
    }

    // Contact chunk
    const contactText = [
      `Hotline: ${contactInfo.phone}`,
      `Email hỗ trợ: ${contactInfo.email}`,
      `Địa chỉ nhận/trả xe: ${contactInfo.address}`,
      `Giờ làm việc: ${contactInfo.openingHours}`,
      site.contactNote ? sanitizeUntrustedCmsText(site.contactNote, 400) : '',
    ]
      .filter(Boolean)
      .join(' | ')
    chunks.push({
      id: 'cms-contact',
      title: 'Thông tin liên hệ chính thức của NORI',
      sourceType: 'CONTACT',
      href: '/support',
      content: contactText,
      tags: ['lien he', 'hotline', 'sdt', 'so dien thoai', 'email', 'dia chi', 'gio lam viec'],
    })

    // Published FAQs from NoriSite
    for (const [idx, faq] of (site.faqs ?? []).entries()) {
      const q = sanitizeUntrustedCmsText(faq.question, 220)
      const a = sanitizeUntrustedCmsText(faq.answer, 900)
      if (!q || !a) continue
      chunks.push({
        id: `cms-faq-${idx}`,
        title: q,
        sourceType: 'FAQ',
        href: '/support#questions',
        content: a,
        tags: ['faq', 'cau hoi thuong gap'],
      })
    }
  }

  // Admin-approved supplementary knowledge note from AISettings (sanitized)
  if (params.knowledgeNote) {
    const cleanNote = sanitizeUntrustedCmsText(params.knowledgeNote, 1200)
    if (cleanNote) {
      chunks.push({
        id: 'ai-approved-note',
        title: 'Thông tin hướng dẫn bổ sung đã phê duyệt bởi NORI',
        sourceType: 'POLICY',
        href: '/support',
        content: cleanNote,
        tags: ['huong dan', 'chinh sach', 'giao nhan', 'ho tro'],
      })
    }
  }

  // Published CMS Posts
  for (const post of postsRes.docs) {
    const title = sanitizeUntrustedCmsText(post.title, 200)
    const body = sanitizeUntrustedCmsText(post.excerpt || post.content, 900)
    if (!title || !body) continue
    const slug = String(post.slug ?? post.id)
    chunks.push({
      id: `post-${post.id}`,
      title,
      sourceType: 'POST',
      href: `/posts/${slug}`,
      content: body,
      tags: ['bai viet', 'cam nang', String(post.category ?? 'NEWS').toLowerCase()],
    })
  }

  // Active Branches (public info only)
  if (branchesRes.docs.length > 0) {
    const branchSummary = branchesRes.docs
      .map((b) => {
        const rec = b as unknown as Record<string, unknown>
        return `${sanitizeUntrustedCmsText(String(rec.name ?? ''), 80)}: ${sanitizeUntrustedCmsText(String(rec.address ?? ''), 160)}${rec.hotline ? ` (Hotline: ${sanitizeUntrustedCmsText(String(rec.hotline), 30)})` : ''}`
      })
      .join('; ')
    chunks.push({
      id: 'active-branches',
      title: 'Danh sách chi nhánh & điểm giao nhận đang hoạt động',
      sourceType: 'BRANCH',
      href: '/support',
      content: branchSummary,
      tags: ['chi nhanh', 'dia diem', 'giao nhan', 'nhan xe', 'tra xe'],
    })
  }

  const queryTokens = tokenizeVi(params.query)
  const topic = (params.topic ?? 'ALL').toUpperCase()

  const scored = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, topic) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const limit = Math.max(1, Math.min(8, params.limit ?? 5))
  const topChunks = scored.slice(0, limit).map((s) => s.chunk)

  const citations: AIPolicyCitation[] = topChunks.map((c) => ({
    title: c.title,
    sourceType: c.sourceType,
    href: c.href,
    excerpt: c.content.slice(0, 220),
  }))

  return {
    chunks: topChunks,
    citations,
    contactInfo,
  }
}

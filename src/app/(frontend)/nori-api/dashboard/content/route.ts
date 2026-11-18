import { adminHasPermission } from '@/access/nori'
import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { clampFocalPercent, photo } from '@/lib/catalogue'
import { invalidateNoriCaches } from '@/lib/public-cache'
import { validateTimeString } from '@/lib/rental-rules'

function extractRelationId(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : id != null ? String(id) : null
  }
  return null
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//')
  return /^https?:\/\//i.test(trimmed)
}

function mapHeroSlidesForAdmin(rawSlides: unknown) {
  if (!Array.isArray(rawSlides)) return []
  return rawSlides.map((raw, idx) => {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const dImg = photo(s.desktopImage as never)
    const mImg = photo(s.mobileImage as never)
    const desktopImageId = extractRelationId(s.desktopImage)
    const mobileImageId = extractRelationId(s.mobileImage)
    const relatedModelId = extractRelationId(s.relatedModel)
    const focalX = clampFocalPercent(s.focalX, dImg?.focalX ?? 50)
    const focalY = clampFocalPercent(s.focalY, dImg?.focalY ?? 50)
    const mobileFocalX = clampFocalPercent(s.mobileFocalX, mImg ? (mImg.focalX ?? 50) : focalX)
    const mobileFocalY = clampFocalPercent(s.mobileFocalY, mImg ? (mImg.focalY ?? 50) : focalY)

    return {
      id: typeof s.id === 'string' && s.id ? s.id : `slide-${idx}`,
      titleFirst: typeof s.titleFirst === 'string' ? s.titleFirst : '',
      titleSecond: typeof s.titleSecond === 'string' ? s.titleSecond : '',
      eyebrow: typeof s.eyebrow === 'string' ? s.eyebrow : '',
      categoryBadge: typeof s.categoryBadge === 'string' ? s.categoryBadge : '',
      description: typeof s.description === 'string' ? s.description : '',
      ctaText: typeof s.ctaText === 'string' && s.ctaText ? s.ctaText : 'Khám phá ngay',
      ctaHref: typeof s.ctaHref === 'string' && s.ctaHref ? s.ctaHref : '/vehicles',
      secondaryText: typeof s.secondaryText === 'string' ? s.secondaryText : '',
      secondaryHref: typeof s.secondaryHref === 'string' ? s.secondaryHref : '',
      desktopImageId,
      desktopImage: dImg,
      mobileImageId,
      mobileImage: mImg,
      focalX,
      focalY,
      mobileFocalX,
      mobileFocalY,
      relatedCategory: typeof s.relatedCategory === 'string' ? s.relatedCategory : '',
      relatedModelId,
      credit: typeof s.credit === 'string' ? s.credit : '',
      sourceUrl: typeof s.sourceUrl === 'string' ? s.sourceUrl : '',
      durationSeconds: typeof s.durationSeconds === 'number' ? s.durationSeconds : null,
      order: typeof s.order === 'number' ? s.order : idx,
      active: s.active !== false,
    }
  })
}

function stableHeroComparisonKey(slides: ReturnType<typeof mapHeroSlidesForAdmin>): string {
  return JSON.stringify(
    slides.map((s) => ({
      titleFirst: s.titleFirst,
      titleSecond: s.titleSecond,
      eyebrow: s.eyebrow,
      categoryBadge: s.categoryBadge,
      description: s.description,
      ctaText: s.ctaText,
      ctaHref: s.ctaHref,
      secondaryText: s.secondaryText,
      secondaryHref: s.secondaryHref,
      desktopImageId: s.desktopImageId,
      mobileImageId: s.mobileImageId,
      focalX: s.focalX,
      focalY: s.focalY,
      mobileFocalX: s.mobileFocalX,
      mobileFocalY: s.mobileFocalY,
      relatedCategory: s.relatedCategory,
      relatedModelId: s.relatedModelId,
      credit: s.credit,
      sourceUrl: s.sourceUrl,
      durationSeconds: s.durationSeconds,
      order: s.order,
      active: s.active,
    })),
  )
}

function validateAndNormalizeSlide(
  raw: Record<string, unknown>,
  idx: number,
  options: { requireDesktopImage: boolean },
) {
  const slideLabel = `Slide #${idx + 1}`
  const titleFirst = text(raw.titleFirst, 120)
  if (!titleFirst) {
    return { ok: false as const, error: `${slideLabel}: Tiêu đề dòng 1 là bắt buộc.` }
  }
  const ctaText = text(raw.ctaText, 60)
  if (!ctaText) {
    return { ok: false as const, error: `${slideLabel}: Nhãn nút CTA chính là bắt buộc.` }
  }
  const ctaHref = text(raw.ctaHref, 200)
  if (!ctaHref || !isSafeHref(ctaHref)) {
    return {
      ok: false as const,
      error: `${slideLabel}: Đường dẫn CTA phải bắt đầu bằng "/" hoặc "https://".`,
    }
  }
  const secondaryHref = text(raw.secondaryHref, 200)
  if (secondaryHref && !isSafeHref(secondaryHref)) {
    return {
      ok: false as const,
      error: `${slideLabel}: Đường dẫn nút phụ phải bắt đầu bằng "/" hoặc "https://".`,
    }
  }
  const desktopImageId = text(raw.desktopImageId, 100) || null
  const mobileImageId = text(raw.mobileImageId, 100) || null
  const active = raw.active !== false

  if (options.requireDesktopImage && active && !desktopImageId) {
    return {
      ok: false as const,
      error: `${slideLabel}: Ảnh nền Desktop là bắt buộc khi slide đang bật hiển thị.`,
    }
  }

  const cat = text(raw.relatedCategory, 20)
  const dur =
    raw.durationSeconds !== undefined && raw.durationSeconds !== null && raw.durationSeconds !== ''
      ? Math.min(30, Math.max(3, Math.round(Number(raw.durationSeconds) || 6)))
      : null

  const existingId =
    typeof raw.id === 'string' && /^[a-z0-9_-]{4,64}$/i.test(raw.id) ? raw.id : undefined

  return {
    ok: true as const,
    slide: {
      ...(existingId ? { id: existingId } : {}),
      titleFirst,
      titleSecond: text(raw.titleSecond, 120) || undefined,
      eyebrow: text(raw.eyebrow, 120) || undefined,
      categoryBadge: text(raw.categoryBadge, 80) || undefined,
      description: text(raw.description, 600) || undefined,
      ctaText,
      ctaHref,
      secondaryText: text(raw.secondaryText, 60) || undefined,
      secondaryHref: secondaryHref || undefined,
      desktopImage: desktopImageId,
      mobileImage: mobileImageId,
      focalX: clampFocalPercent(Number(raw.focalX), 50),
      focalY: clampFocalPercent(Number(raw.focalY), 50),
      mobileFocalX: clampFocalPercent(Number(raw.mobileFocalX), 50),
      mobileFocalY: clampFocalPercent(Number(raw.mobileFocalY), 50),
      relatedCategory:
        cat === 'CAR' || cat === 'MOTORBIKE' || cat === 'PICKUP'
          ? (cat as 'CAR' | 'MOTORBIKE' | 'PICKUP')
          : null,
      relatedModel: text(raw.relatedModelId, 100) || null,
      credit: text(raw.credit, 200) || undefined,
      sourceUrl: text(raw.sourceUrl, 300) || undefined,
      durationSeconds: dur,
      order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : idx,
      active,
    },
  }
}

async function verifyMediaIdsExist(
  payload: Awaited<ReturnType<typeof requireAdmin>> extends infer R
    ? R extends { ok: true; payload: infer P }
      ? P
      : never
    : never,
  mediaIds: (string | null | undefined)[],
): Promise<string | null> {
  const uniqueIds = [...new Set(mediaIds.filter((id): id is string => Boolean(id)))]
  if (uniqueIds.length === 0) return null
  const found = await payload.find({
    collection: 'media',
    where: { id: { in: uniqueIds } },
    limit: uniqueIds.length,
    depth: 0,
    overrideAccess: true,
  })
  const foundSet = new Set(found.docs.map((d) => String(d.id)))
  const missing = uniqueIds.find((id) => !foundSet.has(id))
  return missing ? `Không tìm thấy tệp ảnh (${missing}) trong Thư viện Media.` : null
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['content', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const draft = new URL(request.url).searchParams.get('draft') !== 'false'
    const [site, publishedSite, versions, modelsRes] = await Promise.all([
      payload.findGlobal({
        slug: 'nori-site',
        user,
        overrideAccess: false,
        draft,
        depth: 1,
      }),
      payload.findGlobal({
        slug: 'nori-site',
        user,
        overrideAccess: false,
        draft: false,
        depth: 1,
      }),
      payload.findGlobalVersions({
        slug: 'nori-site',
        user,
        overrideAccess: false,
        limit: 10,
        sort: '-updatedAt',
      }),
      payload.find({
        collection: 'vehicle-models',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 200,
        sort: 'sortOrder',
      }),
    ])

    const draftSlides = mapHeroSlidesForAdmin(site.heroSlides ?? [])
    const publishedSlides = mapHeroSlidesForAdmin(publishedSite.heroSlides ?? [])
    const hasPublishedVersion =
      publishedSite._status === 'published' ||
      versions.docs.some((v) => v.version?._status === 'published')
    const hasUnpublishedChanges =
      site._status === 'draft' ||
      stableHeroComparisonKey(draftSlides) !== stableHeroComparisonKey(publishedSlides) ||
      (site.heroAutoplaySeconds ?? 6) !== (publishedSite.heroAutoplaySeconds ?? 6) ||
      (site.showHeroSection !== false) !== (publishedSite.showHeroSection !== false)

    const latestPublishedVersion = versions.docs.find((v) => v.version?._status === 'published')

    return json({
      _status: site._status ?? 'published',
      hasPublishedVersion,
      hasUnpublishedChanges,
      publishedAt: latestPublishedVersion?.updatedAt ?? publishedSite.updatedAt ?? null,
      siteName: site.siteName ?? 'NORI',
      tagline: site.tagline ?? 'Your way. Every day.',
      logoId: extractRelationId(site.logo),
      logo: photo(site.logo),
      faviconId: extractRelationId(site.favicon),
      favicon: photo(site.favicon),
      seoTitle: site.seoTitle ?? '',
      seoDescription: site.seoDescription ?? '',
      ogImageId: extractRelationId(site.ogImage),
      ogImage: photo(site.ogImage),
      heroAutoplaySeconds: site.heroAutoplaySeconds ?? 6,
      heroSlides: draftSlides,
      heroImages: (site.heroImages ?? []).flatMap((h) => {
        const img = photo(h.image)
        const imageId = extractRelationId(h.image)
        return img && imageId ? [{ imageId, credit: h.credit ?? '', image: img }] : []
      }),
      storyImageId: extractRelationId(site.storyImage),
      storyImage: photo(site.storyImage),
      homeIntroTitle: site.homeIntroTitle ?? '',
      homeIntroDescription: site.homeIntroDescription ?? '',
      showHeroSection: site.showHeroSection !== false,
      showBenefitsSection: site.showBenefitsSection !== false,
      showFeaturedSection: site.showFeaturedSection !== false,
      showHowItWorksSection: site.showHowItWorksSection !== false,
      showStorySection: site.showStorySection !== false,
      showCtaSection: site.showCtaSection !== false,
      headerMenu: (site.headerMenu ?? []).map((m) => ({
        label: m.label,
        href: m.href,
        visible: m.visible !== false,
      })),
      footerLinks: (site.footerLinks ?? []).map((f) => ({
        label: f.label,
        href: f.href,
        group: f.group ?? 'Khám phá',
      })),
      socialLinks: (site.socialLinks ?? []).map((s) => ({
        platform: s.platform,
        url: s.url,
      })),
      aboutSummary: site.aboutSummary ?? '',
      address: site.address ?? '',
      phone: site.phone ?? '',
      email: site.email ?? '',
      openingHours: site.openingHours ?? '',
      businessTimezone: site.businessTimezone ?? 'Asia/Ho_Chi_Minh',
      workingDays: site.workingDays ?? '1,2,3,4,5',
      workStartTime: site.workStartTime ?? '',
      workEndTime: site.workEndTime ?? '',
      lunchBreakStart: site.lunchBreakStart ?? '',
      lunchBreakEnd: site.lunchBreakEnd ?? '',
      holidays: (site.holidays ?? []).map((h) => ({
        date: h.date,
        name: h.name,
      })),
      contactNote: site.contactNote ?? '',
      rentalPolicySummary: site.rentalPolicySummary ?? '',
      purchasePolicySummary: site.purchasePolicySummary ?? '',
      ageRequirement: site.ageRequirement ?? '',
      licenseRequirement: site.licenseRequirement ?? '',
      cancellationPolicy: site.cancellationPolicy ?? '',
      depositPolicy: site.depositPolicy ?? '',
      privacyPolicy: site.privacyPolicy ?? '',
      termsOfUse: site.termsOfUse ?? '',
      faqs: (site.faqs ?? []).map((f) => ({
        question: f.question,
        answer: f.answer,
        order: f.order ?? 0,
      })),
      depositHoldHours: site.depositHoldHours ?? 24,
      maxPendingBookings: site.maxPendingBookings ?? 5,
      maintenanceBannerEnabled: Boolean(site.maintenanceBannerEnabled),
      maintenanceBannerText: site.maintenanceBannerText ?? '',
      availableModels: modelsRes.docs.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        category: m.category,
      })),
      versions: versions.docs.map((v) => ({
        id: String(v.id),
        updatedAt: v.updatedAt,
        status: v.version?._status ?? 'draft',
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['content', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(
      request,
      [
        'action',
        'slideIndex',
        'slideId',
        'slide',
        'restoreVersionId',
        '_status',
        'siteName',
        'tagline',
        'logoId',
        'faviconId',
        'seoTitle',
        'seoDescription',
        'ogImageId',
        'heroAutoplaySeconds',
        'heroSlides',
        'heroImages',
        'storyImageId',
        'homeIntroTitle',
        'homeIntroDescription',
        'showHeroSection',
        'showBenefitsSection',
        'showFeaturedSection',
        'showHowItWorksSection',
        'showStorySection',
        'showCtaSection',
        'headerMenu',
        'footerLinks',
        'socialLinks',
        'aboutSummary',
        'address',
        'phone',
        'email',
        'openingHours',
        'businessTimezone',
        'workingDays',
        'workStartTime',
        'workEndTime',
        'lunchBreakStart',
        'lunchBreakEnd',
        'holidays',
        'contactNote',
        'rentalPolicySummary',
        'purchasePolicySummary',
        'ageRequirement',
        'licenseRequirement',
        'cancellationPolicy',
        'depositPolicy',
        'privacyPolicy',
        'termsOfUse',
        'faqs',
        'depositHoldHours',
        'maxPendingBookings',
        'maintenanceBannerEnabled',
        'maintenanceBannerText',
      ],
      262_144,
    )

    if (data.restoreVersionId) {
      if (!adminHasPermission(auth.admin, 'content', 'publish')) {
        return fail(
          'Tài khoản chưa được cấp quyền "publish" cho phân hệ "content".',
          403,
          'FORBIDDEN',
        )
      }
      await payload.restoreGlobalVersion({
        slug: 'nori-site',
        id: text(data.restoreVersionId, 100),
        user,
        overrideAccess: false,
      })
      invalidateNoriCaches({ slugs: [], allDetails: false })
      return json({ restored: true, revalidated: true })
    }

    // Per-slide save (writes to draft without publishing or clobbering other unsaved slides)
    if (data.action === 'save_slide') {
      if (!data.slide || typeof data.slide !== 'object' || Array.isArray(data.slide)) {
        return fail('Dữ liệu Hero Slide cần lưu không hợp lệ.')
      }
      const rawSlide = data.slide as Record<string, unknown>
      const requestedIndex =
        typeof data.slideIndex === 'number' && Number.isInteger(data.slideIndex)
          ? data.slideIndex
          : 0
      const requestedId = text(data.slideId, 100) || text(rawSlide.id, 100)

      const validated = validateAndNormalizeSlide(rawSlide, Math.max(0, requestedIndex), {
        requireDesktopImage: true,
      })
      if (!validated.ok) return fail(validated.error)

      const mediaErr = await verifyMediaIdsExist(payload, [
        validated.slide.desktopImage,
        validated.slide.mobileImage,
      ])
      if (mediaErr) return fail(mediaErr)

      const currentDraft = await payload.findGlobal({
        slug: 'nori-site',
        user,
        overrideAccess: false,
        draft: true,
        depth: 0,
      })

      const existingSlides = (currentDraft.heroSlides ?? []).map((s, idx) => {
        const rec = s as unknown as Record<string, unknown>
        return {
          ...(s.id ? { id: s.id } : {}),
          titleFirst: s.titleFirst,
          titleSecond: s.titleSecond ?? undefined,
          eyebrow: s.eyebrow ?? undefined,
          categoryBadge: s.categoryBadge ?? undefined,
          description: s.description ?? undefined,
          ctaText: s.ctaText,
          ctaHref: s.ctaHref,
          secondaryText: s.secondaryText ?? undefined,
          secondaryHref: s.secondaryHref ?? undefined,
          desktopImage: extractRelationId(s.desktopImage),
          mobileImage: extractRelationId(s.mobileImage),
          focalX: clampFocalPercent(rec.focalX, 50),
          focalY: clampFocalPercent(rec.focalY, 50),
          mobileFocalX: clampFocalPercent(rec.mobileFocalX, 50),
          mobileFocalY: clampFocalPercent(rec.mobileFocalY, 50),
          relatedCategory: s.relatedCategory ?? null,
          relatedModel: extractRelationId(s.relatedModel),
          credit: s.credit ?? undefined,
          sourceUrl: s.sourceUrl ?? undefined,
          durationSeconds: typeof s.durationSeconds === 'number' ? s.durationSeconds : null,
          order: typeof s.order === 'number' ? s.order : idx,
          active: s.active !== false,
        }
      })

      let targetIdx = requestedId ? existingSlides.findIndex((s) => s.id === requestedId) : -1
      if (targetIdx < 0 && requestedIndex >= 0 && requestedIndex < existingSlides.length) {
        targetIdx = requestedIndex
      }

      if (targetIdx >= 0) {
        existingSlides[targetIdx] = {
          ...validated.slide,
          order: targetIdx,
        }
      } else {
        if (existingSlides.length >= 12) {
          return fail('Tối đa 12 Hero Slide trong carousel.')
        }
        existingSlides.push({
          ...validated.slide,
          order: existingSlides.length,
        })
        targetIdx = existingSlides.length - 1
      }

      const updatedDraft = await payload.updateGlobal({
        slug: 'nori-site',
        user,
        overrideAccess: false,
        draft: true,
        depth: 1,
        data: {
          _status: 'draft',
          heroSlides: existingSlides,
        } as never,
      })

      const mapped = mapHeroSlidesForAdmin(updatedDraft.heroSlides ?? [])
      return json({
        updated: true,
        _status: 'draft',
        published: false,
        savedIndex: targetIdx,
        savedSlide: mapped[targetIdx] ?? null,
        heroSlides: mapped,
      })
    }

    const email = text(data.email, 254)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail('Địa chỉ email hỗ trợ chưa hợp lệ.')
    }

    for (const [key, label] of [
      ['workStartTime', 'Giờ bắt đầu hành chính'],
      ['workEndTime', 'Giờ kết thúc hành chính'],
      ['lunchBreakStart', 'Giờ bắt đầu nghỉ trưa'],
      ['lunchBreakEnd', 'Giờ kết thúc nghỉ trưa'],
    ] as const) {
      const val = text(data[key], 10)
      if (val && !validateTimeString(val)) {
        return fail(`${label} phải theo định dạng HH:MM (ví dụ 08:00).`)
      }
    }

    const status = data._status === 'draft' ? 'draft' : 'published'
    if (
      (status === 'published' || data.action === 'publish') &&
      !adminHasPermission(auth.admin, 'content', 'publish')
    ) {
      return fail(
        'Tài khoản chưa được cấp quyền "publish" cho phân hệ "content".',
        403,
        'FORBIDDEN',
      )
    }
    const patch: Record<string, unknown> = {
      _status: status,
      ...(data.siteName !== undefined ? { siteName: text(data.siteName, 80) } : {}),
      ...(data.tagline !== undefined ? { tagline: text(data.tagline, 120) } : {}),
      ...(data.seoTitle !== undefined ? { seoTitle: text(data.seoTitle, 160) } : {}),
      ...(data.seoDescription !== undefined
        ? { seoDescription: text(data.seoDescription, 320) }
        : {}),
      ...(data.heroAutoplaySeconds !== undefined
        ? {
            heroAutoplaySeconds: Math.min(
              20,
              Math.max(3, Math.round(Number(data.heroAutoplaySeconds) || 6)),
            ),
          }
        : {}),
      ...(data.homeIntroTitle !== undefined
        ? { homeIntroTitle: text(data.homeIntroTitle, 200) }
        : {}),
      ...(data.homeIntroDescription !== undefined
        ? { homeIntroDescription: text(data.homeIntroDescription, 1000) }
        : {}),
      ...(data.showHeroSection !== undefined
        ? { showHeroSection: Boolean(data.showHeroSection) }
        : {}),
      ...(data.showBenefitsSection !== undefined
        ? { showBenefitsSection: Boolean(data.showBenefitsSection) }
        : {}),
      ...(data.showFeaturedSection !== undefined
        ? { showFeaturedSection: Boolean(data.showFeaturedSection) }
        : {}),
      ...(data.showHowItWorksSection !== undefined
        ? { showHowItWorksSection: Boolean(data.showHowItWorksSection) }
        : {}),
      ...(data.showStorySection !== undefined
        ? { showStorySection: Boolean(data.showStorySection) }
        : {}),
      ...(data.showCtaSection !== undefined
        ? { showCtaSection: Boolean(data.showCtaSection) }
        : {}),
      ...(data.aboutSummary !== undefined ? { aboutSummary: text(data.aboutSummary, 3000) } : {}),
      ...(data.address !== undefined ? { address: text(data.address, 500) } : {}),
      ...(data.phone !== undefined ? { phone: text(data.phone, 40) } : {}),
      ...(data.email !== undefined ? { email } : {}),
      ...(data.openingHours !== undefined ? { openingHours: text(data.openingHours, 160) } : {}),
      ...(data.businessTimezone !== undefined
        ? { businessTimezone: text(data.businessTimezone, 60) || 'Asia/Ho_Chi_Minh' }
        : {}),
      ...(data.workingDays !== undefined
        ? { workingDays: text(data.workingDays, 40) || '1,2,3,4,5' }
        : {}),
      ...(data.workStartTime !== undefined
        ? { workStartTime: text(data.workStartTime, 10) || null }
        : {}),
      ...(data.workEndTime !== undefined
        ? { workEndTime: text(data.workEndTime, 10) || null }
        : {}),
      ...(data.lunchBreakStart !== undefined
        ? { lunchBreakStart: text(data.lunchBreakStart, 10) || null }
        : {}),
      ...(data.lunchBreakEnd !== undefined
        ? { lunchBreakEnd: text(data.lunchBreakEnd, 10) || null }
        : {}),
      ...(data.contactNote !== undefined ? { contactNote: text(data.contactNote, 2000) } : {}),
      ...(data.rentalPolicySummary !== undefined
        ? { rentalPolicySummary: text(data.rentalPolicySummary, 2000) }
        : {}),
      ...(data.purchasePolicySummary !== undefined
        ? { purchasePolicySummary: text(data.purchasePolicySummary, 2000) }
        : {}),
      ...(data.ageRequirement !== undefined
        ? { ageRequirement: text(data.ageRequirement, 200) }
        : {}),
      ...(data.licenseRequirement !== undefined
        ? { licenseRequirement: text(data.licenseRequirement, 200) }
        : {}),
      ...(data.cancellationPolicy !== undefined
        ? { cancellationPolicy: text(data.cancellationPolicy, 2000) }
        : {}),
      ...(data.depositPolicy !== undefined
        ? { depositPolicy: text(data.depositPolicy, 2000) }
        : {}),
      ...(data.privacyPolicy !== undefined
        ? { privacyPolicy: text(data.privacyPolicy, 5000) }
        : {}),
      ...(data.termsOfUse !== undefined ? { termsOfUse: text(data.termsOfUse, 5000) } : {}),
      ...(data.depositHoldHours !== undefined
        ? { depositHoldHours: Math.max(1, Number(data.depositHoldHours) || 24) }
        : {}),
      ...(data.maxPendingBookings !== undefined
        ? { maxPendingBookings: Math.max(1, Number(data.maxPendingBookings) || 5) }
        : {}),
      ...(data.maintenanceBannerEnabled !== undefined
        ? { maintenanceBannerEnabled: Boolean(data.maintenanceBannerEnabled) }
        : {}),
      ...(data.maintenanceBannerText !== undefined
        ? { maintenanceBannerText: text(data.maintenanceBannerText, 300) }
        : {}),
    }

    if (data.storyImageId !== undefined) patch.storyImage = text(data.storyImageId, 100) || null
    if (data.logoId !== undefined) patch.logo = text(data.logoId, 100) || null
    if (data.faviconId !== undefined) patch.favicon = text(data.faviconId, 100) || null
    if (data.ogImageId !== undefined) patch.ogImage = text(data.ogImageId, 100) || null

    if (Array.isArray(data.heroSlides)) {
      const normalizedSlides = []
      const mediaIdsToVerify: (string | null)[] = []
      const rawItems = data.heroSlides
        .slice(0, 12)
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object'),
        )

      for (let idx = 0; idx < rawItems.length; idx++) {
        const res = validateAndNormalizeSlide(rawItems[idx], idx, {
          requireDesktopImage: status === 'published' || rawItems[idx].active !== false,
        })
        if (!res.ok) return fail(res.error)
        normalizedSlides.push(res.slide)
        mediaIdsToVerify.push(res.slide.desktopImage, res.slide.mobileImage)
      }

      const mediaErr = await verifyMediaIdsExist(payload, mediaIdsToVerify)
      if (mediaErr) return fail(mediaErr)

      patch.heroSlides = normalizedSlides
    }

    if (Array.isArray(data.holidays)) {
      patch.holidays = data.holidays
        .slice(0, 100)
        .filter((item): item is { date?: unknown; name?: unknown } =>
          Boolean(item && typeof item === 'object'),
        )
        .map((item) => ({
          date: text(item.date, 10),
          name: text(item.name, 120) || 'Nghỉ lễ',
        }))
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    }

    if (Array.isArray(data.heroImages)) {
      patch.heroImages = data.heroImages
        .slice(0, 5)
        .filter((item): item is { imageId?: unknown; credit?: unknown } =>
          Boolean(item && typeof item === 'object'),
        )
        .map((item) => ({ image: text(item.imageId, 100), credit: text(item.credit, 200) }))
        .filter((item) => item.image)
    }
    if (Array.isArray(data.headerMenu)) {
      patch.headerMenu = data.headerMenu
        .filter((item): item is { label?: unknown; href?: unknown; visible?: unknown } =>
          Boolean(item && typeof item === 'object'),
        )
        .map((item) => ({
          label: text(item.label, 80),
          href: text(item.href, 200),
          visible: item.visible !== false,
        }))
        .filter((item) => item.label && item.href)
    }
    if (Array.isArray(data.footerLinks)) {
      patch.footerLinks = data.footerLinks
        .filter((item): item is { label?: unknown; href?: unknown; group?: unknown } =>
          Boolean(item && typeof item === 'object'),
        )
        .map((item) => ({
          label: text(item.label, 80),
          href: text(item.href, 200),
          group: text(item.group, 60) || 'Khám phá',
        }))
        .filter((item) => item.label && item.href)
    }
    if (Array.isArray(data.socialLinks)) {
      patch.socialLinks = data.socialLinks
        .filter((item): item is { platform?: unknown; url?: unknown } =>
          Boolean(item && typeof item === 'object'),
        )
        .map((item) => ({
          platform: text(item.platform, 60),
          url: text(item.url, 300),
        }))
        .filter((item) => item.platform && item.url)
    }
    if (Array.isArray(data.faqs)) {
      patch.faqs = data.faqs
        .filter((item): item is { question?: unknown; answer?: unknown; order?: unknown } =>
          Boolean(item && typeof item === 'object'),
        )
        .map((item, idx) => ({
          question: text(item.question, 300),
          answer: text(item.answer, 2000),
          order: Number(item.order) || idx,
        }))
        .filter((item) => item.question && item.answer)
    }

    const updated = await payload.updateGlobal({
      slug: 'nori-site',
      user,
      overrideAccess: false,
      draft: status === 'draft',
      depth: 1,
      data: patch,
    })

    if (status === 'published') {
      invalidateNoriCaches({ slugs: [], allDetails: false })
      const verifiedPublished = await payload.findGlobal({
        slug: 'nori-site',
        user,
        overrideAccess: false,
        draft: false,
        depth: 1,
      })
      return json({
        updated: true,
        _status: 'published',
        published: true,
        revalidated: true,
        publishedAt: verifiedPublished.updatedAt ?? new Date().toISOString(),
        heroSlides: mapHeroSlidesForAdmin(verifiedPublished.heroSlides ?? []),
      })
    }

    return json({
      updated: true,
      _status: 'draft',
      published: false,
      revalidated: false,
      heroSlides: mapHeroSlidesForAdmin(updated.heroSlides ?? []),
    })
  } catch (error) {
    return apiError(error)
  }
}

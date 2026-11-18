import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { photo } from '@/lib/catalogue'
import { validateTimeString } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['content', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const draft = new URL(request.url).searchParams.get('draft') !== 'false'
    const [site, versions, modelsRes] = await Promise.all([
      payload.findGlobal({
        slug: 'nori-site',
        user,
        overrideAccess: false,
        draft,
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

    return json({
      _status: site._status ?? 'published',
      siteName: site.siteName ?? 'NORI',
      tagline: site.tagline ?? 'Your way. Every day.',
      logoId: typeof site.logo === 'object' && site.logo ? site.logo.id : (site.logo ?? null),
      logo: photo(site.logo),
      faviconId:
        typeof site.favicon === 'object' && site.favicon ? site.favicon.id : (site.favicon ?? null),
      favicon: photo(site.favicon),
      seoTitle: site.seoTitle ?? '',
      seoDescription: site.seoDescription ?? '',
      ogImageId:
        typeof site.ogImage === 'object' && site.ogImage ? site.ogImage.id : (site.ogImage ?? null),
      ogImage: photo(site.ogImage),
      heroAutoplaySeconds: site.heroAutoplaySeconds ?? 6,
      heroSlides: (site.heroSlides ?? []).map((s, idx) => {
        const dImg = photo(s.desktopImage)
        const mImg = photo(s.mobileImage)
        const desktopImageId =
          typeof s.desktopImage === 'object' && s.desktopImage
            ? s.desktopImage.id
            : (s.desktopImage ?? null)
        const mobileImageId =
          typeof s.mobileImage === 'object' && s.mobileImage
            ? s.mobileImage.id
            : (s.mobileImage ?? null)
        const relatedModelId =
          typeof s.relatedModel === 'object' && s.relatedModel
            ? s.relatedModel.id
            : (s.relatedModel ?? null)
        return {
          id: s.id ?? `slide-${idx}`,
          titleFirst: s.titleFirst ?? '',
          titleSecond: s.titleSecond ?? '',
          eyebrow: s.eyebrow ?? '',
          categoryBadge: s.categoryBadge ?? '',
          description: s.description ?? '',
          ctaText: s.ctaText ?? 'Khám phá ngay',
          ctaHref: s.ctaHref ?? '/vehicles',
          secondaryText: s.secondaryText ?? '',
          secondaryHref: s.secondaryHref ?? '',
          desktopImageId,
          desktopImage: dImg,
          mobileImageId,
          mobileImage: mImg,
          relatedCategory: s.relatedCategory ?? '',
          relatedModelId,
          credit: s.credit ?? '',
          sourceUrl: s.sourceUrl ?? '',
          durationSeconds: s.durationSeconds ?? null,
          order: typeof s.order === 'number' ? s.order : idx,
          active: s.active !== false,
        }
      }),
      heroImages: (site.heroImages ?? []).flatMap((h) => {
        const img = photo(h.image)
        const imageId = typeof h.image === 'object' && h.image ? h.image.id : h.image
        return img && imageId ? [{ imageId, credit: h.credit ?? '', image: img }] : []
      }),
      storyImageId:
        typeof site.storyImage === 'object' && site.storyImage
          ? site.storyImage.id
          : (site.storyImage ?? null),
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
      65_536,
    )

    if (data.restoreVersionId) {
      await payload.restoreGlobalVersion({
        slug: 'nori-site',
        id: text(data.restoreVersionId, 100),
        user,
        overrideAccess: false,
      })
      return json({ restored: true })
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
      patch.heroSlides = data.heroSlides
        .slice(0, 12)
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object'),
        )
        .map((item, idx) => {
          const cat = text(item.relatedCategory, 20)
          const dur =
            item.durationSeconds !== undefined &&
            item.durationSeconds !== null &&
            item.durationSeconds !== ''
              ? Math.min(30, Math.max(3, Math.round(Number(item.durationSeconds) || 6)))
              : null
          return {
            titleFirst: text(item.titleFirst, 120),
            titleSecond: text(item.titleSecond, 120) || undefined,
            eyebrow: text(item.eyebrow, 120) || undefined,
            categoryBadge: text(item.categoryBadge, 80) || undefined,
            description: text(item.description, 600) || undefined,
            ctaText: text(item.ctaText, 60) || 'Khám phá ngay',
            ctaHref: text(item.ctaHref, 200) || '/vehicles',
            secondaryText: text(item.secondaryText, 60) || undefined,
            secondaryHref: text(item.secondaryHref, 200) || undefined,
            desktopImage: text(item.desktopImageId, 100) || null,
            mobileImage: text(item.mobileImageId, 100) || null,
            relatedCategory: ['CAR', 'MOTORBIKE', 'PICKUP'].includes(cat) ? cat : null,
            relatedModel: text(item.relatedModelId, 100) || null,
            credit: text(item.credit, 200) || undefined,
            sourceUrl: text(item.sourceUrl, 300) || undefined,
            durationSeconds: dur,
            order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : idx,
            active: item.active !== false,
          }
        })
        .filter((item) => item.titleFirst)
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

    await payload.updateGlobal({
      slug: 'nori-site',
      user,
      overrideAccess: false,
      draft: status === 'draft',
      data: patch,
    })

    return json({ updated: true, _status: status })
  } catch (error) {
    return apiError(error)
  }
}

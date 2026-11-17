'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { formatDate } from '@/lib/rental-rules'
import {
  Badge,
  Button,
  ButtonLink,
  Heading,
  Input,
  Notice,
  Skeleton,
  TabButton,
  Text,
  Textarea,
} from '@/components/ui'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type HeroImageItem = { imageId: string; credit: string; image: { url: string; alt: string } }
type MenuLink = { label: string; href: string; visible: boolean }
type FaqItem = { question: string; answer: string; order: number }
type VersionItem = { id: string; updatedAt: string; status: string }

type SiteContentForm = {
  _status: 'draft' | 'published'
  siteName: string
  tagline: string
  seoTitle: string
  seoDescription: string
  heroImages: HeroImageItem[]
  storyImageId: string | null
  storyImage: { url: string; alt: string } | null
  homeIntroTitle: string
  homeIntroDescription: string
  showHeroSection: boolean
  showBenefitsSection: boolean
  showFeaturedSection: boolean
  showHowItWorksSection: boolean
  showStorySection: boolean
  showCtaSection: boolean
  headerMenu: MenuLink[]
  aboutSummary: string
  address: string
  phone: string
  email: string
  openingHours: string
  contactNote: string
  rentalPolicySummary: string
  purchasePolicySummary: string
  ageRequirement: string
  licenseRequirement: string
  cancellationPolicy: string
  depositPolicy: string
  privacyPolicy: string
  termsOfUse: string
  faqs: FaqItem[]
  depositHoldHours: number
  maxPendingBookings: number
  maintenanceBannerEnabled: boolean
  maintenanceBannerText: string
  versions: VersionItem[]
}

export function ContentPanel() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'brand' | 'policies' | 'faqs' | 'settings'>('brand')
  const [form, setForm] = useState<SiteContentForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    api<SiteContentForm>('/dashboard/content')
      .then((res) => {
        if (active) setForm(res)
      })
      .catch((e) => {
        if (active) setError((e as Error).message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [retry])

  async function uploadBanner(e: React.ChangeEvent<HTMLInputElement>, target: 'hero' | 'story') {
    const file = e.target.files?.[0]
    if (!file || !form) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('alt', target === 'hero' ? 'Banner NORI' : 'Ảnh câu chuyện NORI')
      fd.append('mediaCategory', 'ILLUSTRATION')
      const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Chưa thể tải ảnh lên.')
      const uploadedUrl = json.data.photo?.url || json.data.url
      if (target === 'story') {
        setForm({
          ...form,
          storyImageId: json.data.id,
          storyImage: { url: uploadedUrl, alt: json.data.alt },
        })
      } else {
        setForm({
          ...form,
          heroImages: [
            ...form.heroImages.slice(0, 2),
            {
              imageId: json.data.id,
              credit: 'NORI Official',
              image: { url: uploadedUrl, alt: json.data.alt },
            },
          ],
        })
      }
      toast('Đã tải ảnh lên thư viện.')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function submitContent(targetStatus: 'draft' | 'published') {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      await api('/dashboard/content', {
        method: 'PATCH',
        body: JSON.stringify({
          _status: targetStatus,
          siteName: form.siteName,
          tagline: form.tagline,
          seoTitle: form.seoTitle,
          seoDescription: form.seoDescription,
          heroImages: form.heroImages.map((h) => ({ imageId: h.imageId, credit: h.credit })),
          storyImageId: form.storyImageId,
          homeIntroTitle: form.homeIntroTitle,
          homeIntroDescription: form.homeIntroDescription,
          showHeroSection: form.showHeroSection,
          showBenefitsSection: form.showBenefitsSection,
          showFeaturedSection: form.showFeaturedSection,
          showHowItWorksSection: form.showHowItWorksSection,
          showStorySection: form.showStorySection,
          showCtaSection: form.showCtaSection,
          headerMenu: form.headerMenu,
          aboutSummary: form.aboutSummary,
          address: form.address,
          phone: form.phone,
          email: form.email,
          openingHours: form.openingHours,
          contactNote: form.contactNote,
          rentalPolicySummary: form.rentalPolicySummary,
          purchasePolicySummary: form.purchasePolicySummary,
          ageRequirement: form.ageRequirement,
          licenseRequirement: form.licenseRequirement,
          cancellationPolicy: form.cancellationPolicy,
          depositPolicy: form.depositPolicy,
          privacyPolicy: form.privacyPolicy,
          termsOfUse: form.termsOfUse,
          faqs: form.faqs,
          depositHoldHours: form.depositHoldHours,
          maxPendingBookings: form.maxPendingBookings,
          maintenanceBannerEnabled: form.maintenanceBannerEnabled,
          maintenanceBannerText: form.maintenanceBannerText,
        }),
      })
      toast(
        targetStatus === 'published'
          ? 'Đã xuất bản nội dung CMS và đồng bộ lên website công khai.'
          : 'Đã lưu bản nháp CMS.',
      )
      setRetry((r) => r + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function restoreVersion(versionId: string) {
    setSaving(true)
    try {
      await api('/dashboard/content', {
        method: 'PATCH',
        body: JSON.stringify({ restoreVersionId: versionId }),
      })
      toast('Đã khôi phục phiên bản nội dung trước đó.')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-96" />
  if (!form) return <Notice tone="error">{error || 'Chưa thể tải nội dung website.'}</Notice>

  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-4">
        <div className="flex items-center gap-2.5">
          <Badge tone={form._status === 'published' ? 'brand' : 'warning'}>
            {form._status === 'published' ? 'Đang xuất bản' : 'Có bản nháp chưa xuất bản'}
          </Badge>
          <ButtonLink
            href="/"
            variant="ghost"
            className="min-h-control-sm px-3 py-1.5 text-caption"
          >
            Xem trước website <Icon name="external" className="size-3.5" />
          </ButtonLink>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={saving}
            onClick={() => void submitContent('draft')}
          >
            Lưu bản nháp
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={saving}
            onClick={() => void submitContent('published')}
          >
            Xuất bản lên website
          </Button>
        </div>
      </div>

      <div role="tablist" className="flex flex-wrap gap-6 border-b border-line">
        <TabButton selected={tab === 'brand'} onClick={() => setTab('brand')}>
          Thương hiệu, Banner & Trang chủ
        </TabButton>
        <TabButton selected={tab === 'policies'} onClick={() => setTab('policies')}>
          Liên hệ, Chính sách & Điều khoản
        </TabButton>
        <TabButton selected={tab === 'faqs'} onClick={() => setTab('faqs')}>
          Câu hỏi thường gặp ({form.faqs.length})
        </TabButton>
        <TabButton selected={tab === 'settings'} onClick={() => setTab('settings')}>
          Cài đặt hệ thống & Phiên bản
        </TabButton>
      </div>

      {tab === 'brand' && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Thương hiệu & SEO Metadata
            </Heading>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="cms-site-name"
                label="Tên thương hiệu"
                value={form.siteName}
                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
              />
              <Input
                id="cms-tagline"
                label="Khẩu hiệu (Tagline)"
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              />
              <Input
                id="cms-seo-title"
                label="SEO Meta Title mặc định"
                value={form.seoTitle}
                onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
              />
              <Input
                id="cms-seo-desc"
                label="SEO Meta Description mặc định"
                value={form.seoDescription}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Trạng thái hiển thị các Section trang chủ
            </Heading>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['showHeroSection', 'Hero Banner'],
                ['showBenefitsSection', 'Khu vực Lợi ích'],
                ['showFeaturedSection', 'Xe nổi bật'],
                ['showStorySection', 'Câu chuyện NORI'],
                ['showHowItWorksSection', 'Quy trình đặt xe'],
                ['showCtaSection', 'Kêu gọi hành động'],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 rounded-control border border-line px-3.5 py-2.5 text-small"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(form[key as keyof SiteContentForm])}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="size-4"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Heading as="h2" size="subtitle">
                  Banner trang chủ & Hình ảnh câu chuyện
                </Heading>
                <Text className="text-caption text-muted">
                  Tối đa 3 ảnh banner cảm hứng hành trình và 1 ảnh câu chuyện NORI
                </Text>
              </div>
              {form.heroImages.length < 3 && (
                <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-2 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
                  <Icon name="upload" className="size-4" />
                  {uploading ? 'Đang tải...' : 'Thêm ảnh Banner'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => void uploadBanner(e, 'hero')}
                  />
                </label>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {form.heroImages.map((h, idx) => (
                <div
                  key={`${h.imageId}-${idx}`}
                  className="space-y-2 rounded-control border border-line p-3"
                >
                  <div className="relative overflow-hidden rounded-sm">
                    <Image
                      src={h.image.url}
                      alt={h.image.alt}
                      width={320}
                      height={180}
                      className="h-32 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          heroImages: form.heroImages.filter((_, i) => i !== idx),
                        })
                      }
                      aria-label="Gỡ banner"
                      className="absolute right-1.5 top-1.5 rounded-pill bg-night/80 p-1.5 text-inverse hover:bg-danger"
                    >
                      <Icon name="close" className="size-3.5" />
                    </button>
                  </div>
                  <Input
                    id={`hero-credit-${idx}`}
                    label="Tác giả / Chú thích"
                    value={h.credit}
                    onChange={(e) => {
                      const next = [...form.heroImages]
                      next[idx] = { ...h, credit: e.target.value }
                      setForm({ ...form, heroImages: next })
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
              <div className="flex items-center gap-4">
                {form.storyImage && (
                  <Image
                    src={form.storyImage.url}
                    alt={form.storyImage.alt}
                    width={120}
                    height={80}
                    className="h-16 w-24 rounded-control object-cover"
                  />
                )}
                <Text className="text-small font-semibold">Ảnh câu chuyện NORI</Text>
              </div>
              <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-2 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
                <Icon name="upload" className="size-4" />
                Thay ảnh câu chuyện
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => void uploadBanner(e, 'story')}
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {tab === 'policies' && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Thông tin liên hệ & Địa điểm NORI
            </Heading>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                id="site-phone"
                label="Hotline"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <Input
                id="site-email"
                label="Email hỗ trợ"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                id="site-hours"
                label="Giờ làm việc"
                value={form.openingHours}
                onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea
                id="site-address"
                label="Địa chỉ nhận & trả xe"
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
              <Textarea
                id="site-contact-note"
                label="Nội dung liên hệ & hướng dẫn hỗ trợ"
                rows={2}
                value={form.contactNote}
                onChange={(e) => setForm({ ...form, contactNote: e.target.value })}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Giới thiệu, Chính sách bảo mật & Điều khoản
            </Heading>
            <Textarea
              id="site-about"
              label="Thông tin giới thiệu NORI (trang /about)"
              rows={3}
              value={form.aboutSummary}
              onChange={(e) => setForm({ ...form, aboutSummary: e.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="site-age"
                label="Điều kiện độ tuổi thuê xe"
                value={form.ageRequirement}
                onChange={(e) => setForm({ ...form, ageRequirement: e.target.value })}
              />
              <Input
                id="site-license"
                label="Yêu cầu giấy phép lái xe"
                value={form.licenseRequirement}
                onChange={(e) => setForm({ ...form, licenseRequirement: e.target.value })}
              />
              <Textarea
                id="site-rent-policy"
                label="Chính sách thuê xe"
                rows={3}
                value={form.rentalPolicySummary}
                onChange={(e) => setForm({ ...form, rentalPolicySummary: e.target.value })}
              />
              <Textarea
                id="site-buy-policy"
                label="Chính sách mua xe"
                rows={3}
                value={form.purchasePolicySummary}
                onChange={(e) => setForm({ ...form, purchasePolicySummary: e.target.value })}
              />
              <Textarea
                id="site-cancel-policy"
                label="Chính sách hủy & hoàn cọc"
                rows={3}
                value={form.cancellationPolicy}
                onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })}
              />
              <Textarea
                id="site-deposit-policy"
                label="Chính sách đặt cọc & nhiên liệu/pin"
                rows={3}
                value={form.depositPolicy}
                onChange={(e) => setForm({ ...form, depositPolicy: e.target.value })}
              />
              <Textarea
                id="site-privacy"
                label="Chính sách bảo mật"
                rows={4}
                value={form.privacyPolicy}
                onChange={(e) => setForm({ ...form, privacyPolicy: e.target.value })}
              />
              <Textarea
                id="site-terms"
                label="Điều khoản sử dụng"
                rows={4}
                value={form.termsOfUse}
                onChange={(e) => setForm({ ...form, termsOfUse: e.target.value })}
              />
            </div>
          </section>
        </div>
      )}

      {tab === 'faqs' && (
        <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
          <div className="flex items-center justify-between">
            <div>
              <Heading as="h2" size="subtitle">
                Quản lý FAQ hiển thị tại /support
              </Heading>
              <Text className="text-caption text-muted">
                Khi có danh sách FAQ tại đây, trang /support sẽ tự động đồng bộ từ CMS.
              </Text>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setForm({
                  ...form,
                  faqs: [...form.faqs, { question: '', answer: '', order: form.faqs.length + 1 }],
                })
              }
            >
              <Icon name="plus" className="size-4" />
              Thêm câu hỏi
            </Button>
          </div>
          {form.faqs.length === 0 ? (
            <Text className="py-6 text-center text-small text-muted">
              Chưa có câu hỏi FAQ tùy chỉnh (đang dùng bộ FAQ mặc định của hệ thống).
            </Text>
          ) : (
            <div className="space-y-4">
              {form.faqs.map((faq, idx) => (
                <div key={idx} className="space-y-3 rounded-control border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Text className="text-caption font-semibold text-muted">
                      Câu hỏi #{idx + 1}
                    </Text>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        setForm({ ...form, faqs: form.faqs.filter((_, i) => i !== idx) })
                      }
                    >
                      Xóa
                    </Button>
                  </div>
                  <Input
                    id={`faq-q-${idx}`}
                    label="Câu hỏi"
                    value={faq.question}
                    onChange={(e) => {
                      const next = [...form.faqs]
                      next[idx] = { ...faq, question: e.target.value }
                      setForm({ ...form, faqs: next })
                    }}
                  />
                  <Textarea
                    id={`faq-a-${idx}`}
                    label="Câu trả lời"
                    rows={2}
                    value={faq.answer}
                    onChange={(e) => {
                      const next = [...form.faqs]
                      next[idx] = { ...faq, answer: e.target.value }
                      setForm({ ...form, faqs: next })
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'settings' && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Cấu hình vận hành hệ thống
            </Heading>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="sys-hold-hours"
                label="Thời hạn giữ chỗ chờ đặt cọc (giờ)"
                type="number"
                min={1}
                max={168}
                value={form.depositHoldHours}
                onChange={(e) =>
                  setForm({ ...form, depositHoldHours: Number(e.target.value) || 24 })
                }
              />
              <Input
                id="sys-max-pending"
                label="Số đơn chờ xác nhận tối đa / khách hàng"
                type="number"
                min={1}
                max={20}
                value={form.maxPendingBookings}
                onChange={(e) =>
                  setForm({ ...form, maxPendingBookings: Number(e.target.value) || 5 })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={form.maintenanceBannerEnabled}
                onChange={(e) => setForm({ ...form, maintenanceBannerEnabled: e.target.checked })}
                className="size-4"
              />
              Hiển thị thông báo vận hành trên website khách hàng
            </label>
            {form.maintenanceBannerEnabled && (
              <Input
                id="sys-banner-text"
                label="Nội dung thông báo"
                value={form.maintenanceBannerText}
                onChange={(e) => setForm({ ...form, maintenanceBannerText: e.target.value })}
              />
            )}
          </section>

          <section className="space-y-3 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Lịch sử phiên bản CMS ({form.versions.length})
            </Heading>
            {form.versions.length === 0 ? (
              <Text className="text-small text-muted">Chưa có lịch sử phiên bản.</Text>
            ) : (
              <div className="divide-y divide-line rounded-control border border-line">
                {form.versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-small"
                  >
                    <div>
                      <Badge tone={v.status === 'published' ? 'brand' : 'muted'}>
                        {v.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                      </Badge>{' '}
                      <span className="ml-2 text-muted">{formatDate(v.updatedAt)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void restoreVersion(v.id)}
                    >
                      Khôi phục phiên bản này
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

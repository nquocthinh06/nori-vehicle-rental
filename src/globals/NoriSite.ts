import { APIError, type GlobalConfig } from 'payload'
import { adminHasAnyPermission, adminHasPermission } from '@/access/nori'
import { auditSiteContent } from '@/hooks/audit-nori'
import { revalidateSite } from '@/hooks/revalidate-nori'

export const NoriSite: GlobalConfig = {
  slug: 'nori-site',
  label: 'NORI · Nội dung & liên hệ',
  access: {
    read: ({ req }) =>
      adminHasPermission(req.user, 'content', 'read') ? true : { _status: { equals: 'published' } },
    update: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['content', 'update'],
        ['settings', 'update'],
      ]),
  },
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        if (
          data &&
          req.user?.collection === 'admins' &&
          !req.context?.skipPermissionCheck &&
          data._status === 'published' &&
          !adminHasPermission(req.user, 'content', 'publish')
        ) {
          throw new APIError('Tài khoản chưa được cấp quyền Xuất bản CMS Website.', 403)
        }
        return data
      },
    ],
    afterChange: [revalidateSite, auditSiteContent],
  },
  versions: {
    drafts: true,
    max: 15,
  },
  fields: [
    // Brand & SEO
    { name: 'siteName', label: 'Tên thương hiệu', type: 'text', defaultValue: 'NORI' },
    {
      name: 'tagline',
      label: 'Khẩu hiệu thương hiệu',
      type: 'text',
      defaultValue: 'Your way. Every day.',
    },
    { name: 'logo', label: 'Logo thương hiệu', type: 'upload', relationTo: 'media' },
    { name: 'favicon', label: 'Favicon', type: 'upload', relationTo: 'media' },
    { name: 'seoTitle', label: 'SEO Meta Title mặc định', type: 'text', maxLength: 160 },
    {
      name: 'seoDescription',
      label: 'SEO Meta Description mặc định',
      type: 'textarea',
      maxLength: 320,
    },
    {
      name: 'ogImage',
      label: 'Ảnh chia sẻ mạng xã hội (OG Image)',
      type: 'upload',
      relationTo: 'media',
    },

    // Hero Carousel Management
    {
      name: 'heroAutoplaySeconds',
      label: 'Thời gian tự động chuyển slide Hero (giây)',
      type: 'number',
      min: 3,
      max: 20,
      defaultValue: 6,
    },
    {
      name: 'heroSlides',
      label: 'Danh sách Slide Hero Carousel',
      type: 'array',
      maxRows: 12,
      fields: [
        { name: 'titleFirst', label: 'Tiêu đề dòng 1', type: 'text', required: true },
        { name: 'titleSecond', label: 'Tiêu đề dòng 2 (nhấn mạnh)', type: 'text' },
        { name: 'eyebrow', label: 'Dòng phụ đề trên (Eyebrow)', type: 'text' },
        { name: 'categoryBadge', label: 'Nhãn danh mục', type: 'text' },
        { name: 'description', label: 'Mô tả slide', type: 'textarea', maxLength: 600 },
        { name: 'ctaText', label: 'Nhãn nút CTA chính', type: 'text', required: true },
        { name: 'ctaHref', label: 'Đường dẫn điều hướng CTA', type: 'text', required: true },
        { name: 'secondaryText', label: 'Nhãn nút phụ', type: 'text' },
        { name: 'secondaryHref', label: 'Đường dẫn nút phụ', type: 'text' },
        {
          name: 'desktopImage',
          label: 'Ảnh nền Desktop',
          type: 'upload',
          relationTo: 'media',
        },
        {
          name: 'mobileImage',
          label: 'Ảnh nền Mobile (tùy chọn)',
          type: 'upload',
          relationTo: 'media',
        },
        {
          name: 'focalX',
          label: 'Điểm trọng tâm ngang Desktop (%)',
          type: 'number',
          min: 0,
          max: 100,
          defaultValue: 50,
        },
        {
          name: 'focalY',
          label: 'Điểm trọng tâm dọc Desktop (%)',
          type: 'number',
          min: 0,
          max: 100,
          defaultValue: 50,
        },
        {
          name: 'mobileFocalX',
          label: 'Điểm trọng tâm ngang Mobile (%)',
          type: 'number',
          min: 0,
          max: 100,
          defaultValue: 50,
        },
        {
          name: 'mobileFocalY',
          label: 'Điểm trọng tâm dọc Mobile (%)',
          type: 'number',
          min: 0,
          max: 100,
          defaultValue: 50,
        },
        {
          name: 'relatedCategory',
          label: 'Danh mục phương tiện liên quan',
          type: 'select',
          options: [
            { label: 'Ô tô', value: 'CAR' },
            { label: 'Xe máy', value: 'MOTORBIKE' },
            { label: 'Bán tải', value: 'PICKUP' },
          ],
        },
        {
          name: 'relatedModel',
          label: 'Dòng xe liên quan',
          type: 'relationship',
          relationTo: 'vehicle-models',
        },
        { name: 'credit', label: 'Nguồn tham chiếu / Tác giả ảnh', type: 'text' },
        { name: 'sourceUrl', label: 'URL nguồn tham chiếu', type: 'text' },
        {
          name: 'durationSeconds',
          label: 'Thời gian hiển thị riêng (giây)',
          type: 'number',
          min: 3,
          max: 30,
        },
        { name: 'order', label: 'Thứ tự hiển thị', type: 'number', defaultValue: 0 },
        { name: 'active', label: 'Hiển thị slide', type: 'checkbox', defaultValue: true },
      ],
    },

    // Legacy Hero Images & Storytelling
    {
      name: 'heroImages',
      label: 'Ảnh cảm hứng hành trình (dự phòng)',
      type: 'array',
      maxRows: 5,
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'credit', label: 'Tác giả / nguồn', type: 'text' },
      ],
    },
    { name: 'storyImage', label: 'Ảnh câu chuyện NORI', type: 'upload', relationTo: 'media' },
    { name: 'homeIntroTitle', label: 'Tiêu đề giới thiệu trang chủ', type: 'text', maxLength: 200 },
    {
      name: 'homeIntroDescription',
      label: 'Mô tả giới thiệu trang chủ',
      type: 'textarea',
      maxLength: 1000,
    },
    {
      name: 'showHeroSection',
      label: 'Hiển thị khu vực Hero',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'showBenefitsSection',
      label: 'Hiển thị khu vực Lợi ích',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'showFeaturedSection',
      label: 'Hiển thị khu vực Xe nổi bật',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'showHowItWorksSection',
      label: 'Hiển thị khu vực Quy trình đặt xe',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'showStorySection',
      label: 'Hiển thị khu vực Câu chuyện NORI',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'showCtaSection',
      label: 'Hiển thị khu vực Kêu gọi hành động',
      type: 'checkbox',
      defaultValue: true,
    },

    // Navigation & Social
    {
      name: 'headerMenu',
      label: 'Menu điều hướng chính (Header)',
      type: 'array',
      fields: [
        { name: 'label', label: 'Nhãn hiển thị', type: 'text', required: true },
        { name: 'href', label: 'Đường dẫn', type: 'text', required: true },
        { name: 'visible', label: 'Hiển thị', type: 'checkbox', defaultValue: true },
      ],
    },
    {
      name: 'footerLinks',
      label: 'Liên kết Footer',
      type: 'array',
      fields: [
        { name: 'label', label: 'Nhãn hiển thị', type: 'text', required: true },
        { name: 'href', label: 'Đường dẫn', type: 'text', required: true },
        { name: 'group', label: 'Nhóm cột', type: 'text', defaultValue: 'Khám phá' },
      ],
    },
    {
      name: 'socialLinks',
      label: 'Mạng xã hội',
      type: 'array',
      fields: [
        { name: 'platform', label: 'Nền tảng', type: 'text', required: true },
        { name: 'url', label: 'Liên kết', type: 'text', required: true },
      ],
    },

    // About, Contact & Business Hours Configuration
    { name: 'aboutSummary', label: 'Giới thiệu NORI', type: 'textarea', maxLength: 3000 },
    { name: 'address', label: 'Địa chỉ nhận/trả xe đã xác nhận', type: 'textarea' },
    { name: 'phone', label: 'Hotline đã xác nhận', type: 'text' },
    { name: 'email', label: 'Email hỗ trợ đã xác nhận', type: 'email' },
    { name: 'openingHours', label: 'Giờ mở cửa bãi xe / hiển thị chung', type: 'text' },
    {
      name: 'businessTimezone',
      label: 'Múi giờ hoạt động',
      type: 'text',
      defaultValue: 'Asia/Ho_Chi_Minh',
    },
    {
      name: 'workingDays',
      label: 'Các ngày làm việc hành chính tư vấn (0=CN, 1=T2..6=T7)',
      type: 'text',
      defaultValue: '1,2,3,4,5',
    },
    { name: 'workStartTime', label: 'Giờ bắt đầu hành chính (HH:MM)', type: 'text' },
    { name: 'workEndTime', label: 'Giờ kết thúc hành chính (HH:MM)', type: 'text' },
    { name: 'lunchBreakStart', label: 'Giờ bắt đầu nghỉ trưa (HH:MM)', type: 'text' },
    { name: 'lunchBreakEnd', label: 'Giờ kết thúc nghỉ trưa (HH:MM)', type: 'text' },
    {
      name: 'holidays',
      label: 'Danh sách ngày nghỉ lễ cấu hình bổ sung',
      type: 'array',
      fields: [
        { name: 'date', label: 'Ngày nghỉ (YYYY-MM-DD)', type: 'text', required: true },
        { name: 'name', label: 'Tên kỳ nghỉ lễ', type: 'text', required: true },
      ],
    },
    {
      name: 'contactNote',
      label: 'Nội dung liên hệ & hướng dẫn hỗ trợ',
      type: 'textarea',
      maxLength: 2000,
    },

    // Policies & FAQs
    { name: 'rentalPolicySummary', label: 'Tóm tắt chính sách thuê xe', type: 'textarea' },
    { name: 'purchasePolicySummary', label: 'Tóm tắt chính sách mua xe', type: 'textarea' },
    { name: 'ageRequirement', label: 'Điều kiện độ tuổi thuê xe', type: 'text' },
    { name: 'licenseRequirement', label: 'Yêu cầu giấy phép lái xe', type: 'text' },
    { name: 'cancellationPolicy', label: 'Chính sách hủy & hoàn cọc', type: 'textarea' },
    { name: 'depositPolicy', label: 'Chính sách đặt cọc & nhiên liệu/pin', type: 'textarea' },
    { name: 'privacyPolicy', label: 'Chính sách bảo mật', type: 'textarea', maxLength: 5000 },
    { name: 'termsOfUse', label: 'Điều khoản sử dụng', type: 'textarea', maxLength: 5000 },
    {
      name: 'faqs',
      label: 'Câu hỏi thường gặp (FAQ)',
      type: 'array',
      fields: [
        { name: 'question', label: 'Câu hỏi', type: 'text', required: true },
        { name: 'answer', label: 'Câu trả lời', type: 'textarea', required: true },
        { name: 'order', label: 'Thứ tự', type: 'number', defaultValue: 0 },
      ],
    },

    // System Operational Settings
    {
      name: 'depositHoldHours',
      label: 'Thời hạn giữ cọc (giờ)',
      type: 'number',
      min: 1,
      max: 168,
      defaultValue: 24,
    },
    {
      name: 'maxPendingBookings',
      label: 'Số đơn chờ tối đa / khách',
      type: 'number',
      min: 1,
      max: 20,
      defaultValue: 5,
    },
    {
      name: 'maintenanceBannerEnabled',
      label: 'Bật thông báo bảo trì hệ thống',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'maintenanceBannerText',
      label: 'Nội dung thông báo hệ thống',
      type: 'text',
      maxLength: 300,
    },
  ],
}

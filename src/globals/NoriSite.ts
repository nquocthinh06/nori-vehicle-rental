import type { GlobalConfig } from 'payload'
import { isAdmin } from '@/access/nori'
import { auditSiteContent } from '@/hooks/audit-nori'
import { revalidateSite } from '@/hooks/revalidate-nori'

export const NoriSite: GlobalConfig = {
  slug: 'nori-site',
  label: 'NORI · Nội dung & liên hệ',
  access: { read: () => true, update: isAdmin },
  hooks: { afterChange: [revalidateSite, auditSiteContent] },
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

    // Home & Storytelling
    {
      name: 'heroImages',
      label: 'Ảnh cảm hứng hành trình (không phải kho xe)',
      type: 'array',
      maxRows: 3,
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

    // About & Contact
    { name: 'aboutSummary', label: 'Giới thiệu NORI', type: 'textarea', maxLength: 3000 },
    { name: 'address', label: 'Địa chỉ nhận/trả xe đã xác nhận', type: 'textarea' },
    { name: 'phone', label: 'Hotline đã xác nhận', type: 'text' },
    { name: 'email', label: 'Email hỗ trợ đã xác nhận', type: 'email' },
    { name: 'openingHours', label: 'Giờ làm việc', type: 'text' },
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

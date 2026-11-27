import type { GlobalConfig } from 'payload'
import { adminHasAnyPermission } from '@/access/nori'
import { auditSiteContent } from '@/hooks/audit-nori'

/**
 * Operational settings for NORI AI Assistant.
 * NEVER stores OpenAI API keys or secrets (those remain strictly server-side env vars).
 * Public clients receive only a safe, minimal projection via GET /nori-api/ai/config.
 */
export const AISettings: GlobalConfig = {
  slug: 'ai-settings',
  label: 'NORI · Cấu hình Trợ lý AI',
  versions: false,
  lockDocuments: false,
  access: {
    read: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['ai', 'read'],
        ['settings', 'read'],
      ]),
    update: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['ai', 'update'],
        ['settings', 'update'],
      ]),
  },
  hooks: {
    afterChange: [auditSiteContent],
  },
  fields: [
    {
      name: 'enabled',
      label: 'Bật Trợ lý AI NORI cho khách hàng',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'greetingMessage',
      label: 'Lời chào mở đầu của Trợ lý AI',
      type: 'textarea',
      maxLength: 500,
      defaultValue:
        'Xin chào! Tôi là Trợ lý AI của NORI. Tôi có thể giúp bạn tìm xe phù hợp nhu cầu & ngân sách, kiểm tra lịch trống, tính báo giá thuê xe và giải đáp chính sách của NORI.',
    },
    {
      name: 'quickSuggestions',
      label: 'Gợi ý câu hỏi nhanh (Quick Suggestions)',
      type: 'array',
      maxRows: 8,
      fields: [
        { name: 'label', label: 'Nhãn hiển thị', type: 'text', required: true, maxLength: 80 },
        {
          name: 'prompt',
          label: 'Nội dung gửi khi chọn',
          type: 'text',
          required: true,
          maxLength: 240,
        },
      ],
    },
    {
      name: 'maxOutputTokens',
      label: 'Giới hạn token đầu ra mỗi phản hồi',
      type: 'number',
      min: 200,
      max: 2000,
      defaultValue: 1000,
    },
    {
      name: 'maxToolRounds',
      label: 'Số vòng Function Calling tối đa mỗi lượt',
      type: 'number',
      min: 1,
      max: 6,
      defaultValue: 5,
    },
    {
      name: 'rateLimitPerMinute',
      label: 'Giới hạn lượt hỏi / phút / phiên',
      type: 'number',
      min: 1,
      max: 30,
      defaultValue: 5,
    },
    {
      name: 'rateLimitPerDay',
      label: 'Giới hạn lượt hỏi / ngày / phiên',
      type: 'number',
      min: 1,
      max: 500,
      defaultValue: 30,
    },
    {
      name: 'dailyBudgetUsd',
      label: 'Ngân sách ước tính tối đa / ngày (USD)',
      type: 'number',
      min: 0.5,
      max: 100,
      defaultValue: 5,
    },
    {
      name: 'weightBudget',
      label: 'Trọng số đề xuất — Phù hợp ngân sách (%)',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 35,
    },
    {
      name: 'weightPurpose',
      label: 'Trọng số đề xuất — Mục đích sử dụng (%)',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 25,
    },
    {
      name: 'weightCapacity',
      label: 'Trọng số đề xuất — Sức chứa / số chỗ (%)',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 20,
    },
    {
      name: 'weightRating',
      label: 'Trọng số đề xuất — Đánh giá đã xác minh (%)',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 10,
    },
    {
      name: 'weightFuel',
      label: 'Trọng số đề xuất — Hiệu quả nhiên liệu (%)',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 10,
    },
    {
      name: 'knowledgeNote',
      label: 'Ghi chú kiến thức công khai bổ sung cho AI (đã phê duyệt)',
      type: 'textarea',
      maxLength: 3000,
    },
    {
      name: 'updatedByEmail',
      label: 'Quản trị viên cập nhật gần nhất',
      type: 'text',
    },
  ],
}

import type { CollectionConfig } from 'payload'
import { adminHasAnyPermission, serverField } from '@/access/nori'

/**
 * Structured AI operational telemetry & attribution log.
 * Admin-only read; server-only write; NEVER stores API keys, passwords, raw PII,
 * or full conversation transcripts by default.
 */
export const AIUsageLogs: CollectionConfig = {
  slug: 'ai-usage-logs',
  labels: { singular: 'Nhật ký sử dụng AI', plural: 'Nhật ký & Thống kê AI' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'requestId',
    group: 'NORI · Hệ thống',
    defaultColumns: [
      'requestId',
      'eventType',
      'status',
      'model',
      'totalTokens',
      'latencyMs',
      'createdAt',
    ],
  },
  access: {
    create: () => false,
    read: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['ai', 'read'],
        ['reports', 'read'],
      ]),
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'requestId',
      label: 'Mã yêu cầu',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { update: serverField },
    },
    {
      name: 'eventType',
      label: 'Loại sự kiện',
      type: 'select',
      options: ['CHAT', 'VEHICLE_CLICK', 'CHECKOUT_HANDOFF', 'CONNECTION_TEST'],
      defaultValue: 'CHAT',
      required: true,
      index: true,
    },
    {
      name: 'status',
      label: 'Trạng thái xử lý',
      type: 'select',
      options: ['SUCCESS', 'ERROR', 'BLOCKED', 'RATE_LIMITED', 'UNCONFIGURED', 'DISABLED'],
      defaultValue: 'SUCCESS',
      required: true,
      index: true,
    },
    { name: 'provider', label: 'Nhà cung cấp AI', type: 'text', defaultValue: 'openai' },
    { name: 'model', label: 'Model AI', type: 'text', index: true },
    {
      name: 'userType',
      label: 'Nhóm người dùng',
      type: 'select',
      options: ['GUEST', 'CUSTOMER', 'ADMIN'],
      defaultValue: 'GUEST',
    },
    { name: 'userId', label: 'ID tham chiếu (không PII)', type: 'text' },
    { name: 'sessionHash', label: 'Mã băm phiên', type: 'text', index: true },
    { name: 'intent', label: 'Nhóm nhu cầu', type: 'text', index: true },
    { name: 'toolsCalled', label: 'Danh sách hàm đã gọi (JSON)', type: 'json' },
    { name: 'recommendedModelSlugs', label: 'Danh sách xe đề xuất (JSON)', type: 'json' },
    { name: 'clickedModelSlug', label: 'Xe khách hàng tương tác', type: 'text', index: true },
    {
      name: 'noResultFound',
      label: 'Không tìm thấy kết quả',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    { name: 'inputTokens', label: 'Input tokens', type: 'number', min: 0, defaultValue: 0 },
    { name: 'outputTokens', label: 'Output tokens', type: 'number', min: 0, defaultValue: 0 },
    { name: 'totalTokens', label: 'Tổng tokens', type: 'number', min: 0, defaultValue: 0 },
    {
      name: 'estimatedCostUsd',
      label: 'Chi phí ước tính (USD)',
      type: 'number',
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'latencyMs',
      label: 'Thời gian phản hồi (ms)',
      type: 'number',
      min: 0,
      defaultValue: 0,
    },
    { name: 'errorCode', label: 'Mã lỗi chuẩn hóa', type: 'text' },
    { name: 'errorCategory', label: 'Nhóm lỗi', type: 'text' },
    {
      name: 'guardrailTriggered',
      label: 'Cảnh báo bảo mật / Guardrail',
      type: 'text',
      index: true,
    },
    {
      name: 'querySummary',
      label: 'Tóm tắt ngắn đã ẩn danh (chỉ ghi khi cần rà soát chất lượng)',
      type: 'text',
      maxLength: 200,
    },
  ],
  versions: false,
}

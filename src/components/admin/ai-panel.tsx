'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type {
  AIConnectionStatus,
  AIQuickSuggestion,
  AISettingsData,
  RecommendationWeights,
} from '@/lib/ai/types'
import { api } from '@/lib/client-api'
import {
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  EmptyState,
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

type AdminAIDashboardPayload = {
  runtime: {
    envEnabled: boolean
    provider: string
    model: string
    configuredModelRaw?: string
    modelRemappedFromDeprecated?: boolean
    apiKeyConfigured: boolean
    connectionStatus: AIConnectionStatus
    connectionStatusLabel: string
    fallbackActive: boolean
    fallbackStatusLabel: string
    connectionDiagnosticNote: string
    healthSnapshot?: {
      lastCheckedAt: string | null
      lastLatencyMs: number | null
      verifiedLiveRequest: boolean
    }
    freeTierOnly: boolean
    paidProvidersAllowed: boolean
    fallbackEnabled: boolean
    documentedFreeTierModel: boolean
    geminiCapabilities: {
      label: string
      supportsFunctionCalling: boolean
      supportsStructuredOutputs: boolean
      documentedFreeTier: boolean
      docsUrl: string
    } | null
    billingStatus: string
    billingVerificationNote: string
    testMockEnabled: boolean
    storeConversations: boolean
    timeoutMs: number
    hardCaps: {
      maxOutputTokens: number
      maxToolRounds: number
      rateLimitPerMinute: number
      rateLimitPerDay: number
      projectRateLimitPerMinute?: number
      projectRateLimitPerDay?: number
      ipRateLimitPerMinute?: number
      ipRateLimitPerDay?: number
      dailyBudgetUsd: number
    }
    circuitBreaker: {
      open: boolean
      consecutiveFailures: number
      retryAfterSeconds: number
      lastErrorCode: string | null
    }
    pricingReferenceUsdPer1M: { input: number; output: number }
  }
  settings: AISettingsData
  effectiveConfig: {
    enabled: boolean
    configured: boolean
    freeTierOnly: boolean
    fallbackEnabled: boolean
    maxOutputTokens: number
    maxToolRounds: number
    rateLimitPerMinute: number
    rateLimitPerDay: number
    dailyBudgetUsd: number
    weights: RecommendationWeights
  }
  stats: {
    totalRequests: number
    fallbackRequests: number
    successRequests: number
    failedRequests: number
    blockedRequests: number
    rateLimitedRequests: number
    totalInputTokens: number
    totalOutputTokens: number
    totalTokens: number
    avgLatencyMs: number
    p95LatencyMs: number
    totalRecommendedVehicles: number
    vehicleClickCount: number
    checkoutHandoffCount: number
    checkoutConversionRate: number | null
    totalEstimatedCostUsd: number
    todayEstimatedCostUsd: number
    dailyBudgetUsd: number
    budgetUtilizationPct: number
    budgetWarning: boolean
    helpfulCount: number
    notHelpfulCount: number
    noResultCount: number
    intentBreakdown?: Record<string, number>
    costDisclaimer: string
  }
  recentErrors: {
    id: string
    requestId: string
    status: string
    errorCode: string | null
    errorCategory: string | null
    guardrailTriggered: string | null
    querySummary: string | null
    createdAt: string
  }[]
  noResultQueries: {
    id: string
    requestId: string
    intent: string | null
    querySummary: string
    createdAt: string
  }[]
  feedbackItems: {
    id: string
    requestId: string
    rating: string
    reasonCategory: string
    comment: string | null
    recommendedSlugs: string[]
    userType: string
    reviewStatus: string
    adminNote: string | null
    createdAt: string
  }[]
  canUpdate: boolean
}

function formatNum(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n)
}

function connectionBadgeTone(status: AIConnectionStatus): 'brand' | 'warning' | 'danger' | 'muted' {
  switch (status) {
    case 'GEMINI_CONNECTED':
    case 'MOCK_ACTIVE':
      return 'brand'
    case 'FALLBACK_ACTIVE':
    case 'QUOTA_EXCEEDED':
    case 'DISABLED':
      return 'warning'
    case 'API_CONFIG_MISSING':
    case 'CONNECTION_ERROR':
      return 'danger'
  }
}

export function AdminAIPanel() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'stats' | 'config' | 'quality'>('stats')
  const [data, setData] = useState<AdminAIDashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [testingConn, setTestingConn] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Editable form state (server credentials are strictly excluded from client state)
  const [enabled, setEnabled] = useState(true)
  const [greetingMessage, setGreetingMessage] = useState('')
  const [quickSuggestions, setQuickSuggestions] = useState<AIQuickSuggestion[]>([])
  const [maxOutputTokens, setMaxOutputTokens] = useState('1000')
  const [maxToolRounds, setMaxToolRounds] = useState('5')
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState('5')
  const [rateLimitPerDay, setRateLimitPerDay] = useState('30')
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState('5')
  const [weights, setWeights] = useState<RecommendationWeights>({
    budget: 35,
    purpose: 25,
    capacity: 20,
    rating: 10,
    fuel: 10,
  })
  const [knowledgeNote, setKnowledgeNote] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api<AdminAIDashboardPayload>('/dashboard/ai')
      setData(res)
      setEnabled(res.settings.enabled)
      setGreetingMessage(res.settings.greetingMessage)
      setQuickSuggestions(res.settings.quickSuggestions)
      setMaxOutputTokens(String(res.settings.maxOutputTokens))
      setMaxToolRounds(String(res.settings.maxToolRounds))
      setRateLimitPerMinute(String(res.settings.rateLimitPerMinute))
      setRateLimitPerDay(String(res.settings.rateLimitPerDay))
      setDailyBudgetUsd(String(res.settings.dailyBudgetUsd))
      setWeights(res.settings.weights)
      setKnowledgeNote(res.settings.knowledgeNote ?? '')
    } catch (err) {
      setError((err as Error).message || 'Không thể tải dữ liệu Quản trị Trợ lý AI.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault()
    if (!data?.canUpdate) return
    setSaving(true)
    try {
      const res = await api<{ message: string }>('/dashboard/ai', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled,
          greetingMessage,
          quickSuggestions,
          maxOutputTokens: Number(maxOutputTokens),
          maxToolRounds: Number(maxToolRounds),
          rateLimitPerMinute: Number(rateLimitPerMinute),
          rateLimitPerDay: Number(rateLimitPerDay),
          dailyBudgetUsd: Number(dailyBudgetUsd),
          weights,
          knowledgeNote,
        }),
      })
      toast(res.message || 'Đã lưu cấu hình AI thành công.', 'success')
      await loadData()
    } catch (err) {
      toast((err as Error).message || 'Lỗi khi lưu cấu hình AI.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTestingConn(true)
    setTestResult(null)
    try {
      const res = await api<{ ok: boolean; message: string; latencyMs: number }>(
        '/dashboard/ai/test',
        { method: 'POST', body: JSON.stringify({}) },
      )
      setTestResult({ ok: res.ok, message: res.message })
      toast(res.message, res.ok ? 'success' : 'error')
      await loadData()
    } catch (err) {
      const msg = (err as Error).message || 'Kiểm tra kết nối AI thất bại.'
      setTestResult({ ok: false, message: msg })
      toast(msg, 'error')
    } finally {
      setTestingConn(false)
    }
  }

  const handleReviewFeedback = async (
    feedbackId: string,
    reviewStatus: 'REVIEWED' | 'RESOLVED',
  ) => {
    try {
      await api('/dashboard/ai', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'review_feedback', feedbackId, reviewStatus }),
      })
      toast('Đã cập nhật trạng thái rà soát phản hồi.', 'success')
      await loadData()
    } catch (err) {
      toast((err as Error).message || 'Không thể cập nhật trạng thái phản hồi.', 'error')
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-14" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <EmptyState
        icon="alert"
        title="Không thể tải trung tâm quản trị AI"
        description={error || 'Đã xảy ra lỗi khi đọc cấu hình và thống kê AI.'}
      >
        <Button onClick={() => void loadData()}>Thử tải lại</Button>
      </EmptyState>
    )
  }

  const weightSum =
    weights.budget + weights.purpose + weights.capacity + weights.rating + weights.fuel

  return (
    <div className="space-y-6">
      {/* Header Status Strip */}
      <section className="rounded-card border border-line bg-canvas p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Heading as="h1" size="title">
                NORI AI Management Center
              </Heading>
              <Badge tone={data.effectiveConfig.enabled ? 'brand' : 'warning'}>
                {data.effectiveConfig.enabled ? 'Đang bật' : 'Đang tắt'}
              </Badge>
              <Badge
                data-testid="ai-connection-status-badge"
                tone={connectionBadgeTone(data.runtime.connectionStatus)}
              >
                {data.runtime.connectionStatusLabel}
              </Badge>
              {data.runtime.fallbackActive && (
                <Badge data-testid="ai-fallback-status-badge" tone="warning">
                  {data.runtime.fallbackStatusLabel}
                </Badge>
              )}
              {!data.runtime.fallbackActive && data.runtime.fallbackEnabled && (
                <Badge tone="muted">{data.runtime.fallbackStatusLabel}</Badge>
              )}
              {data.runtime.freeTierOnly && (
                <Badge tone="brand">Free Tier Only (Khóa trả phí)</Badge>
              )}
              {data.runtime.circuitBreaker.open && (
                <Badge tone="danger">
                  Circuit Breaker đang mở ({data.runtime.circuitBreaker.retryAfterSeconds}s)
                </Badge>
              )}
            </div>
            <Text className="text-small text-muted">
              Provider: <strong className="text-ink">{data.runtime.provider.toUpperCase()}</strong>{' '}
              (@google/genai) · Model: <strong className="text-ink">{data.runtime.model}</strong>
              {data.runtime.modelRemappedFromDeprecated && data.runtime.configuredModelRaw
                ? ` (tự động nâng cấp từ ${data.runtime.configuredModelRaw})`
                : ''}{' '}
              · Lưu hội thoại:{' '}
              <strong className="text-ink">
                {data.runtime.storeConversations ? 'Có (ẩn danh)' : 'Tắt (mặc định bảo mật)'}
              </strong>
            </Text>
            <Text className="text-caption text-muted">{data.runtime.connectionDiagnosticNote}</Text>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.canUpdate && (
              <Button
                variant="secondary"
                size="sm"
                loading={testingConn}
                onClick={() => void handleTestConnection()}
              >
                <Icon name="sparkles" className="size-4" />
                Kiểm tra kết nối {data.runtime.provider === 'openai' ? 'OpenAI' : 'Gemini'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => void loadData()}>
              <Icon name="refresh" className="size-4" />
              Làm mới
            </Button>
          </div>
        </div>

        {testResult && (
          <div className="mt-4">
            <Notice tone={testResult.ok ? 'success' : 'error'}>{testResult.message}</Notice>
          </div>
        )}

        <div className="mt-4">
          <Notice tone="info">
            <strong>Xác minh Cloud Billing & Free Tier:</strong>{' '}
            {data.runtime.billingVerificationNote}
          </Notice>
        </div>

        {data.stats.budgetWarning && (
          <div className="mt-4">
            <Notice tone="error">
              Cảnh báo ngân sách AI: Chi phí ước tính hôm nay đã đạt{' '}
              {data.stats.budgetUtilizationPct}% hạn mức ($
              {data.stats.todayEstimatedCostUsd.toFixed(4)} / $
              {data.stats.dailyBudgetUsd.toFixed(2)} USD).
            </Notice>
          </div>
        )}
      </section>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Phân mục quản trị AI"
        className="flex gap-6 border-b border-line"
      >
        <TabButton selected={tab === 'stats'} onClick={() => setTab('stats')}>
          Thống kê & Chi phí
        </TabButton>
        <TabButton selected={tab === 'config'} onClick={() => setTab('config')}>
          Cấu hình & Trọng số
        </TabButton>
        <TabButton selected={tab === 'quality'} onClick={() => setTab('quality')}>
          Chất lượng, Lỗi & Phản hồi ({data.feedbackItems.length})
        </TabButton>
      </div>

      {/* TAB 1: STATS & COST */}
      {tab === 'stats' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Tổng lượt yêu cầu AI</Text>
              <p className="mt-1 text-title font-semibold text-ink">
                {formatNum(data.stats.totalRequests)}
              </p>
              <Text className="mt-1 text-micro text-muted">
                Thành công: {formatNum(data.stats.successRequests)} · Fallback:{' '}
                {formatNum(data.stats.fallbackRequests)} · Lỗi:{' '}
                {formatNum(data.stats.failedRequests)} · Guardrail chặn:{' '}
                {formatNum(data.stats.blockedRequests)}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Tổng Token thực tế</Text>
              <p className="mt-1 text-title font-semibold text-ink">
                {formatNum(data.stats.totalTokens)}
              </p>
              <Text className="mt-1 text-micro text-muted">
                Input: {formatNum(data.stats.totalInputTokens)} · Output:{' '}
                {formatNum(data.stats.totalOutputTokens)}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Thời gian phản hồi</Text>
              <p className="mt-1 text-title font-semibold text-ink">
                {data.stats.avgLatencyMs > 0 ? `${formatNum(data.stats.avgLatencyMs)} ms` : '—'}
              </p>
              <Text className="mt-1 text-micro text-muted">
                p95:{' '}
                {data.stats.p95LatencyMs > 0 ? `${formatNum(data.stats.p95LatencyMs)} ms` : '—'}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Chuyển sang chế độ dự phòng</Text>
              <p className="mt-1 text-title font-semibold text-ink">
                {formatNum(data.stats.fallbackRequests)}
              </p>
              <Text className="mt-1 text-micro text-muted">
                Chính sách chi phí:{' '}
                {data.runtime.freeTierOnly
                  ? 'Free Tier ($0.00)'
                  : `$${data.stats.totalEstimatedCostUsd.toFixed(5)}`}
              </Text>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Lượt xe được đề xuất</Text>
              <p className="mt-1 text-title font-semibold text-ink">
                {formatNum(data.stats.totalRecommendedVehicles)}
              </p>
            </div>
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Lượt click vào xe đề xuất</Text>
              <p className="mt-1 text-title font-semibold text-ink">
                {formatNum(data.stats.vehicleClickCount)}
              </p>
            </div>
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Lượt chuyển đến Checkout</Text>
              <p className="mt-1 text-title font-semibold text-brand">
                {formatNum(data.stats.checkoutHandoffCount)}
              </p>
              <Text className="mt-1 text-micro text-muted">
                Tỷ lệ chuyển đổi:{' '}
                {data.stats.checkoutConversionRate !== null
                  ? `${data.stats.checkoutConversionRate}%`
                  : 'Chưa đủ dữ liệu'}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Đánh giá từ khách hàng</Text>
              <p className="mt-1 text-title font-semibold text-ink">
                {data.stats.helpfulCount} hữu ích / {data.stats.notHelpfulCount} chưa đạt
              </p>
              <Text className="mt-1 text-micro text-muted">
                Truy vấn không có kết quả: {data.stats.noResultCount}
              </Text>
            </div>
          </div>

          <Notice tone="info">
            {data.stats.costDisclaimer} (Đơn giá tham khảo cho <strong>{data.runtime.model}</strong>
            : ${data.runtime.pricingReferenceUsdPer1M.input}/1M input tokens · $
            {data.runtime.pricingReferenceUsdPer1M.output}/1M output tokens.)
          </Notice>

          {data.stats.intentBreakdown && Object.keys(data.stats.intentBreakdown).length > 0 && (
            <section className="rounded-card border border-line bg-canvas p-5">
              <Heading as="h2" size="subtitle" className="mb-3">
                Phân bổ ý định khách hàng (Intent Classification)
              </Heading>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.stats.intentBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([intentName, count]) => (
                    <span
                      key={intentName}
                      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-subtle px-3 py-1 text-caption font-medium text-ink"
                    >
                      <span>{intentName}</span>
                      <Badge tone="brand">{formatNum(count)}</Badge>
                    </span>
                  ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 2: CONFIGURATION */}
      {tab === 'config' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle" className="mb-3">
              Trạng thái bảo mật & Nhà cung cấp AI (Chỉ đọc)
            </Heading>
            <Notice tone="info" className="mb-4">
              Vì lý do bảo mật,{' '}
              <strong>khóa API Gemini ({data.runtime.provider.toUpperCase()})</strong> chỉ được cấu
              hình qua biến môi trường server hoặc Secret Manager — tuyệt đối không nhập, lưu
              database hoặc hiển thị trên Admin Dashboard.
            </Notice>
            <div className="grid gap-3 text-small sm:grid-cols-3">
              <div className="rounded-control bg-subtle p-3">
                <p className="text-micro text-muted">AI Provider</p>
                <p className="font-semibold text-ink">
                  {data.runtime.provider === 'gemini'
                    ? 'Google Gemini SDK (@google/genai)'
                    : 'OpenAI Responses API'}
                </p>
              </div>
              <div className="rounded-control bg-subtle p-3">
                <p className="text-micro text-muted">
                  Model đang dùng (
                  {data.runtime.provider === 'gemini' ? 'GEMINI_MODEL' : 'OPENAI_MODEL'})
                </p>
                <p className="font-semibold text-ink">
                  {data.runtime.model}
                  {data.runtime.documentedFreeTierModel ? ' (Free Tier allowlist)' : ''}
                </p>
              </div>
              <div className="rounded-control bg-subtle p-3">
                <p className="text-micro text-muted">Trạng thái API Key</p>
                <p className="font-semibold text-ink">
                  {data.runtime.apiKeyConfigured
                    ? 'Đã cấu hình trên server'
                    : data.runtime.fallbackEnabled
                      ? 'Chưa cấu hình (đang dùng Tư vấn cơ bản)'
                      : 'Chưa cấu hình (AI tạm ngưng)'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-line bg-canvas p-5 space-y-4">
            <Heading as="h2" size="subtitle">
              Bật/Tắt & Nội dung tương tác
            </Heading>
            <Checkbox
              id="ai-enabled-toggle"
              checked={enabled}
              disabled={!data.canUpdate}
              onChange={(e) => setEnabled(e.target.checked)}
              label="Bật Trợ lý AI NORI cho khách hàng trên website"
            />
            <Textarea
              id="ai-greeting"
              label="Lời chào mở đầu"
              rows={3}
              maxLength={500}
              disabled={!data.canUpdate}
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
            />
            <Textarea
              id="ai-knowledge-note"
              label="Ghi chú kiến thức công khai bổ sung (đã phê duyệt)"
              hint="Nội dung này sẽ được lọc an toàn chống Indirect Prompt Injection trước khi cung cấp cho AI."
              rows={3}
              maxLength={3000}
              disabled={!data.canUpdate}
              value={knowledgeNote}
              onChange={(e) => setKnowledgeNote(e.target.value)}
            />

            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between gap-2">
                <Text className="text-small font-semibold">
                  Gợi ý câu hỏi nhanh (Quick Suggestions)
                </Text>
                {data.canUpdate && quickSuggestions.length < 8 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setQuickSuggestions((prev) => [...prev, { label: '', prompt: '' }])
                    }
                  >
                    <Icon name="plus" className="size-3.5" /> Thêm gợi ý
                  </Button>
                )}
              </div>
              {quickSuggestions.map((item, idx) => (
                <div
                  key={idx}
                  className="grid gap-2 rounded-control border border-line p-3 sm:grid-cols-[1fr_2fr_auto]"
                >
                  <Input
                    id={`qs-label-${idx}`}
                    label="Nhãn hiển thị"
                    value={item.label}
                    disabled={!data.canUpdate}
                    onChange={(e) =>
                      setQuickSuggestions((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)),
                      )
                    }
                  />
                  <Input
                    id={`qs-prompt-${idx}`}
                    label="Nội dung gửi cho AI"
                    value={item.prompt}
                    disabled={!data.canUpdate}
                    onChange={(e) =>
                      setQuickSuggestions((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, prompt: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  {data.canUpdate && (
                    <div className="flex items-end">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setQuickSuggestions((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        Xóa
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-card border border-line bg-canvas p-5 space-y-4">
              <Heading as="h2" size="subtitle">
                Giới hạn chi phí & Rate Limit (trong ngưỡng an toàn server)
              </Heading>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="ai-max-tokens"
                  type="number"
                  min={200}
                  max={data.runtime.hardCaps.maxOutputTokens}
                  label="Max output tokens"
                  hint={`Trần server: ${data.runtime.hardCaps.maxOutputTokens}`}
                  disabled={!data.canUpdate}
                  value={maxOutputTokens}
                  onChange={(e) => setMaxOutputTokens(e.target.value)}
                />
                <Input
                  id="ai-max-rounds"
                  type="number"
                  min={1}
                  max={data.runtime.hardCaps.maxToolRounds}
                  label="Số vòng Function Calling tối đa"
                  hint={`Trần server: ${data.runtime.hardCaps.maxToolRounds}`}
                  disabled={!data.canUpdate}
                  value={maxToolRounds}
                  onChange={(e) => setMaxToolRounds(e.target.value)}
                />
                <Input
                  id="ai-rpm"
                  type="number"
                  min={1}
                  max={data.runtime.hardCaps.rateLimitPerMinute}
                  label="Giới hạn lượt / phút / phiên"
                  hint={`Trần server: ${data.runtime.hardCaps.rateLimitPerMinute}`}
                  disabled={!data.canUpdate}
                  value={rateLimitPerMinute}
                  onChange={(e) => setRateLimitPerMinute(e.target.value)}
                />
                <Input
                  id="ai-rpd"
                  type="number"
                  min={1}
                  max={data.runtime.hardCaps.rateLimitPerDay}
                  label="Giới hạn lượt / ngày / phiên"
                  hint={`Trần server: ${data.runtime.hardCaps.rateLimitPerDay}`}
                  disabled={!data.canUpdate}
                  value={rateLimitPerDay}
                  onChange={(e) => setRateLimitPerDay(e.target.value)}
                />
                <Input
                  id="ai-daily-budget"
                  type="number"
                  step="0.5"
                  min={0.5}
                  max={data.runtime.hardCaps.dailyBudgetUsd}
                  label="Ngân sách tối đa / ngày (USD)"
                  hint={`Trần server: $${data.runtime.hardCaps.dailyBudgetUsd}`}
                  disabled={!data.canUpdate}
                  value={dailyBudgetUsd}
                  onChange={(e) => setDailyBudgetUsd(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-card border border-line bg-canvas p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Heading as="h2" size="subtitle">
                  Trọng số Hybrid Recommendation Engine
                </Heading>
                <Badge tone={Math.abs(weightSum - 100) < 0.01 ? 'brand' : 'warning'}>
                  Tổng: {weightSum}%
                </Badge>
              </div>
              <Text className="text-caption text-muted">
                Hệ thống tự động chuẩn hóa tổng trọng số về 100% khi chấm điểm đề xuất xe.
              </Text>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  id="w-budget"
                  type="number"
                  min={0}
                  max={100}
                  label="Phù hợp ngân sách (%)"
                  disabled={!data.canUpdate}
                  value={String(weights.budget)}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, budget: Number(e.target.value) || 0 }))
                  }
                />
                <Input
                  id="w-purpose"
                  type="number"
                  min={0}
                  max={100}
                  label="Mục đích sử dụng (%)"
                  disabled={!data.canUpdate}
                  value={String(weights.purpose)}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, purpose: Number(e.target.value) || 0 }))
                  }
                />
                <Input
                  id="w-capacity"
                  type="number"
                  min={0}
                  max={100}
                  label="Sức chứa / số chỗ (%)"
                  disabled={!data.canUpdate}
                  value={String(weights.capacity)}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, capacity: Number(e.target.value) || 0 }))
                  }
                />
                <Input
                  id="w-rating"
                  type="number"
                  min={0}
                  max={100}
                  label="Đánh giá đã xác minh (%)"
                  disabled={!data.canUpdate}
                  value={String(weights.rating)}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, rating: Number(e.target.value) || 0 }))
                  }
                />
                <Input
                  id="w-fuel"
                  type="number"
                  min={0}
                  max={100}
                  label="Hiệu quả nhiên liệu (%)"
                  disabled={!data.canUpdate}
                  value={String(weights.fuel)}
                  onChange={(e) => setWeights((w) => ({ ...w, fuel: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>

          {data.canUpdate && (
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                Lưu cấu hình Trợ lý AI
              </Button>
            </div>
          )}
        </form>
      )}

      {/* TAB 3: QUALITY, ERRORS & FEEDBACK */}
      {tab === 'quality' && (
        <div className="space-y-6">
          <div className="rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle" className="mb-3">
              Nguồn kiến thức công khai đồng bộ với RAG
            </Heading>
            <div className="flex flex-wrap gap-2">
              <ButtonLink
                href="/dashboard/content"
                variant="secondary"
                className="min-h-control-sm px-3 py-2 text-caption"
              >
                Chính sách & FAQ (CMS)
              </ButtonLink>
              <ButtonLink
                href="/dashboard/posts"
                variant="secondary"
                className="min-h-control-sm px-3 py-2 text-caption"
              >
                Bài viết đã xuất bản
              </ButtonLink>
              <ButtonLink
                href="/dashboard/promotions"
                variant="secondary"
                className="min-h-control-sm px-3 py-2 text-caption"
              >
                Chương trình khuyến mãi
              </ButtonLink>
              <ButtonLink
                href="/dashboard/vehicles"
                variant="secondary"
                className="min-h-control-sm px-3 py-2 text-caption"
              >
                Kho xe & Giá thực tế
              </ButtonLink>
            </div>
          </div>

          {/* Feedback list */}
          <section className="rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle" className="mb-3">
              Phản hồi chất lượng từ khách hàng ({data.feedbackItems.length})
            </Heading>
            {data.feedbackItems.length === 0 ? (
              <Text className="text-small text-muted">Chưa có phản hồi nào từ khách hàng.</Text>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-caption">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-2 pr-3">Mã yêu cầu</th>
                      <th className="py-2 pr-3">Đánh giá</th>
                      <th className="py-2 pr-3">Phân loại</th>
                      <th className="py-2 pr-3">Góp ý</th>
                      <th className="py-2 pr-3">Trạng thái</th>
                      <th className="py-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.feedbackItems.map((fb) => (
                      <tr key={fb.id}>
                        <td className="py-2.5 pr-3 font-mono text-micro">{fb.requestId}</td>
                        <td className="py-2.5 pr-3">
                          <Badge tone={fb.rating === 'HELPFUL' ? 'brand' : 'danger'}>
                            {fb.rating === 'HELPFUL' ? 'Hữu ích' : 'Chưa hữu ích'}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3">{fb.reasonCategory}</td>
                        <td className="max-w-xs py-2.5 pr-3 text-muted">{fb.comment || '—'}</td>
                        <td className="py-2.5 pr-3">
                          <Badge tone={fb.reviewStatus === 'RESOLVED' ? 'brand' : 'warning'}>
                            {fb.reviewStatus}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          {data.canUpdate && fb.reviewStatus !== 'RESOLVED' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void handleReviewFeedback(fb.id, 'RESOLVED')}
                            >
                              Đánh dấu đã xử lý
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* No result queries + Errors */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-card border border-line bg-canvas p-5">
              <Heading as="h2" size="subtitle" className="mb-3">
                Truy vấn AI không tìm thấy kết quả ({data.noResultQueries.length})
              </Heading>
              {data.noResultQueries.length === 0 ? (
                <Text className="text-small text-muted">
                  Chưa ghi nhận trường hợp không có kết quả.
                </Text>
              ) : (
                <ul className="divide-y divide-line text-caption">
                  {data.noResultQueries.map((item) => (
                    <li key={item.id} className="py-2.5">
                      <p className="font-medium text-ink">{item.querySummary}</p>
                      <p className="text-micro text-muted">
                        {item.intent || 'GENERAL'} · {item.createdAt.slice(0, 19).replace('T', ' ')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-card border border-line bg-canvas p-5">
              <Heading as="h2" size="subtitle" className="mb-3">
                Sự cố AI & Cảnh báo bảo mật gần đây ({data.recentErrors.length})
              </Heading>
              {data.recentErrors.length === 0 ? (
                <Text className="text-small text-muted">
                  Chưa ghi nhận lỗi hoặc cảnh báo bảo mật.
                </Text>
              ) : (
                <ul className="divide-y divide-line text-caption">
                  {data.recentErrors.map((errItem) => (
                    <li key={errItem.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={errItem.status === 'BLOCKED' ? 'warning' : 'danger'}>
                          {errItem.guardrailTriggered || errItem.errorCode || errItem.status}
                        </Badge>
                        <span className="font-mono text-micro text-muted">{errItem.requestId}</span>
                      </div>
                      {errItem.errorCategory && (
                        <p className="mt-1 text-micro text-muted">{errItem.errorCategory}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

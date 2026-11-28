'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '@/components/auth-provider'
import type {
  AIBookingHandoff,
  AIChatResponsePayload,
  AIComparisonTable,
  AIPolicyCitation,
  AIQuickSuggestion,
  AIQuoteSummary,
  AIVehicleCard,
} from '@/lib/ai/types'
import { Badge, Button, ButtonLink, IconButton, Notice, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'
import { AIMarkdown } from './ai-markdown'
import {
  AIBookingHandoffCard,
  AIComparisonCard,
  AIPolicyCitationsList,
  AIQuoteCard,
  AIVehicleCards,
} from './ai-vehicle-cards'

type PublicAIConfig = {
  enabled: boolean
  configured: boolean
  ready: boolean
  fallbackEnabled?: boolean
  fallbackActive?: boolean
  freeTierOnly?: boolean
  provider: string
  model?: string
  greetingMessage: string
  quickSuggestions: AIQuickSuggestion[]
  fallbackLinks: { label: string; href: string }[]
  statusMessage: string | null
}

type ChatEntry = {
  id: string
  role: 'user' | 'assistant'
  content: string
  requestId?: string
  status?: AIChatResponsePayload['status']
  modeLabel?: string
  fallbackMode?: boolean
  vehicleCards?: AIVehicleCard[]
  comparison?: AIComparisonTable | null
  quote?: AIQuoteSummary | null
  bookingHandoff?: AIBookingHandoff | null
  citations?: AIPolicyCitation[]
  followUpSuggestions?: string[]
  disclaimer?: string
  feedbackSent?: 'HELPFUL' | 'NOT_HELPFUL'
  error?: {
    message: string
    retryable: boolean
    fallbackLinks?: { label: string; href: string }[]
    originalPrompt: string
  }
}

function createClientSessionId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 16)
    : `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getOrCreateClientSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    const existing = window.sessionStorage.getItem('nori_ai_session_id')
    if (existing) return existing
    const created = createClientSessionId()
    window.sessionStorage.setItem('nori_ai_session_id', created)
    return created
  } catch {
    return createClientSessionId()
  }
}

function rotateClientSessionId(): string {
  const nextId = createClientSessionId()
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem('nori_ai_session_id', nextId)
    } catch {
      // ignore storage quota errors in private browsing
    }
  }
  return nextId
}

export function AIChatPanel({ onClose }: { onClose: () => void }) {
  const { user, isCustomer } = useAuth()
  const [config, setConfig] = useState<PublicAIConfig | null>(null)
  const [configError, setConfigError] = useState('')
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const listEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string>('')

  useEffect(() => {
    sessionIdRef.current = getOrCreateClientSessionId()
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Lock background scroll & sync visualViewport height on mobile virtual keyboard
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const syncViewport = () => {
      document.body.style.overflow = mq.matches ? 'hidden' : ''
      if (mq.matches && window.visualViewport) {
        setMobileViewportHeight(Math.round(window.visualViewport.height))
      } else {
        setMobileViewportHeight(null)
      }
    }
    syncViewport()
    mq.addEventListener('change', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    return () => {
      mq.removeEventListener('change', syncViewport)
      window.visualViewport?.removeEventListener('resize', syncViewport)
      document.body.style.overflow = ''
    }
  }, [])

  // Escape key closes chat panel cleanly
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Load safe public AI config once on open
  useEffect(() => {
    const controller = new AbortController()
    fetch('/nori-api/ai/config', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = (await res.json()) as { success?: boolean; data?: PublicAIConfig }
        if (!res.ok || !payload.success || !payload.data) {
          throw new Error('Không thể tải trạng thái Trợ lý AI.')
        }
        setConfig(payload.data)
        setConfigError('')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setConfigError((err as Error).message || 'Không thể kết nối đến Trợ lý AI NORI.')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const trackAttribution = useCallback(
    (eventType: 'VEHICLE_CLICK' | 'CHECKOUT_HANDOFF', modelSlug: string) => {
      if (!isOnline) return
      fetch('/nori-api/ai/event', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          modelSlug,
          sessionId: sessionIdRef.current,
        }),
        keepalive: true,
      }).catch(() => undefined)
    },
    [isOnline],
  )

  const sendMessage = useCallback(
    async (rawText: string) => {
      const prompt = rawText.trim()
      if (!prompt || sending) return
      if (!isOnline) {
        setMessages((prev) => [
          ...prev,
          {
            id: `u-${Date.now()}`,
            role: 'user',
            content: prompt,
          },
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: '',
            error: {
              message:
                'Thiết bị đang ngoại tuyến (offline). Trợ lý AI cần kết nối mạng để tra cứu dữ liệu xe thời gian thực.',
              retryable: true,
              originalPrompt: prompt,
            },
          },
        ])
        return
      }

      const historySnapshot = messages
        .filter((m) => !m.error && m.content.trim().length > 0)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }))

      const userEntry: ChatEntry = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: prompt,
      }
      setMessages((prev) => [...prev, userEntry])
      setInput('')
      setSending(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/nori-api/ai/chat', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: prompt,
            history: historySnapshot,
            sessionId: sessionIdRef.current,
          }),
        })

        const payload = (await res.json().catch(() => null)) as {
          success?: boolean
          data?: AIChatResponsePayload
          error?: {
            message?: string
            code?: string
            retryable?: boolean
            fallbackLinks?: { label: string; href: string }[]
          }
        } | null

        if (!res.ok || !payload?.success || !payload.data) {
          const errMsg =
            payload?.error?.message ||
            'Trợ lý AI hiện không thể xử lý yêu cầu. Bạn có thể thử lại hoặc dùng bộ lọc tìm xe.'
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: '',
              error: {
                message: errMsg,
                retryable: payload?.error?.retryable !== false,
                fallbackLinks: payload?.error?.fallbackLinks,
                originalPrompt: prompt,
              },
            },
          ])
          return
        }

        const data = payload.data
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${data.requestId}`,
            role: 'assistant',
            content: data.reply,
            requestId: data.requestId,
            status: data.status,
            modeLabel: data.modeLabel,
            fallbackMode: data.fallbackMode,
            vehicleCards: data.vehicleCards,
            comparison: data.comparison,
            quote: data.quote,
            bookingHandoff: data.bookingHandoff,
            citations: data.citations,
            followUpSuggestions: data.followUpSuggestions,
            disclaimer: data.disclaimer,
          },
        ])
      } catch (err) {
        if (controller.signal.aborted) {
          setMessages((prev) => [
            ...prev,
            {
              id: `abort-${Date.now()}`,
              role: 'assistant',
              content: 'Đã dừng xử lý yêu cầu theo thao tác của bạn.',
            },
          ])
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: '',
              error: {
                message:
                  (err as Error).message ||
                  'Không thể kết nối đến máy chủ NORI. Vui lòng kiểm tra mạng và thử lại.',
                retryable: true,
                originalPrompt: prompt,
              },
            },
          ])
        }
      } finally {
        abortRef.current = null
        setSending(false)
      }
    },
    [isOnline, messages, sending],
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleReset = () => {
    abortRef.current?.abort()
    sessionIdRef.current = rotateClientSessionId()
    setMessages([])
    setInput('')
    setSending(false)
    inputRef.current?.focus()
  }

  const handleFeedback = async (
    entryId: string,
    requestId: string,
    rating: 'HELPFUL' | 'NOT_HELPFUL',
    recommendedSlugs: string[],
  ) => {
    setMessages((prev) => prev.map((m) => (m.id === entryId ? { ...m, feedbackSent: rating } : m)))
    try {
      await fetch('/nori-api/ai/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          rating,
          reasonCategory: rating === 'HELPFUL' ? 'ACCURATE' : 'OTHER',
          recommendedSlugs,
        }),
      })
    } catch {
      // ignore non-critical feedback network failure
    }
  }

  const handleCompareCard = (card: AIVehicleCard, allCards: AIVehicleCard[]) => {
    const other = allCards.find((c) => c.slug !== card.slug)
    const prompt = other
      ? `So sánh ${card.name} và ${other.name}`
      : `So sánh ${card.name} với một dòng xe cùng phân khúc`
    void sendMessage(prompt)
  }

  const isUnavailableBanner = config && !config.ready

  return (
    <section
      role="dialog"
      aria-label="Trợ lý AI NORI"
      data-testid="nori-ai-panel"
      style={mobileViewportHeight ? { height: `${mobileViewportHeight}px` } : undefined}
      className={[
        'fixed z-50 flex flex-col overflow-hidden bg-canvas text-ink shadow-float',
        // Mobile full-screen with safe-area & dynamic viewport height (keyboard-safe)
        'inset-0 h-[100dvh] w-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
        // Desktop floating expandable panel
        expanded
          ? 'md:inset-auto md:bottom-6 md:right-6 md:h-[min(740px,86dvh)] md:w-[min(700px,calc(100vw-3rem))] md:rounded-panel md:border md:border-line md:p-0'
          : 'md:inset-auto md:bottom-6 md:right-6 md:h-[min(640px,82dvh)] md:w-[420px] md:rounded-panel md:border md:border-line md:p-0',
      ].join(' ')}
    >
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-night px-4 py-3 text-inverse">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand text-inverse">
            <Icon name="sparkles" className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-body font-semibold text-inverse">Trợ lý AI NORI</h2>
              <span className="rounded-pill bg-brand-bright/20 px-2 py-0.5 text-[10px] font-semibold text-brand-bright">
                {!isOnline
                  ? 'Ngoại tuyến'
                  : config?.fallbackActive
                    ? 'Tư vấn cơ bản'
                    : config?.ready
                      ? 'Sẵn sàng'
                      : config
                        ? 'Tạm ngưng'
                        : 'Đang kết nối'}
              </span>
            </div>
            <p className="truncate text-micro text-on-night-muted">
              {isCustomer && user
                ? `Tư vấn cho ${user.fullName || user.email}`
                : 'Tư vấn chọn xe, lịch trống & báo giá thực tế'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleReset}
            title="Bắt đầu hội thoại mới"
            aria-label="Bắt đầu hội thoại mới"
            className="inline-flex size-touch items-center justify-center rounded-control text-on-night-muted transition-colors hover:bg-night-soft hover:text-inverse"
          >
            <Icon name="refresh" className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Thu gọn khung trò chuyện' : 'Mở rộng khung trò chuyện'}
            aria-label={expanded ? 'Thu gọn khung trò chuyện' : 'Mở rộng khung trò chuyện'}
            className="hidden size-touch items-center justify-center rounded-control text-on-night-muted transition-colors hover:bg-night-soft hover:text-inverse md:inline-flex"
          >
            <Icon name={expanded ? 'minimize' : 'maximize'} className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Đóng Trợ lý AI"
            aria-label="Đóng Trợ lý AI"
            className="inline-flex size-touch items-center justify-center rounded-control text-on-night-muted transition-colors hover:bg-night-soft hover:text-inverse"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>
      </header>

      {/* Message Body */}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 space-y-4 overflow-y-auto bg-subtle/40 px-4 py-4"
      >
        {!isOnline && (
          <Notice tone="error">
            Bạn đang ngoại tuyến (Offline). Trợ lý AI cần kết nối mạng để truy vấn dữ liệu xe thời
            gian thực.
          </Notice>
        )}

        {configError && <Notice tone="error">{configError}</Notice>}

        {isUnavailableBanner && (
          <div className="space-y-3 rounded-card border border-line bg-canvas p-4">
            <Notice tone="info">
              {config.statusMessage ||
                'Trợ lý AI hiện chưa sẵn sàng. Bạn vẫn có thể sử dụng đầy đủ bộ lọc và đặt xe trên NORI.'}
            </Notice>
            <div className="flex flex-wrap gap-2">
              {config.fallbackLinks.map((lnk) => (
                <ButtonLink
                  key={lnk.href}
                  href={lnk.href}
                  variant="secondary"
                  onClick={onClose}
                  className="min-h-control-sm px-3 py-2 text-caption"
                >
                  {lnk.label}
                </ButtonLink>
              ))}
            </div>
          </div>
        )}

        {/* Greeting & Quick Suggestions */}
        <div className="rounded-card border border-line bg-canvas p-3.5 shadow-card">
          <div className="mb-1.5 flex items-center gap-2">
            <Badge tone="brand">NORI AI</Badge>
            <span className="text-micro text-muted">Dữ liệu đồng bộ trực tiếp từ hệ thống</span>
          </div>
          <Text className="text-small text-ink">
            {config?.greetingMessage ||
              'Xin chào! Tôi là Trợ lý AI của NORI. Tôi có thể giúp bạn tìm xe phù hợp nhu cầu & ngân sách, kiểm tra lịch trống, tính báo giá thuê xe và giải đáp chính sách.'}
          </Text>

          {messages.length === 0 && (config?.quickSuggestions?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Gợi ý câu hỏi nhanh">
              {config!.quickSuggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={sending || !config?.ready || !isOnline}
                  onClick={() => void sendMessage(s.prompt)}
                  className="min-h-control-sm rounded-pill border border-line bg-subtle px-3 py-1.5 text-left text-caption font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand disabled:opacity-45"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-card rounded-br-sm bg-brand px-3.5 py-2.5 text-small text-inverse">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id} data-testid="ai-assistant-message" className="space-y-2">
              {msg.error ? (
                <div className="space-y-2.5 rounded-card border border-danger/25 bg-canvas p-3.5">
                  <Notice tone="error">{msg.error.message}</Notice>
                  <div className="flex flex-wrap gap-2">
                    {msg.error.retryable && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={sending}
                        onClick={() => void sendMessage(msg.error!.originalPrompt)}
                      >
                        <Icon name="refresh" className="size-3.5" />
                        Thử lại
                      </Button>
                    )}
                    {(msg.error.fallbackLinks ?? config?.fallbackLinks ?? []).map((lnk) => (
                      <ButtonLink
                        key={lnk.href}
                        href={lnk.href}
                        variant="ghost"
                        onClick={onClose}
                        className="min-h-control-sm px-3 py-2 text-caption"
                      >
                        {lnk.label}
                      </ButtonLink>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-card border border-line bg-canvas p-3.5 shadow-card">
                  {(msg.fallbackMode || msg.status === 'DEGRADED') && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone="warning">{msg.modeLabel || 'Chế độ tư vấn cơ bản'}</Badge>
                      <span className="text-micro text-muted">
                        Dữ liệu xe & giá thuê trực tiếp từ NORI
                      </span>
                    </div>
                  )}
                  <AIMarkdown content={msg.content} onNavigate={onClose} />

                  {msg.quote && (
                    <AIQuoteCard
                      quote={msg.quote}
                      onNavigate={onClose}
                      onTrackEvent={trackAttribution}
                    />
                  )}

                  {msg.comparison && (
                    <AIComparisonCard comparison={msg.comparison} onNavigate={onClose} />
                  )}

                  {msg.vehicleCards && msg.vehicleCards.length > 0 && (
                    <AIVehicleCards
                      cards={msg.vehicleCards}
                      onCompare={handleCompareCard}
                      onNavigate={onClose}
                      onTrackEvent={trackAttribution}
                    />
                  )}

                  {msg.bookingHandoff && (
                    <AIBookingHandoffCard
                      handoff={msg.bookingHandoff}
                      onNavigate={onClose}
                      onTrackEvent={trackAttribution}
                    />
                  )}

                  {msg.citations && msg.citations.length > 0 && (
                    <AIPolicyCitationsList citations={msg.citations} onNavigate={onClose} />
                  )}

                  {msg.followUpSuggestions && msg.followUpSuggestions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
                      {msg.followUpSuggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={sending}
                          onClick={() => void sendMessage(s)}
                          className="rounded-pill border border-line bg-subtle px-2.5 py-1 text-micro font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {msg.requestId && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-micro text-muted">
                      <span>Phản hồi này có hữu ích không?</span>
                      {msg.feedbackSent ? (
                        <span className="font-medium text-brand">
                          Đã ghi nhận đánh giá (
                          {msg.feedbackSent === 'HELPFUL' ? 'Hữu ích' : 'Cần cải thiện'})
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <IconButton
                            icon="thumbs-up"
                            label="Đánh giá hữu ích"
                            className="size-8 border-line"
                            onClick={() =>
                              void handleFeedback(
                                msg.id,
                                msg.requestId!,
                                'HELPFUL',
                                (msg.vehicleCards ?? []).map((c) => c.slug),
                              )
                            }
                          />
                          <IconButton
                            icon="thumbs-down"
                            label="Đánh giá chưa hữu ích"
                            className="size-8 border-line"
                            onClick={() =>
                              void handleFeedback(
                                msg.id,
                                msg.requestId!,
                                'NOT_HELPFUL',
                                (msg.vehicleCards ?? []).map((c) => c.slug),
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ),
        )}

        {sending && (
          <div
            role="status"
            aria-busy="true"
            className="flex items-center justify-between gap-3 rounded-card border border-line bg-canvas px-3.5 py-3 text-caption text-muted"
          >
            <div className="flex items-center gap-2">
              <Icon name="loader" className="size-4 animate-spin text-brand" />
              <span>Trợ lý AI NORI đang tra cứu dữ liệu xe & tính toán...</span>
            </div>
            <Button size="sm" variant="ghost" onClick={handleStop} className="min-h-8 px-2.5 py-1">
              Dừng
            </Button>
          </div>
        )}

        <div ref={listEndRef} />
      </div>

      {/* Input Composer */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-line bg-canvas px-3 py-2.5">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="nori-ai-input" className="sr-only">
              Nhập nhu cầu thuê xe hoặc câu hỏi cho Trợ lý AI NORI
            </label>
            <textarea
              ref={inputRef}
              id="nori-ai-input"
              rows={1}
              maxLength={1000}
              disabled={sending || !isOnline || Boolean(isUnavailableBanner)}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage(input)
                }
              }}
              placeholder={
                !isOnline
                  ? 'Đang ngoại tuyến...'
                  : isUnavailableBanner
                    ? 'Trợ lý AI hiện đang tạm ngưng...'
                    : 'Nhập nhu cầu thuê xe, ngân sách, ngày thuê...'
              }
              className="min-h-touch max-h-28 w-full resize-none rounded-control border border-control-line bg-canvas px-3 py-2.5 text-lead text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:bg-subtle sm:text-body"
            />
          </div>
          <Button
            type="submit"
            disabled={!input.trim() || sending || !isOnline || Boolean(isUnavailableBanner)}
            aria-label="Gửi câu hỏi"
            className="size-touch shrink-0 p-0"
          >
            <Icon name="send" className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          Báo giá & lịch trống từ AI mang tính tham khảo; Checkout sẽ kiểm tra lại nguyên tử.
        </p>
      </form>
    </section>
  )
}

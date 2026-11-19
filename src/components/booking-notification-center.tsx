'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { NotificationView } from '@/lib/domain-types'
import { api } from '@/lib/client-api'
import { formatDate } from '@/lib/rental-rules'
import { useAuth } from './auth-provider'
import { Badge, Button, ButtonLink, Heading, Notice, Text } from './ui'
import { Dialog } from './ui/dialog'
import { Icon } from './ui/icon'

type NotificationContextValue = {
  items: NotificationView[]
  unreadCount: number
  loading: boolean
  error: string
  refreshNotifications: () => Promise<void>
  openNotificationDetail: (item: NotificationView) => void
  markAllRead: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue>({
  items: [],
  unreadCount: 0,
  loading: false,
  error: '',
  refreshNotifications: async () => {},
  openNotificationDetail: () => {},
  markAllRead: async () => {},
})

function ackKey(userId: string, notifId: string) {
  return `nori_popup_ack_${userId}_${notifId}`
}

function hasLocalAck(userId: string, notifId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(ackKey(userId, notifId)) === '1'
  } catch {
    return false
  }
}

function setLocalAck(userId: string, notifId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ackKey(userId, notifId), '1')
  } catch {
    // ignore storage errors
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const [items, setItems] = useState<NotificationView[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [popupItem, setPopupItem] = useState<NotificationView | null>(null)
  const [ackBusy, setAckBusy] = useState(false)
  const [ackError, setAckError] = useState('')

  const isCustomer = Boolean(user && !user.isAdmin)
  const inFlightRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastVisFetchRef = useRef(0)

  const fetchNotifications = useCallback(async () => {
    if (!user || user.isAdmin) {
      setItems([])
      setUnreadCount(0)
      setPopupItem(null)
      setError('')
      return
    }
    if (inFlightRef.current) return
    inFlightRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    try {
      const res = await api<{
        items: NotificationView[]
        unreadCount: number
        activePopup: NotificationView | null
      }>('/notifications', { signal: controller.signal, timeoutMs: 12_000 })
      if (controller.signal.aborted) return
      setItems(res.items)
      setUnreadCount(res.unreadCount)
      if (res.activePopup && !hasLocalAck(user.id, res.activePopup.id)) {
        setPopupItem((current) => current ?? res.activePopup)
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return
      }
      setError((err as Error).message || 'Chưa thể đồng bộ thông báo.')
    } finally {
      inFlightRef.current = false
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [user])

  useEffect(() => {
    if (!isCustomer) {
      abortRef.current?.abort()
      setItems([])
      setUnreadCount(0)
      setPopupItem(null)
      return
    }
    void fetchNotifications()

    const onVisibility = () => {
      if (!document.hidden && Date.now() - lastVisFetchRef.current > 5_000) {
        lastVisFetchRef.current = Date.now()
        void fetchNotifications()
      }
    }
    const onManualRefresh = () => {
      void fetchNotifications()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('nori:notifications-refresh', onManualRefresh)

    const timer = setInterval(() => {
      if (!document.hidden && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        void fetchNotifications()
      }
    }, 60_000)

    return () => {
      clearInterval(timer)
      abortRef.current?.abort()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('nori:notifications-refresh', onManualRefresh)
    }
  }, [isCustomer, fetchNotifications])

  const acknowledgePopup = useCallback(
    async (navigateTo?: string) => {
      if (!popupItem || !user) {
        setPopupItem(null)
        return
      }
      const targetId = popupItem.id
      setAckBusy(true)
      setAckError('')
      setLocalAck(user.id, targetId)
      try {
        await api('/notifications', {
          method: 'PATCH',
          body: JSON.stringify({
            id: targetId,
            markRead: true,
            dismissPopup: true,
          }),
        })
        setItems((prev) =>
          prev.map((item) =>
            item.id === targetId ? { ...item, isRead: true, popupDismissed: true } : item,
          ),
        )
        setUnreadCount((prev) => Math.max(0, prev - (popupItem.isRead ? 0 : 1)))
        setPopupItem(null)
        if (navigateTo) {
          router.push(navigateTo)
        }
      } catch (err) {
        setAckError(
          (err as Error).message ||
            'Chưa thể lưu trạng thái đã đọc. Bạn vẫn có thể đóng hộp thoại.',
        )
      } finally {
        setAckBusy(false)
      }
    },
    [popupItem, user, router],
  )

  const openNotificationDetail = useCallback(
    (item: NotificationView) => {
      setAckError('')
      setPopupItem(item)
      if (!item.isRead && user) {
        setLocalAck(user.id, item.id)
        void api('/notifications', {
          method: 'PATCH',
          body: JSON.stringify({ id: item.id, markRead: true, dismissPopup: true }),
        }).then(() => {
          setItems((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, isRead: true, popupDismissed: true } : n)),
          )
          setUnreadCount((prev) => Math.max(0, prev - 1))
        })
      }
    },
    [user],
  )

  const markAllRead = useCallback(async () => {
    if (!user || user.isAdmin) return
    try {
      await api('/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ markAllRead: true, dismissPopup: true }),
      })
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true, popupDismissed: true })))
      setUnreadCount(0)
    } catch {
      // ignore transient error
    }
  }, [user])

  const hidePopupOnAdmin = pathname?.startsWith('/dashboard')

  return (
    <NotificationContext.Provider
      value={{
        items,
        unreadCount,
        loading,
        error,
        refreshNotifications: fetchNotifications,
        openNotificationDetail,
        markAllRead,
      }}
    >
      {children}

      {!hidePopupOnAdmin && popupItem && (
        <Dialog
          open={Boolean(popupItem)}
          onClose={() => {
            if (ackError) {
              setPopupItem(null)
              setAckError('')
              return
            }
            void acknowledgePopup()
          }}
          title="Đơn thuê của bạn đã được xác nhận!"
        >
          <div className="space-y-4 text-small">
            <div className="flex items-start gap-3.5 rounded-card bg-soft p-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-brand text-inverse shadow-xs">
                <Icon name="check" className="size-5" />
              </div>
              <div className="space-y-2 leading-relaxed text-ink">
                <p className="font-semibold">Cảm ơn quý khách đã lựa chọn NORI.</p>
                <p className="text-muted">
                  Đơn thuê của quý khách đã được xác nhận. Nhân viên NORI sẽ liên hệ tư vấn và hướng
                  dẫn các bước tiếp theo trong khung giờ hành chính của ngày hôm sau.
                </p>
                <p className="text-muted">
                  Quý khách vui lòng chú ý điện thoại để không bỏ lỡ cuộc gọi từ nhân viên hỗ trợ.
                </p>
                <p className="font-medium text-brand">
                  NORI hân hạnh đồng hành cùng quý khách trên mọi hành trình.
                </p>
              </div>
            </div>

            {popupItem.isUrgent && (
              <Notice tone="info">
                <strong>Hướng dẫn đơn nhận xe sớm:</strong> Do thời điểm nhận xe diễn ra gần, đơn
                thuê của quý khách đã được gắn nhãn ưu tiên xử lý. Quý khách có thể chủ động liên hệ{' '}
                {popupItem.hotline ? `Hotline ${popupItem.hotline}` : 'Trung tâm hỗ trợ NORI'} để
                được hướng dẫn thủ tục nhận xe nhanh hơn.
              </Notice>
            )}

            <dl className="grid grid-cols-1 gap-3 rounded-card border border-line bg-subtle p-4 sm:grid-cols-2">
              <div>
                <dt className="text-micro text-muted">Mã đơn thuê</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {popupItem.bookingKey || 'Đang cập nhật'}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-muted">Tên phương tiện</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {popupItem.vehicleName || 'Phương tiện NORI'}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-muted">Ngày nhận xe</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {formatDate(popupItem.startDate)}
                  {popupItem.pickupTime ? ` · ${popupItem.pickupTime}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-muted">Ngày trả xe</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {formatDate(popupItem.endDate)}
                  {popupItem.returnTime ? ` · ${popupItem.returnTime}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-muted">Ngày dự kiến nhân viên liên hệ</dt>
                <dd className="mt-0.5 font-semibold text-brand">
                  {formatDate(popupItem.expectedContactDate)}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-muted">Khung giờ làm việc</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {popupItem.workingHoursLabel || 'Trong khung giờ hành chính'}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-muted">Số điện thoại liên hệ</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {popupItem.customerPhoneMasked || 'Theo hồ sơ tài khoản'}
                </dd>
              </div>
              {popupItem.hotline && (
                <div>
                  <dt className="text-micro text-muted">Hotline hỗ trợ NORI</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{popupItem.hotline}</dd>
                </div>
              )}
            </dl>

            {!popupItem.paymentConfirmed && (
              <Text className="rounded-control border border-line bg-canvas px-3.5 py-2.5 text-micro text-muted">
                Lưu ý: Xác nhận đơn thuê chưa bao gồm xác nhận đã thanh toán. Nhân viên tư vấn sẽ
                hướng dẫn chi tiết thủ tục đặt cọc và hợp đồng khi liên hệ.
              </Text>
            )}

            {ackError && <Notice tone="error">{ackError}</Notice>}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={ackBusy}
                onClick={() => void acknowledgePopup('/support#contact')}
              >
                <Icon name="headphones" className="size-4" />
                Liên hệ NORI
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={ackBusy}
                onClick={() =>
                  void acknowledgePopup(
                    popupItem.bookingId
                      ? `/my-bookings?detail=${encodeURIComponent(popupItem.bookingId)}`
                      : '/my-bookings',
                  )
                }
              >
                Xem chi tiết đơn thuê
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={ackBusy}
                onClick={() => void acknowledgePopup()}
              >
                Tôi đã hiểu
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)

export function CustomerNotificationBell() {
  const { user } = useAuth()
  const {
    items,
    unreadCount,
    loading,
    error,
    refreshNotifications,
    openNotificationDetail,
    markAllRead,
  } = useNotifications()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user || user.isAdmin) return null

  const visibleItems = items.filter((i) => !i.superseded)

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) void refreshNotifications()
        }}
        aria-expanded={open}
        aria-label={
          unreadCount > 0 ? `Thông báo của bạn (${unreadCount} chưa đọc)` : 'Thông báo của bạn'
        }
        className="relative inline-flex size-touch items-center justify-center rounded-control text-ink hover:bg-subtle focus-visible:outline-2"
      >
        <Icon name="bell" className="size-5 text-brand" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-bold leading-4 text-inverse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Danh sách thông báo"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-canvas p-4 shadow-float sm:w-96 z-50"
        >
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-2.5">
            <Heading as="h2" size="body" className="font-semibold">
              Thông báo của bạn
            </Heading>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-micro font-semibold text-brand hover:underline"
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>

          {error ? (
            <div className="space-y-2 py-2">
              <Notice tone="error">{error}</Notice>
              <Button size="sm" variant="secondary" onClick={() => void refreshNotifications()}>
                Thử tải lại
              </Button>
            </div>
          ) : loading && visibleItems.length === 0 ? (
            <Text className="py-6 text-center text-caption text-muted">Đang tải thông báo…</Text>
          ) : visibleItems.length === 0 ? (
            <Text className="py-6 text-center text-caption text-muted">
              Chưa có thông báo mới. Thông báo xác nhận đơn thuê sẽ hiển thị tại đây.
            </Text>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {visibleItems.slice(0, 10).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    openNotificationDetail(item)
                  }}
                  className={`w-full rounded-control border p-3 text-left transition-colors ${
                    item.isRead
                      ? 'border-line bg-canvas hover:bg-subtle'
                      : 'border-brand/40 bg-brand-soft/60 hover:bg-brand-soft'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-semibold text-ink">{item.title}</span>
                    {!item.isRead && <Badge tone="brand">Mới</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-micro text-muted">{item.message}</p>
                  <span className="mt-1.5 block text-[11px] text-muted">
                    {formatDate(item.createdAt)}
                    {item.bookingKey ? ` · ${item.bookingKey.slice(0, 11).toUpperCase()}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 border-t border-line pt-2.5 text-center">
            <ButtonLink
              href="/my-bookings"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="min-h-control-sm w-full justify-center text-caption"
            >
              Quản lý tất cả đơn thuê
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  )
}

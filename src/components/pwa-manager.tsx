'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from './ui'
import { Icon } from './ui/icon'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const INSTALL_DISMISSED_KEY = 'nori_pwa_install_dismissed'

export function PwaManager() {
  const pathname = usePathname()
  const [offline, setOffline] = useState(false)
  const [updateReady, setUpdateReady] = useState<ServiceWorkerRegistration | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosGuideOpen, setIosGuideOpen] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false)
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    const wasDismissed =
      typeof window !== 'undefined' && window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'
    setDismissed(wasDismissed)

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // Register Service Worker in production or when supported
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          if (registration.waiting) {
            setUpdateReady(registration)
          }
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing
            if (!installing) return
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateReady(registration)
              }
            })
          })
        })
        .catch(() => undefined)
    }

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    }
  }, [])

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true)

  const isIosSafari =
    typeof window !== 'undefined' &&
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS/.test(window.navigator.userAgent)

  function dismissInstall() {
    setDismissed(true)
    setInstallPrompt(null)
    setIosGuideOpen(false)
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    } catch {
      // ignore storage errors
    }
  }

  async function triggerInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null)
    }
  }

  function applyUpdate() {
    if (updateReady?.waiting) {
      updateReady.waiting.postMessage({ type: 'SKIP_WAITING' })
      window.location.reload()
    }
  }

  if (pathname?.startsWith('/dashboard')) return null

  return (
    <>
      {offline && (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-center text-caption font-medium text-warning"
        >
          <Icon name="alert" className="size-4 shrink-0" />
          <span>
            Bạn đang mất kết nối Internet. Giá xe, lịch trống và chức năng đặt xe tạm thời không khả
            dụng.
          </span>
        </div>
      )}

      {updateReady && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 flex max-w-sm items-center gap-3 rounded-card border border-brand/30 bg-night px-4 py-3 text-small text-inverse shadow-float lg:bottom-5"
        >
          <span className="flex-1">NORI có phiên bản cập nhật mới.</span>
          <Button size="sm" onClick={applyUpdate} className="shrink-0">
            Cập nhật
          </Button>
        </div>
      )}

      {!isStandalone && !dismissed && installPrompt && (
        <div
          role="region"
          aria-label="Cài đặt ứng dụng NORI"
          className="fixed bottom-20 left-4 right-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-card border border-line bg-canvas p-3.5 shadow-float lg:bottom-5 lg:left-auto lg:right-5"
        >
          <div className="min-w-0">
            <p className="text-small font-semibold text-ink">Cài đặt ứng dụng NORI</p>
            <p className="text-caption text-muted">Truy cập nhanh từ màn hình chính.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" onClick={triggerInstall}>
              Cài đặt
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Đóng gợi ý cài đặt"
              onClick={dismissInstall}
            >
              <Icon name="close" className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {!isStandalone && !dismissed && !installPrompt && isIosSafari && (
        <div
          role="region"
          aria-label="Hướng dẫn cài đặt trên iPhone"
          className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-md rounded-card border border-line bg-canvas p-3.5 shadow-float lg:hidden"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-small font-semibold text-ink">Thêm NORI vào màn hình chính</p>
              {iosGuideOpen ? (
                <p className="mt-1 text-caption leading-relaxed text-muted">
                  Nhấn biểu tượng <strong>Chia sẻ (Share)</strong> ở thanh trình duyệt Safari, sau
                  đó chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>.
                </p>
              ) : (
                <p className="mt-0.5 text-caption text-muted">Mở nhanh như ứng dụng trên iOS.</p>
              )}
            </div>
            <Button size="sm" variant="ghost" aria-label="Đóng hướng dẫn" onClick={dismissInstall}>
              <Icon name="close" className="size-4" />
            </Button>
          </div>
          {!iosGuideOpen && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2.5 w-full"
              onClick={() => setIosGuideOpen(true)}
            >
              Xem hướng dẫn cài đặt iOS
            </Button>
          )}
        </div>
      )}
    </>
  )
}

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
import { AUTH_INVALIDATED_EVENT } from '@/lib/client-api'

export type AppUser = {
  id: string
  fullName: string
  email: string
  phone?: string | null
  role?: 'CUSTOMER' | 'ADMIN'
  adminRole?: 'SUPER_ADMIN' | 'OPERATOR'
  permissions?: Record<string, string[]>
  isAdmin?: boolean
}

type AuthState = {
  user: AppUser | null
  isCustomer: boolean
  isAdmin: boolean
  loading: boolean
  refresh: () => Promise<AppUser | null>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  isCustomer: false,
  isAdmin: false,
  loading: true,
  refresh: async () => null,
  logout: async () => {},
})

export function clearAllCheckoutDrafts() {
  if (typeof window === 'undefined') return
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const key = window.sessionStorage.key(i)
      if (key && key.startsWith('nori_checkout_draft')) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const refreshSeqRef = useRef(0)
  const lastFocusSyncRef = useRef(0)
  const inFlightRefreshRef = useRef<Promise<AppUser | null> | null>(null)

  const refresh = useCallback(async (): Promise<AppUser | null> => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current
    }
    const seq = ++refreshSeqRef.current
    const task = (async (): Promise<AppUser | null> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await fetch('/nori-api/auth/me', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        })
        const result = await response.json()
        const nextUser: AppUser | null =
          response.ok && result?.success && result.data ? (result.data as AppUser) : null
        if (seq === refreshSeqRef.current) {
          setUser(nextUser)
        }
        return nextUser
      } catch {
        if (seq === refreshSeqRef.current) {
          setUser(null)
        }
        return null
      } finally {
        clearTimeout(timer)
        if (seq === refreshSeqRef.current) {
          setLoading(false)
        }
      }
    })()

    inFlightRefreshRef.current = task
    task.finally(() => {
      if (inFlightRefreshRef.current === task) {
        inFlightRefreshRef.current = null
      }
    })
    return task
  }, [])

  useEffect(() => {
    void refresh()

    const onInvalidated = () => {
      inFlightRefreshRef.current = null
      void refresh()
    }
    const onVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now()
        if (now - lastFocusSyncRef.current > 5000) {
          lastFocusSyncRef.current = now
          void refresh()
        }
      }
    }
    const onWindowFocus = () => {
      const now = Date.now()
      if (now - lastFocusSyncRef.current > 5000) {
        lastFocusSyncRef.current = now
        void refresh()
      }
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void refresh()
      }
    }

    window.addEventListener(AUTH_INVALIDATED_EVENT, onInvalidated)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('pageshow', onPageShow)

    return () => {
      window.removeEventListener(AUTH_INVALIDATED_EVENT, onInvalidated)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [refresh])

  const logout = useCallback(async () => {
    refreshSeqRef.current += 1
    inFlightRefreshRef.current = null
    const response = await fetch('/nori-api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Chưa thể đăng xuất. Vui lòng thử lại.')
    clearAllCheckoutDrafts()
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' })
    } catch {
      // ignore SW postMessage failure
    }
    setUser(null)
  }, [])

  const isCustomer = Boolean(user && user.role === 'CUSTOMER' && !user.isAdmin)
  const isAdmin = Boolean(user && (user.role === 'ADMIN' || user.isAdmin))

  return (
    <AuthContext.Provider value={{ user, isCustomer, isAdmin, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

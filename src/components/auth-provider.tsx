'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type AppUser = { id: string; fullName: string; email: string; phone?: string | null }
type AuthState = {
  user: AppUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}
const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/nori-api/auth/me', { cache: 'no-store' })
      const result = await response.json()
      setUser(response.ok ? result.data : null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const logout = useCallback(async () => {
    const response = await fetch('/nori-api/auth/logout', { method: 'POST' })
    if (!response.ok) throw new Error('Chưa thể đăng xuất. Vui lòng thử lại.')
    setUser(null)
  }, [])
  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

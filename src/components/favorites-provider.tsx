'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'nori_favorites_v1'

type FavoritesContextValue = {
  slugs: string[]
  hydrated: boolean
  isFavorite: (slug: string) => boolean
  toggleFavorite: (slug: string) => void
  clearFavorites: () => void
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setSlugs(
            parsed.filter((item): item is string => typeof item === 'string' && item.length > 0),
          )
        }
      }
    } catch {
      // ignore storage errors
    } finally {
      setHydrated(true)
    }
  }, [])

  const persist = useCallback((next: string[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore storage errors
    }
  }, [])

  const toggleFavorite = useCallback(
    (slug: string) => {
      setSlugs((prev) => {
        const next = prev.includes(slug) ? prev.filter((item) => item !== slug) : [slug, ...prev]
        persist(next)
        return next
      })
    },
    [persist],
  )

  const clearFavorites = useCallback(() => {
    setSlugs([])
    persist([])
  }, [persist])

  const value = useMemo<FavoritesContextValue>(
    () => ({
      slugs,
      hydrated,
      isFavorite: (slug: string) => slugs.includes(slug),
      toggleFavorite,
      clearFavorites,
    }),
    [slugs, hydrated, toggleFavorite, clearFavorites],
  )

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) {
    return {
      slugs: [],
      hydrated: false,
      isFavorite: () => false,
      toggleFavorite: () => undefined,
      clearFavorites: () => undefined,
    }
  }
  return ctx
}

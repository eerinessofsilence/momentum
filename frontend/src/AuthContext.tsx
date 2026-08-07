import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from './api'
import { ClientI18nProvider, translateClient } from './clientI18n'
import type { ClientLocale, Theme, User } from './types'

type RegisterPayload = { name: string; username: string; email: string; password: string }
export type AccountSettingsPayload = {
  name: string
  username: string
  email: string
  daily_send_limit: string
  monthly_send_limit: string
}

type AuthValue = {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  openClientProfile: (userId: number) => Promise<void>
  returnToStaff: () => Promise<void>
  setPreferences: (theme: Theme, sounds: boolean) => Promise<void>
  setLanguage: (language: ClientLocale) => Promise<void>
  updateAccountSettings: (payload: AccountSettingsPayload) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

function applyLanguage(language: ClientLocale) {
  document.documentElement.lang = language
  window.localStorage.setItem('momentum_client_locale', language)
}

function normalizeUser(user: User): User {
  return user.username.toLowerCase() === 'demo' ? { ...user, name: 'Demo' } : user
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [locale, setLocale] = useState<ClientLocale>(() => {
    const stored = window.localStorage.getItem('momentum_client_locale')
    return stored === 'fr' || stored === 'es' || stored === 'de' ? stored : 'en'
  })

  const selectLanguage = useCallback((language: ClientLocale) => {
    setLocale(language)
    applyLanguage(language)
  }, [])

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then(({ user: current }) => {
        setUser(normalizeUser(current))
        applyTheme(current.theme)
        selectLanguage(current.language)
      })
      .catch((error) => {
        if (!(error instanceof ApiError) || error.status !== 401) console.error(error)
        applyTheme('dark')
      })
      .finally(() => setLoading(false))
  }, [selectLanguage])

  const value = useMemo<AuthValue>(() => ({
    user: user ? normalizeUser(user) : null,
    loading,
    login: async (username, password) => {
      const result = await api<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      setUser(normalizeUser(result.user))
      applyTheme(result.user.theme)
      selectLanguage(result.user.language)
    },
    register: async (payload) => {
      const result = await api<{ user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setUser(normalizeUser(result.user))
      applyTheme(result.user.theme)
      selectLanguage(result.user.language)
    },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      applyTheme('dark')
    },
    openClientProfile: async (userId) => {
      const result = await api<{ user: User }>(`/staff/clients/${userId}/impersonate`, {
        method: 'POST',
      })
      setUser(normalizeUser(result.user))
      applyTheme(result.user.theme)
      selectLanguage(result.user.language)
    },
    returnToStaff: async () => {
      const result = await api<{ user: User }>('/auth/impersonation/exit', {
        method: 'POST',
      })
      setUser(normalizeUser(result.user))
      applyTheme(result.user.theme)
      selectLanguage(result.user.language)
    },
    setPreferences: async (theme, sounds) => {
      await api('/preferences', { method: 'PATCH', body: JSON.stringify({ theme, sounds }) })
      setUser((current) => current ? { ...current, theme, sounds } : current)
      applyTheme(theme)
    },
    setLanguage: async (language) => {
      if (user) {
        await api('/preferences', { method: 'PATCH', body: JSON.stringify({ language }) })
        setUser((current) => current ? { ...current, language } : current)
      }
      selectLanguage(language)
    },
    updateAccountSettings: async (payload) => {
      const result = await api<{ user: User }>('/account/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setUser(normalizeUser(result.user))
    },
  }), [loading, selectLanguage, user])

  const i18n = useMemo(() => ({ locale, t: (key: Parameters<typeof translateClient>[1], values?: Record<string, string | number>) => translateClient(locale, key, values) }), [locale])
  return <AuthContext.Provider value={value}><ClientI18nProvider value={i18n}>{children}</ClientI18nProvider></AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

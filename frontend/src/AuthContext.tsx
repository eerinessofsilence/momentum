import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from './api'
import type { Theme, User } from './types'

type RegisterPayload = { name: string; username: string; email: string; password: string }

type AuthValue = {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  setPreferences: (theme: Theme, sounds: boolean) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

function normalizeUser(user: User): User {
  return user.username.toLowerCase() === 'demo' ? { ...user, name: 'Demo' } : user
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then(({ user: current }) => {
        setUser(normalizeUser(current))
        applyTheme(current.theme)
      })
      .catch((error) => {
        if (!(error instanceof ApiError) || error.status !== 401) console.error(error)
        applyTheme('dark')
      })
      .finally(() => setLoading(false))
  }, [])

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
    },
    register: async (payload) => {
      const result = await api<{ user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setUser(normalizeUser(result.user))
      applyTheme(result.user.theme)
    },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      applyTheme('dark')
    },
    setPreferences: async (theme, sounds) => {
      await api('/preferences', { method: 'PATCH', body: JSON.stringify({ theme, sounds }) })
      setUser((current) => current ? { ...current, theme, sounds } : current)
      applyTheme(theme)
    },
  }), [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

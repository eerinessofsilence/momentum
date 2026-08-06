import {
  Question as CircleHelp,
  ArrowLeft,
  ClockCounterClockwise as Clock3,
  SquaresFour as LayoutDashboard,
  SignOut as LogOut,
  List as Menu,
  Gear as Settings,
  Wallet as WalletCards,
  X,
} from '@phosphor-icons/react'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { navigate } from '../router'
import type { ActionKind, VerificationStatus } from '../types'
import { ActionModal } from './ActionModal'
import { Brand } from './Brand'
import { Badge } from './UI'

export type ShellContext = {
  openAction: (kind: ActionKind, symbol?: string) => void
}
const ShellContextProvider = createContext<ShellContext | null>(null)

export function useShell() {
  const value = useContext(ShellContextProvider)
  if (!value) throw new Error('useShell must be used inside AppShell')
  return value
}

const navigation = [
  { to: '/app/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/app/wallets', label: 'My Wallets', icon: WalletCards },
  { to: '/app/history', label: 'History', icon: Clock3 },
  { to: '/app/support', label: 'Support', icon: CircleHelp },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  const { user, logout, returnToStaff } = useAuth()
  const [mobileMenu, setMobileMenu] = useState(false)
  const [action, setAction] = useState<{ kind: ActionKind; symbol?: string } | null>(null)
  const [supportUnread, setSupportUnread] = useState(0)
  const [verification, setVerification] = useState<VerificationStatus | null>(null)
  const [returningToStaff, setReturningToStaff] = useState(false)

  const refreshSupportUnread = useCallback(() => {
    if (path === '/app/support') {
      setSupportUnread(0)
      return
    }
    api<{ unread_count: number }>('/support/messages')
      .then(({ unread_count }) => setSupportUnread(unread_count))
      .catch(() => undefined)
  }, [path])

  useEffect(() => {
    refreshSupportUnread()
    const timer = window.setInterval(refreshSupportUnread, 15_000)
    const handleUnread = (event: Event) => {
      setSupportUnread((event as CustomEvent<number>).detail)
    }
    window.addEventListener('momentum:support-unread', handleUnread)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('momentum:support-unread', handleUnread)
    }
  }, [refreshSupportUnread])

  const refreshVerification = useCallback(() => {
    api<VerificationStatus>('/verification/status')
      .then(setVerification)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    refreshVerification()
    const timer = window.setInterval(refreshVerification, 30_000)
    window.addEventListener('momentum:data-changed', refreshVerification)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('momentum:data-changed', refreshVerification)
    }
  }, [refreshVerification])

  const signOut = async () => {
    await logout()
    navigate('/auth')
  }

  const exitClientProfile = async () => {
    if (returningToStaff) return
    setReturningToStaff(true)
    try {
      await returnToStaff()
      navigate('/staff')
    } finally {
      setReturningToStaff(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <Brand compact />
        <button className="icon-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu /></button>
      </header>
      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand-row"><Brand /><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><X /></button></div>
        </div>
        <nav className="sidebar-nav" aria-label="Primary">
          {navigation.map(({ to, label, icon: Icon }) => (
            <a
              key={to}
              href={to}
              onClick={(event) => { event.preventDefault(); setMobileMenu(false); navigate(to) }}
              className={`nav-item ${path === to ? 'active' : ''}`}
            >
              <Icon size={20} /><span>{label}</span>{to === '/app/support' && supportUnread > 0 && <Badge variant="accent" className="nav-badge" aria-label={`${supportUnread} unread support ${supportUnread === 1 ? 'message' : 'messages'}`}>{supportUnread > 99 ? '99+' : supportUnread}</Badge>}
            </a>
          ))}
        </nav>
        <div className="sidebar-account">
          {verification && verification.required > 0 && (
            <div className={`profile-verification ${verification.state}`}>
              <span>{verification.state === 'processing' ? 'Demo processing' : 'Confirmation codes'}</span>
              <strong>{verification.used} / {verification.required}</strong>
              <progress value={verification.used} max={verification.required} />
            </div>
          )}
          <div className="profile-card"><span className="avatar">{user?.name.slice(0, 1).toUpperCase()}</span><div><strong>{user?.name}</strong><small>@{user?.username}</small></div></div>
          {user?.impersonating && <button className="return-staff-button" disabled={returningToStaff} onClick={exitClientProfile}><ArrowLeft size={20} /> {returningToStaff ? 'Returning…' : 'Return to Operations'}</button>}
          <button className="signout-button" onClick={signOut}><LogOut size={20} /> Sign out</button>
        </div>
      </aside>
      <main className="app-main">
        <ShellContextProvider.Provider value={{ openAction: (kind: ActionKind, symbol?: string) => setAction({ kind, symbol }) }}>
          {children}
        </ShellContextProvider.Provider>
      </main>
      {action && <ActionModal kind={action.kind} initialSymbol={action.symbol} onClose={() => setAction(null)} />}
    </div>
  )
}

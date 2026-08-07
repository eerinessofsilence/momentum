import { type ComponentType, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { AppShell } from './components/AppShell'
import { MomentumMark } from './components/Brand'
import { AuthPage } from './pages/AuthPage'
import { HistoryPage } from './pages/HistoryPage'
import { OverviewPage } from './pages/OverviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { SupportPage } from './pages/SupportPage'
import { WalletsPage } from './pages/WalletsPage'
import { StaffPage } from './pages/StaffPage'
import { AccountStatusPage } from './pages/AccountStatusPage'
import { Spinner } from './components/UI'
import { useClientI18n } from './clientI18n'
import { navigate, usePathname } from './router'
import { translateStaff } from './staffI18n'

const pages: Record<string, ComponentType> = {
  '/app/overview': OverviewPage,
  '/app/wallets': WalletsPage,
  '/app/history': HistoryPage,
  '/app/support': SupportPage,
  '/app/settings': SettingsPage,
}

function ProtectedShell({ path }: { path: string }) {
  const { user, loading } = useAuth()
  const { t } = useClientI18n()
  const Page = pages[path] || OverviewPage
  useEffect(() => {
    if (!loading && !user) navigate('/auth', true)
    else if (!loading && user?.is_staff) navigate('/staff', true)
  }, [loading, user])
  if (loading) return <div className="app-loader"><MomentumMark className="loader-mark" /><Spinner label={t('loadingMomentum')} /><p>{t('loadingMomentum')}</p></div>
  if (!user) return null
  if (user.is_staff) return null
  if (user.account_status !== 'active') return <AccountStatusPage />
  return <AppShell path={path}><Page /></AppShell>
}

function StaffRoute() {
  const { user, loading } = useAuth()
  useEffect(() => {
    if (!loading && !user) navigate('/auth', true)
    else if (!loading && user && !user.is_staff) navigate('/app/overview', true)
  }, [loading, user])
  if (loading) return <div className="app-loader"><MomentumMark className="loader-mark" /><Spinner label={translateStaff('ru', 'loadingOperations')} /><p>{translateStaff('ru', 'loadingOperations')}</p></div>
  if (!user?.is_staff) return null
  return <StaffPage />
}

export default function App() {
  const path = usePathname()
  useEffect(() => {
    if (path !== '/auth' && path !== '/staff' && !path.startsWith('/app/')) navigate('/app/overview', true)
  }, [path])
  if (path === '/auth') return <AuthPage />
  if (path === '/staff') return <StaffRoute />
  return <ProtectedShell path={pages[path] ? path : '/app/overview'} />
}

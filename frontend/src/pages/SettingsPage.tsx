import { At as AtSign, ArrowSquareOut as ExternalLink, SignOut as LogOut, EnvelopeSimple as Mail, Moon, MagnifyingGlass as Search, Sun, SpeakerHigh as Volume2 } from '@phosphor-icons/react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { PageHeading } from '../components/PageParts'
import { navigate } from '../router'
import type { Theme } from '../types'

type AppConfig = { support_email: string; support_telegram: string; version: string }

export function SettingsPage() {
  const { user, setPreferences, logout } = useAuth()
  const [config, setConfig] = useState<AppConfig>({ support_email: 'support@momentum.local', support_telegram: '@momentum_support', version: '1.0.0' })
  const [theme, setTheme] = useState<Theme>(user?.theme || 'dark')
  const [sounds, setSounds] = useState(user?.sounds ?? true)
  const [hash, setHash] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { api<AppConfig>('/app-config').then(setConfig).catch(() => undefined) }, [])
  const persist = async (nextTheme: Theme, nextSounds: boolean) => { setTheme(nextTheme); setSounds(nextSounds); await setPreferences(nextTheme, nextSounds) }
  const lookup = (event: FormEvent) => { event.preventDefault(); setNotice(hash.trim() ? `Transaction ${hash.slice(0, 14)}${hash.length > 14 ? '…' : ''} has been added to this support session.` : 'Enter a transaction hash.') }
  const signOut = async () => { await logout(); navigate('/auth') }

  return (
    <div className="page-content settings-page">
      <PageHeading title="Settings" description="Account, preferences, limits, and support." />
      <section className="panel-card settings-card">
        <SettingsSection title="Profile">
          <SettingRow label="Name" value={user?.name || ''} />
          <SettingRow label="Username" value={`@${user?.username}`} />
          <SettingRow label="Email" value={user?.email || ''} />
          <SettingRow label="Account ID" value={`#${String(user?.id || 0).padStart(4, '0')}`} />
          <SettingRow label="Member since" value={user ? new Date(user.created_at).toLocaleString('en-GB') : ''} />
        </SettingsSection>
        <SettingsSection title="Network limits">
          <SettingRow label="Daily send limit" value="$1,000" />
          <SettingRow label="Monthly limit" value="$50,000" />
          <SettingRow label="Manual verification threshold" value="$10,000" />
        </SettingsSection>
        <SettingsSection title="Preferences">
          <div className="setting-row"><span><Moon size={18} /> Theme</span><div className="segmented-control"><button className={theme === 'dark' ? 'active' : ''} onClick={() => persist('dark', sounds)}><Moon size={15} /> Dark</button><button className={theme === 'light' ? 'active' : ''} onClick={() => persist('light', sounds)}><Sun size={15} /> Light</button></div></div>
          <div className="setting-row"><span><Volume2 size={18} /> Notification sounds</span><button className={`toggle ${sounds ? 'on' : ''}`} onClick={() => persist(theme, !sounds)} aria-pressed={sounds}><span /></button></div>
        </SettingsSection>
        <SettingsSection title="Help with a transaction">
          <p className="settings-copy">Need help with a transaction? Submit its hash and Momentum Support will review the details.</p>
          <form className="hash-form" onSubmit={lookup}><div className="hash-input"><Search size={18} /><input value={hash} onChange={(event) => setHash(event.target.value)} placeholder="Enter transaction hash" /></div><button className="button secondary">Submit hash</button></form>
          {notice && <div className="success-inline">{notice}</div>}
        </SettingsSection>
        <SettingsSection title="Contact Momentum">
          <div className="contact-grid"><a href={`mailto:${config.support_email}`} className="contact-card"><span><Mail /></span><div><strong>Email</strong><small>{config.support_email}</small></div><ExternalLink size={16} /></a><a href="https://t.me/momentum_support" target="_blank" rel="noreferrer" className="contact-card"><span><AtSign /></span><div><strong>Telegram</strong><small>{config.support_telegram}</small></div><ExternalLink size={16} /></a></div>
        </SettingsSection>
        <div className="settings-footer"><button className="button danger" onClick={signOut}><LogOut size={17} /> Sign out</button><span>Momentum v{config.version}</span></div>
      </section>
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) { return <section className="settings-section"><h2>{title}</h2>{children}</section> }
function SettingRow({ label, value }: { label: string; value: string }) { return <div className="setting-row"><span>{label}</span><strong>{value}</strong></div> }

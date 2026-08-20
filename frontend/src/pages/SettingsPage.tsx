import { Moon, Sun } from '@phosphor-icons/react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useAuth } from '../AuthContext'
import { localizeClientError, useClientI18n } from '../clientI18n'
import { CustomSelect } from '../components/CustomSelect'
import { PageHeading } from '../components/PageParts'
import { Button, Card, Input, ListRow, Notice, Tabs } from '../components/UI'
import { money } from '../format'
import type { ClientLocale, Theme } from '../types'

export function SettingsPage() {
  const { user, setPreferences, setLanguage, updateAccountSettings } = useAuth()
  const { locale, t } = useClientI18n()
  const [theme, setTheme] = useState<Theme>(user?.theme || 'dark')
  const [sounds, setSounds] = useState(user?.sounds ?? true)
  const [editing, setEditing] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountNotice, setAccountNotice] = useState('')
  const [accountError, setAccountError] = useState('')
  const [preferenceError, setPreferenceError] = useState('')
  const [name, setName] = useState(user?.name || '')
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [dailyLimit, setDailyLimit] = useState(user?.daily_send_limit || '0')
  const [monthlyLimit, setMonthlyLimit] = useState(user?.monthly_send_limit || '0')

  const persist = async (nextTheme: Theme, nextSounds: boolean) => {
    const previousTheme = theme
    const previousSounds = sounds
    setTheme(nextTheme); setSounds(nextSounds); setPreferenceError('')
    try { await setPreferences(nextTheme, nextSounds) } catch {
      setTheme(previousTheme); setSounds(previousSounds); setPreferenceError(t('preferenceSaveError'))
    }
  }
  const changeLanguage = async (nextLanguage: ClientLocale) => {
    setPreferenceError('')
    try { await setLanguage(nextLanguage) } catch { setPreferenceError(t('preferenceSaveError')) }
  }
  const resetAccountForm = () => {
    setName(user?.name || '')
    setUsername(user?.username || '')
    setEmail(user?.email || '')
    setDailyLimit(user?.daily_send_limit || '0')
    setMonthlyLimit(user?.monthly_send_limit || '0')
    setAccountError('')
  }
  const cancelEditing = () => { resetAccountForm(); setEditing(false) }
  const saveAccount = async (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    const cleanUsername = username.trim()
    const daily = Number(dailyLimit)
    const monthly = Number(monthlyLimit)
    setAccountNotice('')
    if (cleanName.length < 2 || cleanName.length > 80) return setAccountError(t('invalidName'))
    if (!/^[A-Za-z0-9_]{3,40}$/.test(cleanUsername)) return setAccountError(t('invalidUsername'))
    if (!Number.isFinite(daily) || !Number.isFinite(monthly) || daily < 0 || monthly < 0) return setAccountError(t('invalidLimits'))
    if (monthly < daily) return setAccountError(t('limitOrder'))
    setAccountBusy(true)
    setAccountError('')
    try {
      await updateAccountSettings({
        name: cleanName,
        username: cleanUsername,
        email: email.trim(),
        daily_send_limit: dailyLimit,
        monthly_send_limit: monthlyLimit,
      })
      setEditing(false)
      setAccountNotice(t('settingsSaved'))
    } catch (err) {
      const message = (err as Error).message
      setAccountError(localizeClientError(message, locale))
    } finally {
      setAccountBusy(false)
    }
  }

  return (
    <div className="page-content settings-page">
      <PageHeading title={t('settings')} description={t('settingsSummary')} />
      <Card className="panel-card settings-card">
        <form className="account-settings-form" onSubmit={saveAccount}>
        <SettingsSection title={t('profile')} action={editing
          ? <div className="settings-heading-actions"><Button type="submit" variant="primary" size="small" disabled={accountBusy}>{accountBusy ? t('saving') : t('saveChanges')}</Button><Button className="settings-header-button" size="small" onClick={cancelEditing} disabled={accountBusy}>{t('cancel')}</Button></div>
          : <div className="settings-profile-actions">{accountNotice && <span className="settings-saved-inline" role="status">{accountNotice}</span>}<Button className="settings-header-button" size="small" onClick={() => { resetAccountForm(); setAccountNotice(''); setEditing(true) }}>{t('editDetails')}</Button></div>}>
          {editing ? <EditableSettingRow label={t('name')}><Input className="settings-text-input settings-text-input--short" controlSize="small" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required /></EditableSettingRow> : <SettingRow label={t('name')} value={user?.name || ''} />}
          {editing ? <EditableSettingRow label={t('username')}><div className="settings-username-input"><span>@</span><Input controlSize="small" value={username} onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, ''))} minLength={3} maxLength={40} autoCapitalize="none" required /></div></EditableSettingRow> : <SettingRow label={t('username')} value={`@${user?.username}`} />}
          {editing ? <EditableSettingRow label={t('email')}><Input className="settings-text-input settings-text-input--email" controlSize="small" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoCapitalize="none" required /></EditableSettingRow> : <SettingRow label={t('email')} value={user?.email || ''} />}
          <SettingRow label={t('accountId')} value={`#${user?.client_number || ''}`} />
          <SettingRow label={t('memberSince')} value={user ? new Date(user.created_at).toLocaleString(locale) : ''} />
        </SettingsSection>
        <SettingsSection title={t('networkLimits')}>
          {editing ? <EditableSettingRow label={t('dailyLimit')}><CurrencySettingInput value={dailyLimit} onChange={setDailyLimit} /></EditableSettingRow> : <SettingRow label={t('dailyLimit')} value={money(user?.daily_send_limit || '0', 0)} />}
          {editing ? <EditableSettingRow label={t('monthlyLimit')}><CurrencySettingInput value={monthlyLimit} onChange={setMonthlyLimit} /></EditableSettingRow> : <SettingRow label={t('monthlyLimit')} value={money(user?.monthly_send_limit || '0', 0)} />}
          <SettingRow label={t('reviewThreshold')} value={money(user?.manual_review_threshold || '0', 0)} />
          {accountError && <Notice variant="danger">{accountError}</Notice>}
        </SettingsSection>
        </form>
        <SettingsSection title={t('preferences')}>
          <div className="setting-row settings-language-row"><span>{t('language')}</span><CustomSelect className="settings-language-select" controlSize="small" ariaLabel={t('languageHint')} value={locale} onChange={(value) => void changeLanguage(value as ClientLocale)} options={[{ value: 'en', label: t('english') }, { value: 'fr', label: t('french') }, { value: 'es', label: t('spanish') }, { value: 'de', label: t('german') }]} /></div>
          <div className="setting-row"><span>{t('theme')}</span><Tabs className="segmented-control settings-theme-control" variant="segmented" ariaLabel={t('theme')} value={theme} onChange={(value) => persist(value, sounds)} items={[{ value: 'dark', label: t('dark'), icon: <Moon size={18} /> }, { value: 'light', label: t('light'), icon: <Sun size={18} /> }]} /></div>
          <div className="setting-row"><span>{t('sounds')}</span><button type="button" role="switch" aria-label={t('sounds')} className={`toggle ${sounds ? 'on' : ''}`} onClick={() => persist(theme, !sounds)} aria-checked={sounds}><span /></button></div>
          {preferenceError && <Notice variant="danger">{preferenceError}</Notice>}
        </SettingsSection>
      </Card>
    </div>
  )
}

function SettingsSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) { return <section className="settings-section"><div className="settings-section__heading"><h2>{title}</h2>{action}</div>{children}</section> }
function SettingRow({ label, value }: { label: string; value: string }) { return <ListRow className="setting-row" title={label} trailing={<strong>{value}</strong>} /> }
function EditableSettingRow({ label, children }: { label: string; children: ReactNode }) { return <label className="setting-row setting-row--editable"><span>{label}</span><div className="setting-row__control">{children}</div></label> }
function CurrencySettingInput({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <div className="settings-currency-input"><Input controlSize="small" type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} required /><span>USD</span></div> }

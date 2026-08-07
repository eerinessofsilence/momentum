import { ArrowLeft, Snowflake, SignOut as LogOut, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { useClientI18n } from '../clientI18n'
import { Brand } from '../components/Brand'
import { Button } from '../components/UI'
import { navigate } from '../router'

export function AccountStatusPage() {
  const { user, logout, returnToStaff } = useAuth()
  const { t } = useClientI18n()
  const [busy, setBusy] = useState(false)
  if (!user || user.account_status === 'active') return null

  const frozen = user.account_status === 'suspended'
  const leave = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (user.impersonating) {
        await returnToStaff()
        navigate('/staff', true)
      } else {
        await logout()
        navigate('/auth', true)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="account-status-page">
      <Brand />
      <section className={`account-status-card ${frozen ? 'is-frozen' : 'is-archived'}`}>
        <span className="account-status-icon">{frozen ? <Snowflake /> : <Trash />}</span>
        <div>
          <h1>{t(frozen ? 'accountFrozen' : 'accountDeleted')}</h1>
          <span>{t(frozen ? 'frozenText' : 'deletedText')}</span>
        </div>
        <Button variant="primary" onClick={leave} disabled={busy}>
          {user.impersonating ? <ArrowLeft size={18} /> : <LogOut size={18} />}
          {busy ? t('pleaseWait') : user.impersonating ? t('returnOperations') : t('signOut')}
        </Button>
      </section>
    </main>
  )
}

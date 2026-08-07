import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { localizeClientError, useClientI18n } from '../clientI18n'
import { useShell } from '../components/AppShell'
import { AsyncState, PageHeading, WalletRow } from '../components/PageParts'
import { Card } from '../components/UI'
import type { Wallet } from '../types'

export function WalletsPage() {
  const { locale, t } = useClientI18n()
  const { openAction } = useShell()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    setLoading(true); setError('')
    api<{ items: Wallet[] }>('/wallets').then(({ items }) => setWallets(items)).catch((err: Error) => setError(localizeClientError(err.message, locale))).finally(() => setLoading(false))
  }, [locale])
  useEffect(() => { load(); window.addEventListener('momentum:data-changed', load); return () => window.removeEventListener('momentum:data-changed', load) }, [load])
  return <div className="page-content"><PageHeading title={t('wallets')} description={t('walletsDescription')} /><AsyncState loading={loading} error={error} empty={!wallets.length} emptyTitle={t('noWallets')} emptyDescription={t('noWalletsDescription')} retryLabel={t('retry')} onRetry={load}><Card className="panel-card wallet-page-card"><div className="wallet-list">{wallets.map((wallet) => <WalletRow key={wallet.id} wallet={wallet} onReceive={() => openAction('receive', wallet.symbol)} />)}</div></Card></AsyncState></div>
}

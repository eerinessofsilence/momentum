import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useShell } from '../components/AppShell'
import { LoadingPanel, PageHeading, WalletRow } from '../components/PageParts'
import type { Wallet } from '../types'

export function WalletsPage() {
  const { openAction } = useShell()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    api<{ items: Wallet[] }>('/wallets').then(({ items }) => setWallets(items)).catch((err: Error) => setError(err.message)).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load(); window.addEventListener('momentum:data-changed', load); return () => window.removeEventListener('momentum:data-changed', load) }, [load])
  return <div className="page-content"><PageHeading title="My Wallets" description="All your deposit addresses across supported chains." />{error && <div className="form-error">{error}</div>}{loading ? <LoadingPanel /> : <section className="panel-card wallet-page-card"><div className="wallet-list">{wallets.map((wallet) => <WalletRow key={wallet.id} wallet={wallet} onReceive={() => openAction('receive', wallet.symbol)} />)}</div></section>}</div>
}

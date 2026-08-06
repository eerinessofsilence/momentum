import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { LoadingPanel, PageHeading, TransactionRow } from '../components/PageParts'
import { Card, EmptyState, Tabs } from '../components/UI'
import type { Transaction } from '../types'

export function HistoryPage() {
  const [items, setItems] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const load = useCallback(() => api<{ items: Transaction[] }>('/transactions').then((result) => setItems(result.items)).finally(() => setLoading(false)), [])
  useEffect(() => { load(); window.addEventListener('momentum:data-changed', load); return () => window.removeEventListener('momentum:data-changed', load) }, [load])
  const filtered = items.filter((item) => filter === 'all' || (filter === 'incoming' ? Number(item.amount) >= 0 : Number(item.amount) < 0))
  return <div className="page-content"><PageHeading title="Transaction history" description="All your sends, receives, buys, swaps, and withdrawals."><Tabs className="inline-tabs" variant="segmented" ariaLabel="Transaction direction" value={filter} onChange={setFilter} items={(['all', 'incoming', 'outgoing'] as const).map((item) => ({ value: item, label: item }))} /></PageHeading>{loading ? <LoadingPanel /> : <Card className="panel-card history-card">{filtered.length ? filtered.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />) : <EmptyState title="No matching transactions" description="Try another transaction filter." />}</Card>}</div>
}

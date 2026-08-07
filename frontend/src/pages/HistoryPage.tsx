import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { localizeClientError, useClientI18n } from '../clientI18n'
import { AsyncState, PageHeading, TransactionRow } from '../components/PageParts'
import { Card, EmptyState, Tabs } from '../components/UI'
import type { Transaction } from '../types'

export function HistoryPage() {
  const { locale, t } = useClientI18n()
  const [items, setItems] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const load = useCallback(() => {
    setLoading(true); setError('')
    return api<{ items: Transaction[] }>('/transactions').then((result) => setItems(result.items)).catch((err: Error) => setError(localizeClientError(err.message, locale))).finally(() => setLoading(false))
  }, [locale])
  useEffect(() => { load(); window.addEventListener('momentum:data-changed', load); return () => window.removeEventListener('momentum:data-changed', load) }, [load])
  const filtered = items.filter((item) => filter === 'all' || (filter === 'incoming' ? Number(item.amount) >= 0 : Number(item.amount) < 0))
  return <div className="page-content"><PageHeading title={t('historyTitle')} description={t('historySummary')}><Tabs className="inline-tabs" variant="segmented" ariaLabel={t('transactionDirection')} value={filter} onChange={setFilter} items={(['all', 'incoming', 'outgoing'] as const).map((item) => ({ value: item, label: t(item) }))} /></PageHeading><AsyncState loading={loading} error={error} retryLabel={t('retry')} onRetry={load}><Card className="panel-card history-card">{filtered.length ? filtered.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />) : <EmptyState title={t('noTransactions')} description={t('anotherFilter')} />}</Card></AsyncState></div>
}

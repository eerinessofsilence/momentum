import { ArrowDownLeft, ArrowUpRight, ArrowsClockwise as RefreshCw, ShoppingBag } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { assetAmount, money } from '../format'
import type { Transaction, Wallet } from '../types'
import { CoinIcon } from './CoinIcon'
import { Badge, Button } from './UI'

export function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{children}</div>
}

export function WalletRow({ wallet, compact = false, onReceive }: { wallet: Wallet; compact?: boolean; onReceive?: () => void }) {
  const positive = Number(wallet.change_24h) >= 0
  return (
    <div className={`wallet-row ${compact ? 'compact' : ''}`}>
      <CoinIcon symbol={wallet.symbol} size={compact ? 'sm' : 'md'} />
      <div className="wallet-identity"><strong>{wallet.name}</strong><span>{compact ? `${wallet.symbol} · ${wallet.network}` : wallet.address}</span></div>
      <div className="wallet-numbers"><strong>{assetAmount(wallet.balance, wallet.symbol)}</strong><span>{money(wallet.usd_value)}</span></div>
      {compact && <Badge variant={positive ? 'success' : 'danger'} className={`change-chip ${positive ? 'positive' : 'negative'}`}>{positive ? '+' : ''}{wallet.change_24h}%</Badge>}
      {!compact && onReceive && <Button size="small" onClick={onReceive}>Receive</Button>}
    </div>
  )
}

export function TransactionRow({ transaction, compact = false }: { transaction: Transaction; compact?: boolean }) {
  const Icon = transaction.kind === 'receive' ? ArrowDownLeft : transaction.kind === 'swap' ? RefreshCw : transaction.kind === 'buy' ? ShoppingBag : ArrowUpRight
  const incoming = Number(transaction.amount) >= 0
  return (
    <div className={`transaction-row ${compact ? 'compact' : ''}`}>
      <span className={`transaction-icon ${incoming ? 'incoming' : 'outgoing'}`}><Icon size={20} /></span>
      <div className="transaction-title"><strong>{transaction.title}</strong><Badge variant={transaction.status === 'approved' ? 'success' : transaction.status === 'pending' ? 'warning' : 'danger'} className={`status-chip ${transaction.status}`}>{transaction.status}</Badge>{!compact && <small>{new Date(transaction.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small>}</div>
      <div className="transaction-amount"><strong>{incoming ? '+' : '−'}{assetAmount(transaction.amount, transaction.asset)}</strong><span>{money(transaction.usd_value)}</span></div>
    </div>
  )
}

export function LoadingPanel() {
  return <div className="loading-panel"><span /><span /><span /></div>
}

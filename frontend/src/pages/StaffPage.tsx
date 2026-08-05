import {
  Pulse as Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CaretRight as ChevronRight,
  CurrencyDollar as CircleDollarSign,
  Clock as Clock3,
  Copy,
  Headphones,
  SquaresFour as LayoutDashboard,
  SignOut as LogOut,
  List as Menu,
  ChatCircle as MessageCircle,
  MagnifyingGlass as Search,
  PaperPlaneTilt as Send,
  Gear as Settings,
  ShieldCheck,
  Sparkle as Sparkles,
  Users,
  Wallet as WalletCards,
  X,
} from '@phosphor-icons/react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { Brand } from '../components/Brand'
import { CoinIcon } from '../components/CoinIcon'
import { Modal } from '../components/Modal'
import { assetAmount, money, timeLabel } from '../format'
import { navigate } from '../router'
import type { StaffClient, StaffClientSummary, Wallet } from '../types'

type StaffSummary = { clients: number; portfolio: string; needs_reply: number; transactions: number }
type DetailTab = 'overview' | 'chat' | 'activity'

const defaultSummary: StaffSummary = { clients: 0, portfolio: '0', needs_reply: 0, transactions: 0 }

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function relativeTime(value: string | null) {
  if (!value) return 'No conversation yet'
  const delta = Date.now() - new Date(value).getTime()
  const minutes = Math.max(1, Math.floor(delta / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StaffSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  const signOut = async () => { await logout(); navigate('/auth') }
  return (
    <>
      {open && <button className="staff-mobile-scrim" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`staff-sidebar ${open ? 'open' : ''}`}>
        <div className="staff-brand"><Brand /><button className="icon-button staff-nav-close" onClick={onClose}><X size={20} /></button></div>
        <div className="staff-workspace-label"><ShieldCheck size={15} /><span>Operations workspace</span></div>
        <nav className="staff-navigation">
          <a className="active" href="/staff" onClick={(event) => event.preventDefault()}><Users size={19} /><span>Clients</span></a>
          <button disabled><LayoutDashboard size={19} /><span>Analytics</span><small>Soon</small></button>
          <button disabled><Settings size={19} /><span>Workspace</span><small>Soon</small></button>
        </nav>
        <div className="staff-sidebar-note"><Headphones size={18} /><div><strong>Moderator mode</strong><span>Changes are recorded in client activity.</span></div></div>
        <div className="staff-account">
          <div className="staff-account-meta"><span className="staff-avatar small">{initials(user?.name || 'MO')}</span><div><strong>{user?.name}</strong><span>Moderator</span></div></div>
          <button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </aside>
    </>
  )
}

function AdjustBalanceModal({ client, wallet, onClose, onSaved }: { client: StaffClient; wallet: Wallet; onClose: () => void; onSaved: (client: StaffClient) => void }) {
  const [action, setAction] = useState<'credit' | 'debit'>('credit')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api<{ client: StaffClient }>(`/staff/clients/${client.id}/balance`, { method: 'POST', body: JSON.stringify({ asset: wallet.symbol, action, amount }) })
      onSaved(result.client)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Adjust client balance" onClose={onClose}>
      <form className="modal-body staff-adjust-form" onSubmit={submit}>
        <div className="staff-adjust-client"><span className="staff-avatar">{initials(client.name)}</span><div><span>Client</span><strong>{client.name}</strong></div><ChevronRight size={18} /><CoinIcon symbol={wallet.symbol} size="sm" /><div><span>Asset</span><strong>{wallet.symbol}</strong></div></div>
        <div className="adjust-warning"><ShieldCheck size={18} /><p>This creates an auditable transaction in the client’s activity. Review the direction and amount before applying.</p></div>
        <label className="field-label">Adjustment type<div className="staff-segmented"><button type="button" className={action === 'credit' ? 'active' : ''} onClick={() => setAction('credit')}><ArrowDownLeft size={16} /> Credit</button><button type="button" className={action === 'debit' ? 'active' : ''} onClick={() => setAction('debit')}><ArrowUpRight size={16} /> Debit</button></div></label>
        <label className="field-label">Amount in {wallet.symbol}<div className="amount-field"><input className="field-input" type="number" step="any" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" autoFocus required /><span>{wallet.symbol}</span></div><small>Current balance: {assetAmount(wallet.balance, wallet.symbol)}</small></label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !Number(amount)}>{busy ? 'Applying…' : `Apply ${action}`}</button></div>
      </form>
    </Modal>
  )
}

function ClientOverview({ client, onAdjust, onRefresh, notify }: { client: StaffClient; onAdjust: (wallet: Wallet) => void; onRefresh: () => void; notify: (message: string) => void }) {
  const [codeCount, setCodeCount] = useState(3)
  const [busy, setBusy] = useState(false)
  const generate = async () => {
    setBusy(true)
    try { await api(`/staff/clients/${client.id}/codes`, { method: 'POST', body: JSON.stringify({ count: codeCount }) }); await onRefresh(); notify(`${codeCount} confirmation ${codeCount === 1 ? 'code' : 'codes'} generated`) } finally { setBusy(false) }
  }
  const clear = async () => {
    setBusy(true)
    try { await api(`/staff/clients/${client.id}/codes`, { method: 'DELETE' }); await onRefresh(); notify('Confirmation codes cleared') } finally { setBusy(false) }
  }
  return (
    <div className="staff-overview-grid">
      <div className="staff-overview-main">
        <section className="staff-section-card profile-summary">
          <div className="staff-section-title"><div><span>Account</span><h3>Client profile</h3></div><span className="status-pill"><i /> Active</span></div>
          <dl><div><dt>Username</dt><dd>@{client.username}</dd></div><div><dt>Email address</dt><dd>{client.email}</dd></div><div><dt>Client since</dt><dd>{new Date(client.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</dd></div><div><dt>Client ID</dt><dd>#{client.id.toString().padStart(5, '0')}</dd></div></dl>
        </section>
        <section className="staff-section-card code-manager">
          <div className="staff-section-title"><div><span>Verification</span><h3>Confirmation codes</h3></div><span className="neutral-pill">{client.codes.length} ready</span></div>
          <p>One-time codes are shown to the client in sequence. Generate only the amount required for the current verification flow.</p>
          <div className="code-controls"><label><span>Quantity</span><input type="number" min="1" max="10" value={codeCount} onChange={(event) => setCodeCount(Math.min(10, Math.max(1, Number(event.target.value))))} /></label><button className="button primary small" onClick={generate} disabled={busy}><Sparkles size={16} /> Generate</button>{client.codes.length > 0 && <button className="button secondary small" onClick={clear} disabled={busy}>Clear all</button>}</div>
          <div className="code-list">
            {client.codes.length === 0 ? <div className="codes-empty"><ShieldCheck size={20} /><span>No active codes</span></div> : client.codes.map((item, index) => <button key={item.id} onClick={() => { navigator.clipboard.writeText(item.code); notify('Code copied') }}><span><small>{index === 0 ? 'Next' : 'Queued'}</small><strong>{item.code}</strong></span><Copy size={15} /></button>)}
          </div>
        </section>
      </div>
      <section className="staff-section-card wallet-manager">
        <div className="staff-section-title"><div><span>Portfolio</span><h3>Wallets & balances</h3></div><strong>{money(client.total_balance)}</strong></div>
        <div className="staff-wallet-list">{client.wallets.map((wallet) => <article key={wallet.id}><CoinIcon symbol={wallet.symbol} size="sm" /><div className="staff-wallet-name"><strong>{wallet.name}</strong><span>{wallet.symbol} · {wallet.network}</span></div><div className="staff-wallet-balance"><strong>{assetAmount(wallet.balance, wallet.symbol)}</strong><span>{money(wallet.usd_value)}</span></div><button className="button secondary small" onClick={() => onAdjust(wallet)}>Adjust</button></article>)}</div>
      </section>
    </div>
  )
}

function ClientChat({ client, onRefresh }: { client: StaffClient; onRefresh: () => Promise<void> }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight }) }, [client.messages])
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!body.trim()) return; setBusy(true)
    try { await api(`/staff/clients/${client.id}/messages`, { method: 'POST', body: JSON.stringify({ body: body.trim() }) }); setBody(''); await onRefresh() } finally { setBusy(false) }
  }
  return (
    <section className="staff-chat-panel">
      <div className="staff-chat-context"><MessageCircle size={17} /><span>Conversation with <strong>{client.name}</strong></span><span className="status-pill"><i /> Client</span></div>
      <div className="staff-chat-messages" ref={chatRef}>{client.messages.map((message) => <div className={`staff-chat-row ${message.sender}`} key={message.id}><div><p>{message.body}</p><time>{timeLabel(message.created_at)}</time></div></div>)}</div>
      <form className="staff-chat-composer" onSubmit={submit}><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a clear, helpful reply…" rows={2} /><button className="button primary" disabled={busy || !body.trim()}><Send size={17} /> Send reply</button></form>
    </section>
  )
}

function ClientActivity({ client }: { client: StaffClient }) {
  return <section className="staff-section-card staff-activity"><div className="staff-section-title"><div><span>Audit trail</span><h3>Recent activity</h3></div><span className="neutral-pill">{client.transaction_count} total</span></div><div>{client.transactions.map((item) => { const incoming = Number(item.amount) >= 0; return <article key={item.id}><span className={`activity-icon ${incoming ? 'incoming' : 'outgoing'}`}>{incoming ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><div><strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div><div><strong>{incoming ? '+' : '−'}{assetAmount(item.amount, item.asset)}</strong><span>{money(item.usd_value)}</span></div></article> })}</div></section>
}

export function StaffPage() {
  const [clients, setClients] = useState<StaffClientSummary[]>([])
  const [summary, setSummary] = useState<StaffSummary>(defaultSummary)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [client, setClient] = useState<StaffClient | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<DetailTab>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [adjustWallet, setAdjustWallet] = useState<Wallet | null>(null)
  const [toast, setToast] = useState('')

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }
  const loadClients = useCallback(async (search = '') => {
    const result = await api<{ items: StaffClientSummary[]; summary: StaffSummary }>(`/staff/clients${search ? `?query=${encodeURIComponent(search)}` : ''}`)
    setClients(result.items); setSummary(result.summary)
    setSelectedId((current) => current && result.items.some((item) => item.id === current) ? current : result.items[0]?.id || null)
  }, [])
  const loadClient = useCallback(async () => {
    if (!selectedId) { setClient(null); return }
    const result = await api<{ client: StaffClient }>(`/staff/clients/${selectedId}`)
    setClient(result.client)
  }, [selectedId])
  useEffect(() => { loadClients().catch((err) => setError((err as Error).message)).finally(() => setLoading(false)) }, [loadClients])
  useEffect(() => { const timer = window.setTimeout(() => loadClients(query).catch((err) => setError((err as Error).message)), 240); return () => window.clearTimeout(timer) }, [query, loadClients])
  useEffect(() => { loadClient().catch((err) => setError((err as Error).message)) }, [loadClient])
  const refreshAll = useCallback(async () => { await Promise.all([loadClient(), loadClients(query)]) }, [loadClient, loadClients, query])
  const currentIndex = useMemo(() => clients.findIndex((item) => item.id === selectedId), [clients, selectedId])

  return (
    <div className="staff-shell">
      <StaffSidebar open={mobileNav} onClose={() => setMobileNav(false)} />
      <main className="staff-main">
        <header className="staff-mobile-header"><Brand compact /><button className="icon-button" onClick={() => setMobileNav(true)}><Menu /></button></header>
        <div className="staff-page">
          <div className="staff-page-heading"><div><span className="eyebrow">Client operations</span><h1>Moderator workspace</h1><p>Review accounts, resolve conversations, and manage client balances from one focused view.</p></div><div className="staff-live"><span /><div><strong>Systems operational</strong><small>Live workspace</small></div></div></div>
          <section className="staff-kpis"><article><span className="kpi-icon"><Users /></span><div><small>Total clients</small><strong>{summary.clients}</strong></div><em>Active accounts</em></article><article><span className="kpi-icon"><CircleDollarSign /></span><div><small>Managed portfolio</small><strong>{money(summary.portfolio, 0)}</strong></div><em>Across all wallets</em></article><article><span className="kpi-icon"><MessageCircle /></span><div><small>Needs reply</small><strong>{summary.needs_reply}</strong></div><em className={summary.needs_reply ? 'attention' : ''}>{summary.needs_reply ? 'Action required' : 'Inbox clear'}</em></article><article><span className="kpi-icon"><Activity /></span><div><small>Transactions</small><strong>{summary.transactions}</strong></div><em>Recorded events</em></article></section>
          {error && <div className="form-error staff-error">{error}</div>}
          <section className="staff-workspace">
            <aside className="client-list-panel">
              <div className="client-list-heading"><div><h2>Clients</h2><span>{clients.length} shown</span></div><div className="staff-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, username…" /></div></div>
              <div className="client-list">{loading ? <div className="client-list-empty">Loading clients…</div> : clients.length === 0 ? <div className="client-list-empty">No clients match your search.</div> : clients.map((item, index) => <button className={item.id === selectedId ? 'active' : ''} key={item.id} onClick={() => { setSelectedId(item.id); setTab('overview') }}><span className="staff-avatar">{initials(item.name)}</span><span className="client-card-copy"><strong>{item.name}</strong><small>@{item.username} · {relativeTime(item.last_message_at)}</small></span><span className="client-card-value"><strong>{money(item.total_balance, 0)}</strong>{item.needs_reply ? <small className="reply-dot"><i /> Reply</small> : <small>{item.transaction_count} txns</small>}</span><span className="client-number">{String(index + 1).padStart(2, '0')}</span></button>)}</div>
            </aside>
            <div className="client-detail-panel">
              {!client ? <div className="client-detail-empty"><Users size={30} /><h3>Select a client</h3><p>Choose an account from the list to open its workspace.</p></div> : <>
                <header className="client-detail-header"><div className="client-title"><span className="staff-avatar large">{initials(client.name)}</span><div><div><h2>{client.name}</h2><span className="status-pill"><i /> Active</span></div><p>@{client.username} · {client.email}</p></div></div><div className="client-position"><span>{currentIndex + 1} of {clients.length}</span><strong>{money(client.total_balance)}</strong></div></header>
                <nav className="client-tabs"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><WalletCards size={16} /> Overview</button><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><MessageCircle size={16} /> Conversation{client.needs_reply && <i />}</button><button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><Clock3 size={16} /> Activity</button></nav>
                <div className="client-detail-body">{tab === 'overview' && <ClientOverview client={client} onAdjust={setAdjustWallet} onRefresh={refreshAll} notify={notify} />}{tab === 'chat' && <ClientChat client={client} onRefresh={refreshAll} />}{tab === 'activity' && <ClientActivity client={client} />}</div>
              </>}
            </div>
          </section>
        </div>
      </main>
      {adjustWallet && client && <AdjustBalanceModal client={client} wallet={adjustWallet} onClose={() => setAdjustWallet(null)} onSaved={(updated) => { setClient(updated); setAdjustWallet(null); loadClients(query); notify(`${adjustWallet.symbol} balance updated`) }} />}
      {toast && <div className="staff-toast"><Check size={17} />{toast}</div>}
    </div>
  )
}

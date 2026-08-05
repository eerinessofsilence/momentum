import {
  ArrowLeft,
  ArrowRight,
  CurrencyDollar as BadgeDollarSign,
  Check,
  Clipboard,
  CreditCard,
  Bank as Landmark,
  LockKey as LockKeyhole,
  ArrowsClockwise as RefreshCw,
  ShieldCheck,
  Wallet as WalletCards,
} from '@phosphor-icons/react'
import { QRCodeSVG } from 'qrcode.react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { assetAmount, shortAddress } from '../format'
import type { ActionKind, Wallet } from '../types'
import { CoinIcon } from './CoinIcon'
import { CustomSelect } from './CustomSelect'
import { Modal } from './Modal'

type SendStep = 'choose' | 'crypto' | 'card' | 'authorize' | 'verify' | 'pending'

function ErrorNotice({ message }: { message: string }) {
  return message ? <div className="form-error" role="alert">{message}</div> : null
}

export function ActionModal({
  kind,
  initialSymbol,
  onClose,
}: {
  kind: ActionKind
  initialSymbol?: string
  onClose: () => void
}) {
  const { user } = useAuth()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [symbol, setSymbol] = useState(initialSymbol || 'BTC')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState('')
  const [step, setStep] = useState<SendStep>('choose')
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242')
  const [cardholder, setCardholder] = useState(() => user?.name.toUpperCase() || '')
  const [password, setPassword] = useState('')
  const [withdrawalId, setWithdrawalId] = useState<number | null>(null)
  const [demoCode, setDemoCode] = useState('')
  const [verificationCode, setVerificationCode] = useState('')

  useEffect(() => {
    api<{ items: Wallet[] }>('/wallets')
      .then(({ items }) => {
        setWallets(items)
        if (!items.some((item) => item.symbol === symbol) && items[0]) setSymbol(items[0].symbol)
      })
      .catch((err: Error) => setError(err.message))
  }, [symbol])

  const selected = useMemo(() => wallets.find((item) => item.symbol === symbol), [symbol, wallets])
  const changed = () => window.dispatchEvent(new Event('momentum:data-changed'))

  if (kind === 'receive') {
    return (
      <Modal title="Receive crypto" onClose={onClose}>
        <div className="modal-body space-y-5">
          {selected && (
            <div className="asset-highlight">
              <CoinIcon symbol={selected.symbol} />
              <div><strong>{selected.name}</strong><span>{selected.network} · {selected.symbol}</span></div>
            </div>
          )}
          <label className="field-label">Coin
            <CustomSelect ariaLabel="Coin" value={symbol} onChange={setSymbol} options={wallets.map((wallet) => ({ value: wallet.symbol, label: `${wallet.name} (${wallet.symbol})` }))} />
          </label>
          {selected && (
            <>
              <div className="qr-shell"><QRCodeSVG value={selected.address} size={184} /></div>
              <button
                className="address-copy"
                onClick={async () => {
                  await navigator.clipboard?.writeText(selected.address)
                  setCompleted('Address copied')
                }}
              >
                <code>{shortAddress(selected.address, 16, 10)}</code><span><Clipboard size={16} /> Copy</span>
              </button>
              {completed && <div className="success-inline"><Check size={15} /> {completed}</div>}
              <p className="fine-print">Send only {selected.symbol} on the {selected.network}. Other assets may be permanently lost.</p>
            </>
          )}
          <ErrorNotice message={error} />
        </div>
      </Modal>
    )
  }

  if (kind === 'buy') {
    return <BuyModalContent wallets={wallets} symbol={symbol} setSymbol={setSymbol} onClose={onClose} changed={changed} />
  }

  if (kind === 'swap') {
    return <SwapModalContent wallets={wallets} onClose={onClose} changed={changed} />
  }

  const submitCrypto = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api('/demo/send', { method: 'POST', body: JSON.stringify({ asset: symbol, amount, address }) })
      setCompleted(`${symbol} transfer approved`)
      changed()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const createCardWithdrawal = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (cardNumber.replace(/\s/g, '') !== '4242424242424242') {
      setError('Use the development card 4242 4242 4242 4242')
      return
    }
    setBusy(true)
    try {
      const result = await api<{ id: number }>('/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ asset: symbol, amount, cardholder, card_last4: '4242' }),
      })
      setWithdrawalId(result.id)
      setStep('authorize')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const authorize = async (event: FormEvent) => {
    event.preventDefault()
    if (!withdrawalId) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ demo_code: string }>(`/withdrawals/${withdrawalId}/authorize`, {
        method: 'POST', body: JSON.stringify({ password }),
      })
      setDemoCode(result.demo_code)
      setVerificationCode(result.demo_code)
      setStep('verify')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    if (!withdrawalId) return
    setBusy(true)
    setError('')
    try {
      await api(`/withdrawals/${withdrawalId}/verify`, {
        method: 'POST', body: JSON.stringify({ code: verificationCode }),
      })
      changed()
      setStep('pending')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = step === 'choose' ? 'Withdraw funds' : step === 'crypto' ? 'Send to a wallet' : 'Withdraw to bank card'

  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body space-y-5">
        {step === 'choose' && (
          <>
            <p className="modal-copy">Choose how you want to move your funds.</p>
            <button className="method-card" onClick={() => setStep('crypto')}>
              <span className="method-icon red"><WalletCards /></span><span><strong>To a crypto wallet</strong><small>Send to any compatible address. Available instantly.</small></span><ArrowRight size={19} />
            </button>
            <button className="method-card selected" onClick={() => setStep('card')}>
              <span className="method-icon blue"><CreditCard /></span><span><strong>To a bank card</strong><small>Development card flow. Card data is not stored.</small></span><ArrowRight size={19} />
            </button>
            <button className="method-card" disabled>
              <span className="method-icon green"><Landmark /></span><span><strong>Cash pickup</strong><small>Identity verification required.</small></span><LockKeyhole size={17} />
            </button>
          </>
        )}
        {step === 'crypto' && !completed && (
          <form className="space-y-4" onSubmit={submitCrypto}>
            <AssetAndAmount wallets={wallets} symbol={symbol} setSymbol={setSymbol} amount={amount} setAmount={setAmount} />
            <label className="field-label">Destination address<input className="field-input" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Wallet address" required /></label>
            <ErrorNotice message={error} />
            <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setStep('choose')}><ArrowLeft size={17} /> Back</button><button className="button primary" disabled={busy}>{busy ? 'Sending…' : 'Send funds'}</button></div>
          </form>
        )}
        {step === 'crypto' && completed && <Completion message={completed} onClose={onClose} />}
        {step === 'card' && (
          <form className="space-y-4" onSubmit={createCardWithdrawal}>
            <AssetAndAmount wallets={wallets} symbol={symbol} setSymbol={setSymbol} amount={amount} setAmount={setAmount} />
            <label className="field-label">Card number<input className="field-input font-mono tracking-[0.18em]" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} inputMode="numeric" required /><small>Development card: 4242 4242 4242 4242</small></label>
            <label className="field-label">Cardholder name<input className="field-input uppercase" value={cardholder} onChange={(event) => setCardholder(event.target.value)} required /></label>
            <ErrorNotice message={error} />
            <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setStep('choose')}><ArrowLeft size={17} /> Back</button><button className="button primary" disabled={busy}>{busy ? 'Preparing…' : 'Continue'}</button></div>
          </form>
        )}
        {step === 'authorize' && (
          <form className="space-y-4" onSubmit={authorize}>
            <div className="info-panel"><LockKeyhole /><div><strong>Confirm withdrawal</strong><p>Re-enter your Momentum account password to authorize this request.</p></div></div>
            <label className="field-label">Username<input className="field-input" value="Current Momentum user" disabled /></label>
            <label className="field-label">Account password<input className="field-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            <ErrorNotice message={error} />
            <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setStep('card')}><ArrowLeft size={17} /> Back</button><button className="button primary" disabled={busy}>{busy ? 'Authorizing…' : 'Confirm'}</button></div>
          </form>
        )}
        {step === 'verify' && (
          <form className="space-y-4" onSubmit={verify}>
            <div className="info-panel"><ShieldCheck /><div><strong>Verification code generated</strong><p>For this development environment, the verification code is shown below.</p></div></div>
            <div className="development-code"><span>Development code</span><strong>{demoCode}</strong></div>
            <label className="field-label">Verification code<input className="field-input otp-input" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} required /></label>
            <ErrorNotice message={error} />
            <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Close</button><button className="button primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button></div>
          </form>
        )}
        {step === 'pending' && (
          <div className="pending-state"><span className="pending-spinner"><RefreshCw /></span><h3>Request is being verified</h3><p>Your withdrawal request has been recorded in this development environment.</p><button className="button primary w-full" onClick={onClose}>Done</button></div>
        )}
      </div>
    </Modal>
  )
}

function AssetAndAmount({ wallets, symbol, setSymbol, amount, setAmount }: { wallets: Wallet[]; symbol: string; setSymbol: (value: string) => void; amount: string; setAmount: (value: string) => void }) {
  const wallet = wallets.find((item) => item.symbol === symbol)
  return (
    <>
      <label className="field-label">Coin<CustomSelect ariaLabel="Coin" value={symbol} onChange={setSymbol} options={wallets.map((item) => ({ value: item.symbol, label: `${item.name} (${item.symbol})` }))} /></label>
      <label className="field-label">Amount<input className="field-input" type="number" min="0.00000001" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />{wallet && <small>Available: {assetAmount(wallet.balance, wallet.symbol)}</small>}</label>
    </>
  )
}

function Completion({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="pending-state"><span className="completion-mark"><Check /></span><h3>{message}</h3><p>The new transaction is visible in your history.</p><button className="button primary w-full" onClick={onClose}>Done</button></div>
}

function BuyModalContent({ wallets, symbol, setSymbol, onClose, changed }: { wallets: Wallet[]; symbol: string; setSymbol: (value: string) => void; onClose: () => void; changed: () => void }) {
  const [amount, setAmount] = useState('500')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await api('/demo/buy', { method: 'POST', body: JSON.stringify({ asset: symbol, amount_usd: amount }) }); changed(); setDone(`${symbol} added to your wallet`) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return <Modal title="Buy crypto" onClose={onClose}><div className="modal-body space-y-5">{done ? <Completion message={done} onClose={onClose} /> : <form className="space-y-4" onSubmit={submit}><div className="asset-highlight"><span className="method-icon red"><BadgeDollarSign /></span><div><strong>Instant purchase</strong><span>Credits funds at the current reference price.</span></div></div><label className="field-label">Coin<CustomSelect ariaLabel="Coin" value={symbol} onChange={setSymbol} options={wallets.map((item) => ({ value: item.symbol, label: `${item.name} (${item.symbol})` }))} /></label><label className="field-label">Amount in USD<input className="field-input" type="number" min="1" max="50000" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><ErrorNotice message={error} /><button className="button primary w-full" disabled={busy}>{busy ? 'Buying…' : 'Buy'}</button></form>}</div></Modal>
}

function SwapModalContent({ wallets, onClose, changed }: { wallets: Wallet[]; onClose: () => void; changed: () => void }) {
  const [from, setFrom] = useState('USDT'); const [to, setTo] = useState('BTC'); const [amount, setAmount] = useState('100'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const result = await api<{ received: string }>('/demo/swap', { method: 'POST', body: JSON.stringify({ from_asset: from, to_asset: to, amount }) }); changed(); setDone(`Received ${assetAmount(result.received, to)}`) } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  const source = wallets.find((item) => item.symbol === from)
  return <Modal title="Swap assets" onClose={onClose}><div className="modal-body space-y-5">{done ? <Completion message={done} onClose={onClose} /> : <form className="space-y-4" onSubmit={submit}><div className="swap-grid"><label className="field-label">From<CustomSelect ariaLabel="Asset to swap" value={from} onChange={setFrom} options={wallets.map((item) => ({ value: item.symbol, label: item.symbol }))} /></label><span className="swap-arrow"><RefreshCw size={18} /></span><label className="field-label">To<CustomSelect ariaLabel="Asset to receive" value={to} onChange={setTo} options={wallets.map((item) => ({ value: item.symbol, label: item.symbol }))} /></label></div><label className="field-label">Amount<input className="field-input" type="number" min="0.00000001" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} required />{source && <small>Available: {assetAmount(source.balance, source.symbol)}</small>}</label><p className="fine-print">Reference quote · 0.5% fee</p><ErrorNotice message={error} /><button className="button primary w-full" disabled={busy || from === to}>{busy ? 'Swapping…' : 'Review swap'}</button></form>}</div></Modal>
}

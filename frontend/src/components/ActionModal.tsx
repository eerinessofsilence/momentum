import {
  ArrowLeft,
  ArrowRight,
  CurrencyDollar as BadgeDollarSign,
  Check,
  Clipboard,
  CreditCard,
  Bank as Landmark,
  ArrowsClockwise as RefreshCw,
  ShieldCheck,
  Wallet as WalletCards,
} from '@phosphor-icons/react'
import { QRCodeSVG } from 'qrcode.react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { copyToClipboard } from '../clipboard'
import { assetAmount, shortAddress } from '../format'
import type { ActionKind, DemoTransfer, Wallet } from '../types'
import { CoinIcon } from './CoinIcon'
import { CustomSelect } from './CustomSelect'
import { Modal } from './Modal'
import { Button, Field, Input, Notice, Spinner } from './UI'

type SendStep = 'choose' | 'crypto' | 'card' | 'verify' | 'processing' | 'completed'

function ErrorNotice({ message }: { message: string }) {
  return message ? <Notice variant="danger">{message}</Notice> : null
}

function remainingTime(value: string | null) {
  if (!value) return 'up to 24 hours'
  const seconds = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`
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
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [symbol, setSymbol] = useState(initialSymbol || 'BTC')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState('')
  const [step, setStep] = useState<SendStep>('choose')
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242')
  const [transfer, setTransfer] = useState<DemoTransfer | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [, setClock] = useState(Date.now())

  useEffect(() => {
    api<{ items: Wallet[] }>('/wallets')
      .then(({ items }) => {
        setWallets(items)
        if (!items.some((item) => item.symbol === symbol) && items[0]) setSymbol(items[0].symbol)
      })
      .catch((err: Error) => setError(err.message))
  }, [symbol])

  useEffect(() => {
    if (kind !== 'send') return
    api<{ transfer: DemoTransfer | null }>('/demo/transfers/active')
      .then(({ transfer: active }) => {
        if (!active) return
        setTransfer(active)
        setStep(active.status === 'verification' ? 'verify' : 'processing')
      })
      .catch((err: Error) => setError(err.message))
  }, [kind])

  useEffect(() => {
    if (!transfer || transfer.status !== 'processing') return
    const tick = window.setInterval(() => setClock(Date.now()), 1000)
    const poll = window.setInterval(() => {
      api<{ transfer: DemoTransfer }>(`/demo/transfers/${transfer.id}`)
        .then(({ transfer: current }) => {
          setTransfer(current)
          if (current.status === 'completed') {
            setStep('completed')
            window.dispatchEvent(new Event('momentum:data-changed'))
          }
        })
        .catch(() => undefined)
    }, 15_000)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(poll)
    }
  }, [transfer])

  const selected = useMemo(() => wallets.find((item) => item.symbol === symbol), [symbol, wallets])
  const changed = () => window.dispatchEvent(new Event('momentum:data-changed'))

  if (kind === 'receive') {
    return (
      <Modal title="Receive crypto" onClose={onClose}>
        <div className="modal-body space-y-5">
          {selected && <div className="asset-highlight"><CoinIcon symbol={selected.symbol} /><div><strong>{selected.name}</strong><span>{selected.network} · {selected.symbol}</span></div></div>}
          <Field label="Coin"><CustomSelect ariaLabel="Coin" value={symbol} onChange={setSymbol} options={wallets.map((wallet) => ({ value: wallet.symbol, label: `${wallet.name} (${wallet.symbol})` }))} /></Field>
          {selected && <><div className="qr-shell"><QRCodeSVG value={selected.address} size={184} /></div><button className="address-copy" onClick={async () => { await copyToClipboard(selected.address); setCompleted('Address copied') }}><code>{shortAddress(selected.address, 16, 10)}</code><span><Clipboard size={16} /> Copy</span></button>{completed && <div className="success-inline"><Check size={16} /> {completed}</div>}<p className="fine-print">Send only {selected.symbol} on the {selected.network}. Other assets may be permanently lost.</p></>}
          <ErrorNotice message={error} />
        </div>
      </Modal>
    )
  }

  if (kind === 'buy') return <BuyModalContent wallets={wallets} symbol={symbol} setSymbol={setSymbol} onClose={onClose} changed={changed} />
  if (kind === 'swap') return <SwapModalContent wallets={wallets} onClose={onClose} changed={changed} />

  const createTransfer = async (method: 'card' | 'crypto', destination: string) => {
    setBusy(true)
    setError('')
    try {
      const result = await api<{ transfer: DemoTransfer }>('/demo/transfers', {
        method: 'POST',
        body: JSON.stringify({ method, asset: symbol, amount, destination }),
      })
      setTransfer(result.transfer)
      setStep(result.transfer.status === 'verification' ? 'verify' : 'processing')
      changed()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submitCrypto = async (event: FormEvent) => {
    event.preventDefault()
    await createTransfer('crypto', address)
  }

  const submitCard = async (event: FormEvent) => {
    event.preventDefault()
    const digits = cardNumber.replace(/\D/g, '')
    if (digits.length < 12 || digits.length > 19) {
      setError('Enter a valid demo card number')
      return
    }
    await createTransfer('card', digits.slice(-4))
  }

  const submitCode = async (event: FormEvent) => {
    event.preventDefault()
    if (!transfer) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ transfer: DemoTransfer }>(`/demo/transfers/${transfer.id}/codes`, {
        method: 'POST', body: JSON.stringify({ code: verificationCode }),
      })
      setTransfer(result.transfer)
      setVerificationCode('')
      if (result.transfer.status === 'processing') setStep('processing')
      changed()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = step === 'choose' ? 'Send funds' : step === 'crypto' ? 'Send to a wallet' : step === 'card' ? 'Send to a bank card' : 'Demo transfer verification'

  return (
    <Modal title={title} onClose={onClose}>
      {(close) => (
      <div className="modal-body space-y-5">
        {step === 'choose' && <><p className="modal-copy">Choose a simulated transfer method.</p><button className="method-card" onClick={() => setStep('crypto')}><span className="method-icon red"><WalletCards /></span><span><strong>To a crypto wallet</strong><small>Uses the profile confirmation-code workflow.</small></span><ArrowRight size={20} /></button><button className="method-card selected" onClick={() => setStep('card')}><span className="method-icon blue"><CreditCard /></span><span><strong>To a bank card</strong><small>Only the final four digits are stored.</small></span><ArrowRight size={20} /></button><button className="method-card" disabled><span className="method-icon green"><Landmark /></span><span><strong>Cash pickup</strong><small>Not available in this demo.</small></span><ShieldCheck size={16} /></button></>}
        {step === 'crypto' && <form className="space-y-4" onSubmit={submitCrypto}><AssetAndAmount wallets={wallets} symbol={symbol} setSymbol={setSymbol} amount={amount} setAmount={setAmount} /><Field label="Destination address"><Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Wallet address" required /></Field><ErrorNotice message={error} /><div className="modal-actions"><Button onClick={() => setStep('choose')}><ArrowLeft size={16} /> Back</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Preparing…' : 'Continue'}</Button></div></form>}
        {step === 'card' && <form className="space-y-4" onSubmit={submitCard}><AssetAndAmount wallets={wallets} symbol={symbol} setSymbol={setSymbol} amount={amount} setAmount={setAmount} /><Field label="Demo card number" hint="Only the last four digits are saved."><Input className="font-mono tracking-[0.18em]" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} inputMode="numeric" required /></Field><ErrorNotice message={error} /><div className="modal-actions"><Button onClick={() => setStep('choose')}><ArrowLeft size={16} /> Back</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Preparing…' : 'Continue'}</Button></div></form>}
        {step === 'verify' && transfer && <form className="space-y-4" onSubmit={submitCode}><div className="info-panel"><ShieldCheck /><div><strong>Confirmation in progress</strong><p>Enter the next one-time code supplied for this demo profile.</p></div></div><div className="verification-progress"><span>{transfer.used_codes} of {transfer.required_codes} codes entered</span><progress value={transfer.used_codes} max={Math.max(1, transfer.required_codes)} /></div><Field label="Next confirmation code"><Input className="otp-input" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoFocus required /></Field><ErrorNotice message={error} /><Button type="submit" variant="primary" className="w-full" disabled={busy || verificationCode.length !== 6}>{busy ? 'Checking…' : 'Submit code'}</Button></form>}
        {step === 'processing' && transfer && <div className="pending-state"><Spinner className="pending-spinner" label="Transfer processing" /><h3>Demo transfer is processing</h3><p>The saved processing window ends in <strong>{remainingTime(transfer.processing_until)}</strong>. You can close this window; progress will be restored later.</p><Button variant="primary" className="w-full" onClick={close}>Close</Button></div>}
        {step === 'completed' && <Completion message="Demo transfer completed" onClose={close} />}
      </div>
      )}
    </Modal>
  )
}

function AssetAndAmount({ wallets, symbol, setSymbol, amount, setAmount }: { wallets: Wallet[]; symbol: string; setSymbol: (value: string) => void; amount: string; setAmount: (value: string) => void }) {
  const wallet = wallets.find((item) => item.symbol === symbol)
  return <><Field label="Coin"><CustomSelect ariaLabel="Coin" value={symbol} onChange={setSymbol} options={wallets.map((item) => ({ value: item.symbol, label: `${item.name} (${item.symbol})` }))} /></Field><Field label="Amount" hint={wallet ? `Available: ${assetAmount(wallet.balance, wallet.symbol)}` : undefined}><Input type="number" min="0.00000001" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></Field></>
}

function Completion({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="pending-state"><span className="completion-mark"><Check /></span><h3>{message}</h3><p>The transaction status is saved in your history.</p><Button variant="primary" className="w-full" onClick={onClose}>Done</Button></div>
}

function BuyModalContent({ wallets, symbol, setSymbol, onClose, changed }: { wallets: Wallet[]; symbol: string; setSymbol: (value: string) => void; onClose: () => void; changed: () => void }) {
  const [amount, setAmount] = useState('500'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await api('/demo/buy', { method: 'POST', body: JSON.stringify({ asset: symbol, amount_usd: amount }) }); changed(); setDone(`${symbol} added to your wallet`) } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  return <Modal title="Buy crypto" onClose={onClose}>{(close) => <div className="modal-body space-y-5">{done ? <Completion message={done} onClose={close} /> : <form className="space-y-4" onSubmit={submit}><div className="asset-highlight"><span className="method-icon red"><BadgeDollarSign /></span><div><strong>Instant demo purchase</strong><span>Credits the simulated balance.</span></div></div><Field label="Coin"><CustomSelect ariaLabel="Coin" value={symbol} onChange={setSymbol} options={wallets.map((item) => ({ value: item.symbol, label: `${item.name} (${item.symbol})` }))} /></Field><Field label="Amount in USD"><Input type="number" min="1" max="50000" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field><ErrorNotice message={error} /><Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? 'Buying…' : 'Buy'}</Button></form>}</div>}</Modal>
}

function SwapModalContent({ wallets, onClose, changed }: { wallets: Wallet[]; onClose: () => void; changed: () => void }) {
  const [from, setFrom] = useState('USDT'); const [to, setTo] = useState('BTC'); const [amount, setAmount] = useState('100'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const result = await api<{ received: string }>('/demo/swap', { method: 'POST', body: JSON.stringify({ from_asset: from, to_asset: to, amount }) }); changed(); setDone(`Received ${assetAmount(result.received, to)}`) } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  const source = wallets.find((item) => item.symbol === from)
  return <Modal title="Swap assets" onClose={onClose}>{(close) => <div className="modal-body space-y-5">{done ? <Completion message={done} onClose={close} /> : <form className="space-y-4" onSubmit={submit}><div className="swap-grid"><Field label="From"><CustomSelect ariaLabel="Asset to swap" value={from} onChange={setFrom} options={wallets.map((item) => ({ value: item.symbol, label: item.symbol }))} /></Field><span className="swap-arrow"><RefreshCw size={20} /></span><Field label="To"><CustomSelect ariaLabel="Asset to receive" value={to} onChange={setTo} options={wallets.map((item) => ({ value: item.symbol, label: item.symbol }))} /></Field></div><Field label="Amount" hint={source ? `Available: ${assetAmount(source.balance, source.symbol)}` : undefined}><Input type="number" min="0.00000001" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field><p className="fine-print">Reference quote · 0.5% fee</p><ErrorNotice message={error} /><Button type="submit" variant="primary" className="w-full" disabled={busy || from === to}>{busy ? 'Swapping…' : 'Review swap'}</Button></form>}</div>}</Modal>
}

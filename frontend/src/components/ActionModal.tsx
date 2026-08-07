import {
  ArrowLeft,
  ArrowRight,
  CurrencyDollar as BadgeDollarSign,
  Check,
  Clipboard,
  CreditCard,
  ArrowsClockwise as RefreshCw,
  Wallet as WalletCards,
} from '@phosphor-icons/react'
import { QRCodeSVG } from 'qrcode.react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { localizeClientError, useClientI18n } from '../clientI18n'
import { copyToClipboard } from '../clipboard'
import { assetAmount, shortAddress } from '../format'
import type { ActionKind, DemoTransfer, DepositRequest, Wallet } from '../types'
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
  const { locale, t } = useClientI18n()
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

  const syncTransfer = useCallback(async (transferId: number) => {
    const { transfer: current } = await api<{ transfer: DemoTransfer }>(`/demo/transfers/${transferId}`)
    setTransfer(current)
    if (current.status === 'completed') {
      setStep('completed')
      window.dispatchEvent(new Event('momentum:data-changed'))
    } else {
      setStep(current.status === 'verification' ? 'verify' : 'processing')
    }
    return current
  }, [])

  useEffect(() => {
    api<{ items: Wallet[] }>('/wallets')
      .then(({ items }) => {
        setWallets(items)
        if (!items.some((item) => item.symbol === symbol) && items[0]) setSymbol(items[0].symbol)
      })
      .catch((err: Error) => setError(localizeClientError(err.message, locale)))
  }, [locale, symbol])

  useEffect(() => {
    if (kind !== 'send') return
    api<{ transfer: DemoTransfer | null }>('/demo/transfers/active')
      .then(({ transfer: active }) => {
        if (!active) return
        setTransfer(active)
        setStep(active.status === 'verification' ? 'verify' : 'processing')
      })
      .catch((err: Error) => setError(localizeClientError(err.message, locale)))
  }, [kind, locale])

  useEffect(() => {
    if (!transfer || transfer.status === 'completed') return
    const tick = transfer.status === 'processing'
      ? window.setInterval(() => setClock(Date.now()), 1000)
      : undefined
    const poll = window.setInterval(() => syncTransfer(transfer.id).catch(() => undefined), 5_000)
    const refreshOnFocus = () => syncTransfer(transfer.id).catch(() => undefined)
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => {
      if (tick) window.clearInterval(tick)
      window.clearInterval(poll)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [syncTransfer, transfer])

  const selected = useMemo(() => wallets.find((item) => item.symbol === symbol), [symbol, wallets])
  const changed = () => window.dispatchEvent(new Event('momentum:data-changed'))

  if (kind === 'receive') {
    return (
      <Modal title={t('receiveCrypto')} closeLabel={t('closeDialog')} onClose={onClose}>
        <div className="modal-body space-y-5">
          {selected && <div className="asset-highlight"><CoinIcon symbol={selected.symbol} /><div><strong>{selected.name}</strong><span>{selected.network} · {selected.symbol}</span></div></div>}
          <Field label={t('coin')}><CustomSelect ariaLabel={t('coin')} value={symbol} onChange={setSymbol} options={wallets.map((wallet) => ({ value: wallet.symbol, label: `${wallet.name} (${wallet.symbol})` }))} /></Field>
          {selected && <><div className="qr-shell"><QRCodeSVG value={selected.address} size={184} /></div><button className="address-copy" onClick={async () => { await copyToClipboard(selected.address); setCompleted(t('addressCopied')) }}><code>{shortAddress(selected.address, 16, 10)}</code><span><Clipboard size={16} /> {t('copy')}</span></button>{completed && <div className="success-inline"><Check size={16} /> {completed}</div>}<p className="fine-print">{t('receiveWarning', { asset: selected.symbol, network: selected.network })}</p></>}
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
      setError(localizeClientError((err as Error).message, locale))
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
      setError(t('invalidCard'))
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
      setError(localizeClientError((err as Error).message, locale))
      await syncTransfer(transfer.id).catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  const cancelTransfer = async () => {
    if (!transfer || busy) return
    setBusy(true)
    setError('')
    try {
      await api(`/demo/transfers/${transfer.id}`, { method: 'DELETE' })
      setTransfer(null)
      setVerificationCode('')
      setStep('choose')
      changed()
    } catch (err) {
      setError(localizeClientError((err as Error).message, locale))
    } finally {
      setBusy(false)
    }
  }

  const title = step === 'choose' ? t('sendFunds') : step === 'crypto' ? t('sendWallet') : step === 'card' ? t('sendCard') : t('verification')

  return (
    <Modal title={title} closeLabel={t('closeDialog')} onClose={onClose}>
      {(close) => (
      <div className="modal-body space-y-5">
        {step === 'choose' && <><p className="modal-copy">{t('chooseMethod')}</p><button className="method-card" onClick={() => setStep('crypto')}><span className="method-icon red"><WalletCards /></span><span><strong>{t('toWallet')}</strong><small>{t('walletMethodHint')}</small></span><ArrowRight size={20} /></button><button className="method-card" onClick={() => setStep('card')}><span className="method-icon blue"><CreditCard /></span><span><strong>{t('toCard')}</strong><small>{t('cardMethodHint')}</small></span><ArrowRight size={20} /></button></>}
        {step === 'crypto' && <form className="space-y-4" onSubmit={submitCrypto}><AssetAndAmount wallets={wallets} symbol={symbol} setSymbol={setSymbol} amount={amount} setAmount={setAmount} /><Field label={t('destination')}><Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder={t('walletAddress')} required /></Field><ErrorNotice message={error} /><div className="modal-actions"><Button onClick={() => setStep('choose')}><ArrowLeft size={16} /> {t('back')}</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? t('preparing') : t('continue')}</Button></div></form>}
        {step === 'card' && <form className="space-y-4" onSubmit={submitCard}><AssetAndAmount wallets={wallets} symbol={symbol} setSymbol={setSymbol} amount={amount} setAmount={setAmount} /><Field label={t('demoCard')} hint={t('cardHint')}><Input className="font-mono tracking-[0.18em]" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} inputMode="numeric" required /></Field><ErrorNotice message={error} /><div className="modal-actions"><Button onClick={() => setStep('choose')}><ArrowLeft size={16} /> {t('back')}</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? t('preparing') : t('continue')}</Button></div></form>}
        {step === 'verify' && transfer && <form className="space-y-4" onSubmit={submitCode}><Field label={t('confirmationCode')}><Input className="otp-input" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoFocus required /></Field><ErrorNotice message={error} /><div className="modal-actions verification-actions"><Button onClick={cancelTransfer} disabled={busy}><ArrowLeft size={16} /> {busy ? t('cancellingTransfer') : t('cancelTransfer')}</Button><Button type="submit" variant="primary" disabled={busy || verificationCode.length !== 6}>{busy ? t('checking') : t('submitCode')}</Button></div></form>}
        {step === 'processing' && transfer && <div className="pending-state"><Spinner className="pending-spinner" label={t('transferProcessing')} /><h3>{t('processingTitle')}</h3><p>{t('processingText', { time: remainingTime(transfer.processing_until) })}</p><Button variant="primary" className="w-full" onClick={close}>{t('close')}</Button></div>}
        {step === 'completed' && <Completion message={t('transferCompleted')} onClose={close} />}
      </div>
      )}
    </Modal>
  )
}

function AssetAndAmount({ wallets, symbol, setSymbol, amount, setAmount }: { wallets: Wallet[]; symbol: string; setSymbol: (value: string) => void; amount: string; setAmount: (value: string) => void }) {
  const { t } = useClientI18n()
  const wallet = wallets.find((item) => item.symbol === symbol)
  return <><Field label={t('coin')}><CustomSelect ariaLabel={t('coin')} value={symbol} onChange={setSymbol} options={wallets.map((item) => ({ value: item.symbol, label: `${item.name} (${item.symbol})` }))} /></Field><Field label={t('amount')} hint={wallet ? t('available', { amount: assetAmount(wallet.balance, wallet.symbol) }) : undefined}><Input type="number" min="0.00000001" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></Field></>
}

function Completion({ message, onClose }: { message: string; onClose: () => void }) {
  const { t } = useClientI18n()
  return <div className="pending-state"><span className="completion-mark"><Check /></span><h3>{message}</h3><p>{t('transactionSaved')}</p><Button variant="primary" className="w-full" onClick={onClose}>{t('done')}</Button></div>
}

function BuyModalContent({ wallets, symbol, setSymbol, onClose, changed }: { wallets: Wallet[]; symbol: string; setSymbol: (value: string) => void; onClose: () => void; changed: () => void }) {
  const { locale, t } = useClientI18n()
  const [amount, setAmount] = useState('500'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [request, setRequest] = useState<DepositRequest | null>(null)
  useEffect(() => { api<{ items: DepositRequest[] }>('/deposit-requests').then(({ items }) => setRequest(items.find((item) => item.status === 'pending') || null)).catch((err: Error) => setError(localizeClientError(err.message, locale))) }, [locale])
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const result = await api<{ request: DepositRequest }>('/deposit-requests', { method: 'POST', body: JSON.stringify({ asset: symbol, amount_usd: amount }) }); changed(); setRequest(result.request) } catch (err) { setError(localizeClientError((err as Error).message, locale)) } finally { setBusy(false) } }
  return <Modal title={t('depositFunds')} closeLabel={t('closeDialog')} onClose={onClose}>{(close) => <div className="modal-body space-y-5">{request ? <div className="pending-state"><span className="completion-mark"><Check /></span><h3>{t('depositRequestSent')}</h3><p>{t('depositRequestPending', { amount: request.amount_usd, asset: request.asset })}</p><Button variant="primary" className="w-full" onClick={close}>{t('done')}</Button></div> : <form className="space-y-4" onSubmit={submit}><div className="asset-highlight"><span className="method-icon red"><BadgeDollarSign /></span><div><strong>{t('depositRequest')}</strong><span>{t('depositReviewHint')}</span></div></div><Notice variant="warning">{t('depositVerificationNotice')}</Notice><Field label={t('coin')}><CustomSelect ariaLabel={t('coin')} value={symbol} onChange={setSymbol} options={wallets.map((item) => ({ value: item.symbol, label: `${item.name} (${item.symbol})` }))} /></Field><Field label={t('amountUsd')}><Input type="number" min="1" max="50000" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field><ErrorNotice message={error} /><Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? t('sending') : t('submitDepositRequest')}</Button></form>}</div>}</Modal>
}

function SwapModalContent({ wallets, onClose, changed }: { wallets: Wallet[]; onClose: () => void; changed: () => void }) {
  const { locale, t } = useClientI18n()
  const [from, setFrom] = useState('USDT'); const [to, setTo] = useState('BTC'); const [amount, setAmount] = useState('100'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const result = await api<{ received: string }>('/demo/swap', { method: 'POST', body: JSON.stringify({ from_asset: from, to_asset: to, amount }) }); changed(); setDone(t('swapReceived', { amount: assetAmount(result.received, to) })) } catch (err) { setError(localizeClientError((err as Error).message, locale)) } finally { setBusy(false) } }
  const source = wallets.find((item) => item.symbol === from)
  return <Modal title={t('swapAssets')} closeLabel={t('closeDialog')} onClose={onClose}>{(close) => <div className="modal-body space-y-5">{done ? <Completion message={done} onClose={close} /> : <form className="space-y-4" onSubmit={submit}><div className="swap-grid"><Field label={t('from')}><CustomSelect ariaLabel={t('assetToSwap')} value={from} onChange={setFrom} options={wallets.map((item) => ({ value: item.symbol, label: item.symbol }))} /></Field><button type="button" className="swap-arrow" aria-label={t('switchAssets')} onClick={() => { setFrom(to); setTo(from) }}><RefreshCw size={20} /></button><Field label={t('to')}><CustomSelect ariaLabel={t('assetToReceive')} value={to} onChange={setTo} options={wallets.map((item) => ({ value: item.symbol, label: item.symbol }))} /></Field></div><Field label={t('amount')} hint={source ? t('available', { amount: assetAmount(source.balance, source.symbol) }) : undefined}><Input type="number" min="0.00000001" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field><p className="fine-print">{t('referenceQuote')}</p><ErrorNotice message={error} /><Button type="submit" variant="primary" className="w-full" disabled={busy || from === to}>{busy ? t('swapping') : t('swapNow')}</Button></form>}</div>}</Modal>
}

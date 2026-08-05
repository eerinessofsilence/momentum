import type { Wallet } from '../types'
import bitcoinLogo from '../assets/coins/bitcoin-logo.svg'
import ethereumLogo from '../assets/coins/ethereum-logo.svg'
import tetherLogo from '../assets/coins/tether-logo.svg'
import tonLogo from '../assets/coins/ton-logo.png'

const coinLogos: Record<string, { src: string; background: string }> = {
  BTC: { src: bitcoinLogo, background: 'transparent' },
  ETH: { src: ethereumLogo, background: '#eef0f7' },
  USDT: { src: tetherLogo, background: 'transparent' },
  TON: { src: tonLogo, background: 'transparent' },
}

export function CoinIcon({ symbol, size = 'md' }: { symbol: Wallet['symbol'] | string; size?: 'sm' | 'md' | 'lg' }) {
  const item = coinLogos[symbol]
  const sizes = { sm: 'h-9 w-9 text-base', md: 'h-12 w-12 text-xl', lg: 'h-14 w-14 text-2xl' }

  if (!item) {
    return <span className={`coin-icon coin-icon-fallback ${sizes[size]}`} aria-label={symbol}>{symbol.slice(0, 1)}</span>
  }

  return (
    <span
      className={`coin-icon coin-icon-${symbol.toLowerCase()} ${sizes[size]}`}
      style={{ background: item.background }}
      aria-label={symbol}
    >
      <img src={item.src} alt="" aria-hidden="true" />
    </span>
  )
}

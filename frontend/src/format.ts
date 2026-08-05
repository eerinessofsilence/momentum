export function money(value: string | number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(Number(value))
}

export function assetAmount(value: string | number, symbol: string) {
  const numeric = Number(value)
  const maximumFractionDigits = symbol === 'BTC' || symbol === 'ETH' ? 6 : 2
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Math.abs(numeric))} ${symbol}`
}

export function shortAddress(address: string, front = 10, back = 7) {
  if (address.length <= front + back + 1) return address
  return `${address.slice(0, front)}…${address.slice(-back)}`
}

export function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}


export type Theme = 'dark' | 'light'

export type User = {
  id: number
  name: string
  username: string
  email: string
  created_at: string
  theme: Theme
  sounds: boolean
  is_staff: boolean
}

export type Wallet = {
  id: number
  name: string
  symbol: 'BTC' | 'ETH' | 'USDT' | 'TON'
  network: string
  address: string
  balance: string
  price_usd: string
  usd_value: string
  change_24h: string
}

export type Transaction = {
  id: number
  kind: 'receive' | 'send' | 'buy' | 'swap' | 'withdrawal'
  status: 'approved' | 'pending' | 'failed'
  asset: string
  amount: string
  usd_value: string
  title: string
  details: Record<string, string | boolean>
  created_at: string
}

export type DashboardData = {
  total_balance: string
  periods: Record<DashboardPeriod, { change: string; values: string[] }>
  wallets: Wallet[]
  transactions: Transaction[]
}

export type DashboardPeriod = '1H' | '24H' | '1W' | '1M' | 'ALL'

export type SupportMessage = {
  id: number
  sender: 'user' | 'support'
  body: string
  created_at: string
  attachment: null | { id: number; url: string; filename: string }
}

export type ActionKind = 'receive' | 'send' | 'buy' | 'swap'

export type StaffClientSummary = {
  id: number
  name: string
  username: string
  email: string
  created_at: string
  total_balance: string
  transaction_count: number
  needs_reply: boolean
  last_message_at: string | null
}

export type ConfirmationCode = {
  id: number
  code: string
  status: 'ready' | 'used'
  created_at: string
}

export type StaffClient = StaffClientSummary & {
  wallets: Wallet[]
  transactions: Transaction[]
  messages: SupportMessage[]
  codes: ConfirmationCode[]
}

export type Theme = 'dark' | 'light'
export type ClientLocale = 'en' | 'fr' | 'es' | 'de'
export type ProfileStatus = 'active' | 'suspended' | 'archived'

export type User = {
  id: number
  client_number: number
  name: string
  username: string
  email: string
  created_at: string
  theme: Theme
  sounds: boolean
  language: ClientLocale
  is_staff: boolean
  impersonating: boolean
  account_status: ProfileStatus
  daily_send_limit: string
  monthly_send_limit: string
  manual_review_threshold: string
  verification: VerificationStatus
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
  kind: 'receive' | 'send' | 'buy' | 'swap' | 'withdrawal' | 'adjustment'
  status: 'approved' | 'pending' | 'failed'
  asset: string
  amount: string
  usd_value: string
  title: string
  details: Record<string, string | number | boolean>
  created_at: string
  effective_at: string
  editable: boolean
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

export type DepositRequest = {
  id: number
  asset: string
  amount_usd: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  decided_at: string | null
}

export type StaffClientSummary = {
  id: number
  client_number: number
  name: string
  account_status: ProfileStatus
  username: string
  email: string
  created_at: string
  total_balance: string
  transaction_count: number
  needs_reply: boolean
  last_message_at: string | null
  verification_state: VerificationState
  verification_required: number
  verification_used: number
  processing_until: string | null
}

export type ConfirmationCode = {
  id: number
  code: string
  status: 'ready' | 'used'
  created_at: string
}

export type StaffClient = StaffClientSummary & {
  daily_send_limit: string
  monthly_send_limit: string
  manual_review_threshold: string
  theme: Theme
  sounds: boolean
  wallets: Wallet[]
  transactions: Transaction[]
  messages: SupportMessage[]
  codes: ConfirmationCode[]
  deposit_requests: DepositRequest[]
}

export type VerificationState = 'locked' | 'verification' | 'processing' | 'completed'

export type VerificationStatus = {
  state: VerificationState
  required: number
  used: number
  processing_until: string | null
  active_transfer_id?: number | null
}

export type DemoTransfer = {
  id: number
  method: 'card' | 'crypto'
  asset: string
  amount: string
  destination: string
  status: 'verification' | 'processing' | 'completed'
  required_codes: number
  used_codes: number
  processing_until: string | null
  created_at: string
}

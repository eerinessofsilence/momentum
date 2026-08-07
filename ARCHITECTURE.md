# Momentum architecture

Compact system map. Read this before making cross-cutting changes.

## Shape

```
browser ──► nginx (prod only, TLS) ──► uvicorn / FastAPI ──► PostgreSQL
                                            │
                                            ├─► backend/static  (built SPA, prod)
                                            ├─► backend/uploads (support attachments)
                                            └─► api.coingecko.com (background price loop)
```

Development runs the SPA on Vite (`:5173`) with `/api` and `/uploads` proxied
to the API (`:8000`). Production builds the SPA into the API image
(`backend/Dockerfile.prod`), so everything is one origin and the catch-all
route at the bottom of `app/main.py` serves `index.html` for unknown paths.

## Data model

`backend/app/models.py`. All child tables cascade from `users`.

| Table | Purpose | Notes |
| --- | --- | --- |
| `users` | Account + role + verification state | `is_staff`, `account_status` (`active`/`suspended`/`archived`), `profile_label`, `verification_target`/`verification_used`/`verification_state`, `processing_until` |
| `sessions` | Cookie sessions | Stores SHA-256 `token_hash`, never the raw token |
| `wallets` | One row per (user, symbol) | `Numeric(28,8)` balance, cached `price_usd` / `change_24h` |
| `transactions` | Ledger | `kind` = receive/send/buy/swap/withdrawal, `status` = approved/pending/failed, signed `amount`, free-form `details` JSON |
| `demo_transfers` | Multi-code transfer state machine | `method` card/crypto, `status` verification/processing/completed, links to the `pending` transaction |
| `deposit_requests` | Support-reviewed balance funding | `asset`, USD amount, pending/approved/rejected decision, links to the credited transaction and moderator |
| `confirmation_codes` | Moderator-issued 6-digit codes | Consumed in creation order, `status` ready/used, max 1000 ready per profile |
| `support_messages` / `support_attachments` | Support thread | `sender` user/support; attachments served from `/uploads` |
| `preferences` | Theme + sounds + `last_support_read_at` | PK is `user_id` |

Migrations: `backend/alembic/versions/0001` … `0011` (head). `create_all()` is
only used for the SQLite test database — PostgreSQL changes must be a
migration.

## Auth

- Login/register issue an opaque token; only its SHA-256 hash is persisted.
- Cookie `momentum_session`, HttpOnly, SameSite=Lax, `secure=not DEMO_MODE`,
  lifetime `SESSION_DAYS`.
- `current_user` resolves the cookie → session → user and rejects accounts that
  are not `active` (403). `current_staff` layers the `is_staff` check.
- Impersonation adds a second cookie `momentum_staff_session` holding the staff
  token; see CLAUDE.md § Impersonation.
- Passwords: argon2id (`time_cost=2, memory_cost=64MiB, parallelism=2`).

## Money and pricing

- Every amount is `Decimal`. USD quantizes to `0.01`; asset quantities to
  `1e-8` with `ROUND_DOWN` so rounding never manufactures value.
- Wallet rows cache the price. `app/prices.py` polls CoinGecko every
  `PRICE_REFRESH_INTERVAL_SECONDS` and updates `price_usd` / `change_24h` for
  **all** wallets of a symbol at once. A failed refresh keeps the previous
  values and only logs.
- Swap charges `SWAP_FEE_RATE` (0.5%) and writes a single transaction row for
  the "from" leg; the "to" leg lives in `details.received` /
  `details.target_asset`.

## Portfolio chart

`GET /api/dashboard` returns `periods` for `1H/24H/1W/1M/ALL`.
`portfolio_history()` replays the transaction ledger **backwards** from the
current balances to recover each asset's quantity at every sample point, then
prices all points at today's rate. Pricing on one consistent basis is
deliberate — using each transaction's historical `usd_value` snapshot produced
nonsense (including negative totals) when prices moved. `transaction_asset_deltas()`
is what makes swaps contribute both legs. Windows/sample counts live in
`PERIOD_WINDOWS`.

## Verification state machine

```
             moderator sets target + generates codes
                          │
   locked ────────────────┴─────────────► verification
                                              │  each correct code in order
                                              │  (secrets.compare_digest)
                          used >= required    ▼
                          debit wallet, write pending txn
                                              │
                                        processing (24h)
                                              │  first read after processing_until
                                              ▼
                                          completed  (txn → approved)
```

Completion is **lazy**: `refresh_demo_transfer()` runs on read
(`/api/demo/transfers/active`, `/api/demo/transfers/{id}`,
`/api/verification/status`). There is no background job. Only one transfer may
be active per user (409 otherwise), and codes cannot be cleared while one is
active.

## API surface

All routes are under `/api`. `app/main.py` declares them on `app` directly.

- Auth — `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`,
  `GET /auth/me`, `POST /auth/impersonation/exit`
- Wallet — `GET /dashboard`, `GET /wallets`, `GET /transactions`,
  `GET|PATCH /preferences`, `GET /app-config`, `GET /health`
- Demo operations — `POST /demo/send`, `POST /demo/swap`
- Verified transfers — `POST /demo/transfers`, `GET /demo/transfers/active`,
  `GET|DELETE /demo/transfers/{id}`, `POST /demo/transfers/{id}/codes`,
  `GET /verification/status`
- Deposits — `GET/POST /deposit-requests`; creating a request never changes a
  balance. Staff approval through the client workspace performs the locked
  wallet credit and creates the transaction exactly once.
- Support — `GET /support/messages`, `POST /support/messages`,
  `POST /support/read`, `POST /support/attachments`
- Staff — `GET /staff/clients` (`query`, `page`, `page_size`),
  `POST /staff/clients`, `GET /staff/clients/{id}`,
  `POST /staff/clients/{id}/impersonate`,
  `POST /staff/clients/{id}/reset-password`,
  `PATCH /staff/clients/{id}/verification`, `PATCH /staff/clients/{id}/status`,
  `PATCH /staff/clients/{id}/settings`,
  `PATCH /staff/clients/{id}/transactions/{transaction_id}`,
  `POST /staff/clients/{id}/balance`,
  `POST /staff/clients/{id}/deposit-requests/{request_id}/decision`,
  `POST /staff/clients/{id}/messages`, `POST|DELETE /staff/clients/{id}/codes`

Responses are plain dicts built by `serialize_user` / `serialize_wallet` /
`serialize_transaction` / `serialize_demo_transfer` / `serialize_staff_client`.
`frontend/src/types.ts` mirrors them by hand — the two must be changed together.

## Frontend flow

```
main.tsx → AuthProvider → App (usePathname)
   ├── /auth   → AuthPage
   ├── /staff  → StaffRoute → StaffPage           (is_staff only)
   └── /app/*  → ProtectedShell → AppShell → page (non-staff only)
```

`App.tsx` redirects unknown paths to `/app/overview`, staff users to `/staff`,
and signed-out users to `/auth`. Data fetching is per-page `useEffect` +
`api()`; there is no query cache. `AppShell` polls support unread every 15s and
hosts the buy/send/swap/receive `ActionModal`.

## Deployment

`docker-compose.prod.yml` (and the default `docker-compose.yml`) build
`backend/Dockerfile.prod`: a Node stage builds the SPA, the Python stage copies
`dist/` to `/app/static`. The API publishes only to `127.0.0.1:8000`; host
nginx (`deploy/nginx.conf`) terminates TLS. Uploads and Postgres data live in
named volumes. Full runbook: [deploy/README.md](deploy/README.md).

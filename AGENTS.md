# Momentum agent guide

Tool-agnostic instructions for any coding agent working in this repository.
Claude Code additionally reads [CLAUDE.md](CLAUDE.md); the system map lives in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Purpose

Momentum is a responsive crypto-wallet web app: a React SPA over a FastAPI
monolith backed by PostgreSQL. It runs as a **development environment** —
balances, transfers and support replies are simulated; there is no blockchain,
bank, exchange, or email integration. The only outbound call is a CoinGecko
price refresh. It ships two surfaces from one codebase: the client wallet
(`/app/*`) and the moderator Operations workspace (`/staff`), split by
`users.is_staff`.

## Repository map

- `backend/app/main.py` — the entire API: setup, lifespan, dependencies,
  serializers, all routes. No router split; find endpoints by path string.
- `backend/app/models.py` — SQLAlchemy 2.x models.
- `backend/app/schemas.py` — Pydantic **request** bodies only.
- `backend/app/security.py` — argon2, session tokens, OTP, temp passwords.
- `backend/app/seed.py` — idempotent startup seeding + per-user provisioning.
- `backend/app/prices.py` — CoinGecko refresh loop.
- `backend/app/config.py` — pydantic-settings reading the repo-root `.env`.
- `backend/alembic/versions/` — ordered migrations (head `0011`). Never treat
  as generated noise.
- `backend/tests/test_api.py` — API tests against a throwaway SQLite file.
- `frontend/src/App.tsx`, `src/router.ts` — pathname routing, no react-router.
- `frontend/src/AuthContext.tsx` — session, theme, impersonation.
- `frontend/src/api.ts` — fetch wrapper, `ApiError`.
- `frontend/src/types.ts` — hand-maintained mirror of API responses.
- `frontend/src/components/UI.tsx` — the shared primitive set.
- `frontend/src/components/AppShell.tsx` — client chrome, action modal host.
- `frontend/src/pages/` — one file per route; `StaffPage.tsx` is the whole
  moderator workspace.
- `frontend/src/index.css` — design tokens and all component styles, with
  comments explaining the motion decisions. Read before restyling.
- `deploy/` — VPS runbook, nginx config, self-signed cert script.

## Entry points and important flows

- SPA boot: `src/main.tsx` → `AuthProvider` → `App` → `AppShell`/`StaffPage`.
- Requests: page → `api()` in `src/api.ts` → `/api/...` (cookie credentials
  included) → FastAPI route → `serialize_*` dict.
- API boot: `app/main.py:lifespan` → SQLite-only `create_all` → `seed_demo_user`
  + `seed_staff_workspace` → optional price-refresh task.
- Persistence: route → `get_db()` async session → model. PostgreSQL schema
  changes require an Alembic migration.
- Verified transfer: `POST /api/demo/transfers` → code submissions →
  `begin_demo_processing` (debit + pending txn + 24h hold) → lazy completion in
  `refresh_demo_transfer` on the next read. See ARCHITECTURE.md.
- Impersonation: `POST /api/staff/clients/{id}/impersonate` swaps the session
  cookie and stashes the staff token in `momentum_staff_session`;
  `POST /api/auth/impersonation/exit` restores it.
- Portfolio chart: `GET /api/dashboard` → `portfolio_history()` replays the
  ledger backwards and prices every sample at the current rate.

## Commands

```bash
docker compose -f docker-compose.dev.yml up --build   # db + api + vite
```

```bash
cd backend && uv sync --extra dev && uv run alembic upgrade head && uv run uvicorn app.main:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

Checks — run the smallest relevant one first, then these before finishing:

```bash
cd backend && uv run pytest && uv run ruff check app tests
```

```bash
cd frontend && npm run lint && npm run test && npm run build
```

Lint `app tests`, not `.` — `alembic/versions/` carries 17 pre-existing E501 /
I001 violations that should stay untouched. Baseline as of this file:
13 pytest tests pass, 9 vitest tests pass, `ruff check app tests` is clean.

Seeded logins: `demo` / `Momentum123!`, `moderator` / `MomentumAdmin123!`,
clients `mia|ethan|nora|marcus|olivia` / `Momentum123!`.

## Backend rules

- SQLAlchemy 2.x only: `select(...)` with `db.scalar` / `db.scalars`.
- Money is `Decimal` end to end. Use `as_decimal()`; quantize USD to `0.01`
  and quantities to `MONEY_EPSILON` with `ROUND_DOWN`. No `float` anywhere near
  a balance.
- Lock before mutating a balance: `owned_wallet(..., lock=True)`.
- Validate assets with `require_asset()`; the supported set is fixed
  (`BTC/ETH/USDT/TON`).
- Naive UTC datetimes via `now()`; serialize with `utc_iso()`.
- Response shapes are the `serialize_*` helpers — change them and
  `frontend/src/types.ts` together.
- Any persisted-field change needs an Alembic migration; `create_all()` only
  covers the SQLite test database.
- Never store a raw session token or a plaintext password. Keep
  `secure=not DEMO_MODE` on session cookies, and keep the staff-cookie
  impersonation design intact.
- Codes are compared with `secrets.compare_digest` and consumed in creation
  order. Keep the one-active-transfer and 1000-ready-codes limits.
- The price loop must never crash the app: keep the broad `except` + log.
- Self-registered accounts get zero balances. Do not seed fake money for new
  signups.

## Frontend rules

- Reuse `components/UI.tsx` primitives and the existing `index.css` classes
  before writing new markup or styles.
- Use the CSS variables for spacing, radii, control heights, easing and
  duration (`--space-*`, `--r-*`, `--control-*`, `--ease-*`, `--dur-*`,
  `--stagger`). Add light-mode counterparts under `:root[data-theme='light']`.
- Motion vocabulary: entrances `--ease-out`, dismissals `--ease-in`, on-screen
  travel `--ease-in-out`; entrance travel stays under ~12px.
- Icons from `@phosphor-icons/react`, imported with the existing `as` aliases.
- Keep `types.ts` in sync with the API; do not use `any` to paper over drift.
- Formatting varies by file (most files: no semicolons, single quotes;
  `StaffPage.tsx`: semicolons, double quotes). Match the file, do not reformat.
- Layout must hold from 320px up, and both themes must look right.
- Lint runs with `--max-warnings=0`.

## Change checklists

Backend field or API change:

1. Update the SQLAlchemy model.
2. Add an Alembic migration (`down_revision` = current head).
3. Update the Pydantic input schema if the request changes.
4. Update the route and its `serialize_*` helper.
5. Update `frontend/src/types.ts`.
6. Update the pages/components that consume it.
7. Add or adjust `backend/tests/test_api.py` coverage.
8. Run `pytest` and `npm run build`.

Frontend-only UI change:

1. Reuse existing primitives, tokens and classes.
2. Cover loading, empty, error and disabled states.
3. Check dark and light themes plus a narrow viewport.
4. Run `npm run lint` and `npm run build`.

Verification / transfer flow change:

1. `models.py` + migration, 2. the `/api/demo/transfers*` routes and
`refresh_demo_transfer` / `begin_demo_processing`, 3. `types.ts`,
4. `ActionModal.tsx` and the `AppShell` banner, 5. `StaffPage.tsx` codes panel,
6. `test_managed_profile_and_persistent_multi_code_transfer`.

## Working agreements

- Read the surrounding code before editing; keep the diff scoped to the ask.
- Do not reformat unrelated files or revert unrelated working-tree changes; a
  dirty tree means the user has work in progress.
- Do not commit secrets — `.env.example` / `.env.prod.example` hold
  placeholders only.
- Report changed files and the verification commands you actually ran.

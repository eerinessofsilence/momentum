# CLAUDE.md

Project-specific context for Claude Code working in this repository.

## Project Overview

Momentum is a responsive crypto-wallet web application. It is a **development /
demo environment**: there is no blockchain, bank, exchange, or email
integration. Balances and transfers are simulated in PostgreSQL. The only
external call is a background CoinGecko price refresh.

- `backend/` — FastAPI (Python 3.9+ target, runs on 3.12) with SQLAlchemy 2.x
  async, Alembic, argon2 password hashing, cookie sessions, pytest.
- `frontend/` — Vite + React 18 + TypeScript SPA, Tailwind 3 + a large
  hand-written `src/index.css`, custom hash-free history router.
- `deploy/` — Debian 12 VPS runbook, nginx reverse-proxy config, self-signed
  cert script.
- `docker-compose.dev.yml` — db + api + vite dev stack.
- `docker-compose.yml` / `docker-compose.prod.yml` — production stack (single
  image: the API serves the built frontend from `backend/static`).

Two products live in one app, split by the `users.is_staff` flag:

1. **Client wallet** (`/app/*`) — overview, wallets, history, support,
   settings, plus buy/send/swap/receive action modals.
2. **Operations workspace** (`/staff`) — moderator tooling: create labelled
   client profiles, reset temporary passwords, credit balances, reply to
   support, manage confirmation codes, suspend/archive profiles, and open a
   client profile via impersonation.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system map and the verification
/ demo-transfer state machine. See [AGENTS.md](AGENTS.md) for the portable
agent guide (repo map, conventions, change checklists).

## Important Commands

Docker development (recommended — creates the role/database automatically):

```bash
docker compose -f docker-compose.dev.yml up --build
```

Frontend at http://localhost:5173, API at http://localhost:8000
(http://localhost:8000/docs for the OpenAPI UI — routes are under `/api`, the
docs URL is not).

Native backend:

```bash
cd backend && uv sync --extra dev && uv run alembic upgrade head && uv run uvicorn app.main:app --reload
```

Native frontend (Vite proxies `/api` and `/uploads` to `VITE_API_PROXY`,
default `http://localhost:8000`):

```bash
cd frontend && npm install && npm run dev
```

`.claude/launch.json` defines the `momentum-frontend` preview server on 5173.
It starts Vite **only** — the API and PostgreSQL must already be running, or
every request 500s through the proxy.

Checks:

```bash
cd backend && uv run pytest && uv run ruff check app tests
```

```bash
cd frontend && npm run lint && npm run test && npm run build
```

`ruff check .` also scans `alembic/versions/`, which has 17 pre-existing E501 /
I001 violations. Those are historical migrations — leave them alone and lint
`app tests` instead. The local venv is Python 3.10; the target in
`pyproject.toml` is `py39`, so avoid 3.10+-only syntax outside
`from __future__ import annotations` type positions.

## Seeded Accounts

Created on every API startup by `backend/app/seed.py` (idempotent), but only
when `DEMO_MODE=true` — production (`DEMO_MODE=false`) skips this seeding
entirely, so a fresh production database has no accounts until someone
registers or one is provisioned manually.

| Role | Username | Password |
| --- | --- | --- |
| Client (demo data) | `demo` | `Momentum123!` |
| Moderator | `moderator` | `MomentumAdmin123!` |
| Clients | `mia`, `ethan`, `nora`, `marcus`, `olivia` | `Momentum123!` |

Self-registered accounts start with **zero** balances and no transaction
history — only the seeded profiles get demo data (`provision_user(...,
seed_demo_data=True)`). Do not reintroduce fake starting balances for new
signups; that was removed deliberately (commit `ee4bdde`).

## Backend Structure

- `app/main.py` — the whole API: app setup, lifespan (schema bootstrap for
  SQLite tests, seeding, price-refresh task), dependencies, serializers, and
  every route. ~1.4k lines, no router split.
- `app/models.py` — SQLAlchemy models: `User`, `Session`, `Wallet`,
  `Transaction`, `DemoTransfer`, `DepositRequest`, `ConfirmationCode`,
  `SupportMessage`, `SupportAttachment`, `Preference`.
- `app/schemas.py` — Pydantic request bodies. Responses are hand-built dicts
  from the `serialize_*` helpers in `main.py`, not Pydantic models.
- `app/security.py` — argon2 hashing, session tokens (SHA-256 hashed at rest),
  6-digit OTP, temporary passwords.
- `app/seed.py` — demo user, staff workspace, per-user wallet provisioning and
  deterministic addresses.
- `app/prices.py` — CoinGecko polling loop; failures are logged and swallowed.
- `app/config.py` — pydantic-settings, reads the repo-root `.env`.
- `alembic/versions/` — ordered migrations, current head is `0011`.
- `tests/test_api.py` — TestClient-based API tests on a throwaway SQLite file.

Backend conventions:

- SQLAlchemy 2.x style only: `select(...)` + `db.scalar` / `db.scalars`, never
  legacy `Query`.
- All money is `Decimal`. Convert with `as_decimal()`, quantize USD to
  `0.01` and asset quantities to `MONEY_EPSILON` (1e-8) with `ROUND_DOWN`.
  Never introduce `float` into a balance path.
- Balance mutations lock the row: `owned_wallet(db, user_id, symbol,
  lock=True)`.
- Timestamps are naive UTC (`datetime.utcnow()` via `now()`); serialize
  through `utc_iso()` so the frontend gets a `Z` suffix.
- Supported assets are the fixed set `BTC/ETH/USDT/TON`; validate through
  `require_asset()`.
- `create_all()` runs only on SQLite (tests). PostgreSQL schema changes
  **require an Alembic migration** — see the comment in `lifespan`.
- Staff routes depend on `current_staff`; client routes on `current_user`
  (which also rejects non-`active` accounts with 403).

## Frontend Structure

- `src/main.tsx` → `src/App.tsx` — routing is a `pages` record keyed by
  pathname plus two special routes (`/auth`, `/staff`). `src/router.ts` is a
  ~20-line `history.pushState` + `popstate` router; there is no react-router.
- `src/AuthContext.tsx` — session state, login/register/logout, preference
  writes, staff impersonation enter/exit, theme application via
  `document.documentElement.dataset.theme`.
- `src/api.ts` — `api<T>(path, options)` wrapper over `fetch` with
  `credentials: 'include'`, prefixes `/api`, throws `ApiError` carrying the
  HTTP status and the FastAPI `detail`.
- `src/types.ts` — hand-maintained mirrors of the backend response shapes.
- `src/components/UI.tsx` — the primitive set (`Button`, `Input`, `Textarea`,
  `Field`, `Card`, `CardHeader`, `Badge`, `Tabs`, `ListRow`, `EmptyState`,
  `Notice`, `Spinner`, `cx`). Reuse these before writing new markup.
- `src/components/AppShell.tsx` — client nav, support unread polling (15s),
  verification banner, action modal host, "return to operations" bar while
  impersonating.
- `src/pages/StaffPage.tsx` — the entire moderator workspace (~1.3k lines).
- `src/index.css` — design tokens under `:root` / `:root[data-theme='light']`
  and every component style, heavily commented with the *reasoning* behind the
  motion design.

Frontend conventions:

- Style with the CSS variables and existing class names in `index.css`
  (`--space-*`, `--r-*`, `--control-*`, `--ease-*`, `--dur-*`, `--stagger`).
  Tailwind is available but the codebase is mostly hand-written CSS classes;
  follow the file you are editing.
- Both themes must work. Light mode overrides live in
  `:root[data-theme='light']` — add a variable there whenever you add a colour.
- Motion vocabulary is deliberate: entrances use `--ease-out`, dismissals
  `--ease-in`, on-screen travel `--ease-in-out`. Keep entrance travel under
  ~12px. Read the comment above the keyframes block before adding animation.
- Icons come from `@phosphor-icons/react`, imported with `as` aliases to
  lucide-ish names (`Question as CircleHelp`). Keep that pattern.
- Formatting is inconsistent across files by history: most files use no
  semicolons + single quotes; `StaffPage.tsx` uses semicolons + double quotes.
  Match the file you are in rather than reformatting.
- `npm run lint` runs with `--max-warnings=0`.

## Verification / Demo Transfer Flow

The distinctive piece of domain logic. Card and crypto sends both go through
`DemoTransfer`:

1. Moderator sets `verification_target` (required code count) and generates
   `ConfirmationCode` rows for the client.
2. Client starts a transfer → `POST /api/demo/transfers` (409 if one is
   already active). State `verification`.
3. Client submits codes one at a time → `POST /api/demo/transfers/{id}/codes`.
   Codes must be entered **in creation order**; comparison uses
   `secrets.compare_digest`.
4. When `used_codes >= required_codes`, `begin_demo_processing` debits the
   wallet, writes a `pending` transaction, and parks the transfer in
   `processing` for 24 hours (`processing_until`).
5. Any read of the transfer after that deadline (`refresh_demo_transfer`)
   flips it to `completed` and approves the transaction. There is no worker —
   completion is lazy, on read.

`users.verification_state` mirrors the active transfer
(`locked | verification | processing | completed`) and drives the client-side
banner. When changing this flow, update `models.py`, `main.py`, `types.ts`,
`ActionModal.tsx`, `StaffPage.tsx`, and
`test_managed_profile_and_persistent_multi_code_transfer`.

## Impersonation

`POST /api/staff/clients/{id}/impersonate` issues a normal client session
cookie (`momentum_session`) and stashes the staff token in a second HttpOnly
cookie (`momentum_staff_session`). No client password is ever exposed to the
browser. `POST /api/auth/impersonation/exit` deletes the client session and
restores the staff one. `/api/auth/me` reports `impersonating: true` while the
staff cookie is valid. Do not weaken this: the staff session must remain the
only authority that can restore the workspace.

## Environment

Backend settings come from the repo-root `.env` (`.env.example`,
`.env.prod.example`). Key values: `DATABASE_URL`, `SESSION_DAYS`, `DEMO_MODE`,
`PRICE_REFRESH_ENABLED`, `PRICE_REFRESH_INTERVAL_SECONDS`, `FRONTEND_ORIGIN`,
and the deployment secrets documented in `.env.prod.example`.

`DEMO_MODE` matters for security, not just copy: session cookies are set with
`secure=not demo_mode`. Production must run `DEMO_MODE=false`.
`PRICE_REFRESH_ENABLED=false` for environments without outbound internet.

Do not commit real secrets; `.env.example` holds placeholders only.

## Development Guidelines

- Read the surrounding code before editing; keep changes scoped to the request.
- Do not reformat unrelated files or revert unrelated working-tree changes.
- When changing a persisted field: model → Alembic migration → Pydantic schema
  → route/serializer → `frontend/src/types.ts` → the pages that consume it →
  tests.
- Add or update pytest coverage when backend behaviour changes.
- Run the smallest relevant check first (`pytest -k ...`, `npm run lint`), then
  the broader ones when the change crosses the API boundary.
- For UI changes, verify both themes and the mobile width (the layout is
  min-width 320px).

## Notes For Claude

- The user may also use Codex here — keep project instructions portable
  (that is what `AGENTS.md` is for).
- Prefer direct implementation when the request is clear; ask only when a
  missing product decision would create risky behaviour.
- Keep responses concise: changed files plus verification results.

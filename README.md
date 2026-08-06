# Momentum

Momentum is a responsive crypto-wallet interface inspired by the supplied visual references. This repository currently runs as a development environment with simulated transactions and no external blockchain, bank, exchange, or email integrations.

## Local Docker development

```bash
docker compose -f docker-compose.dev.yml up --build
```

Open [http://localhost:5173](http://localhost:5173). A development account is created automatically on first API startup:

- Username: `demo`
- Password: `Momentum123!`

A separate moderator account opens the Operations workspace:

- Username: `moderator`
- Password: `MomentumAdmin123!`

The seeded client profiles use the same initial password, `Momentum123!`:

| Client | Username |
| --- | --- |
| Mia Warren | `mia` |
| Ethan Cole | `ethan` |
| Nora Hayes | `nora` |
| Marcus Chen | `marcus` |
| Olivia Lane | `olivia` |

If a moderator resets a client's temporary password, use the newly displayed password instead.

## Local development

Start PostgreSQL and create the local role/database once:

```bash
psql -h 127.0.0.1 -d postgres -c "CREATE ROLE momentum LOGIN PASSWORD 'momentum';"
createdb -h 127.0.0.1 -O momentum momentum
```

Docker Compose performs this initialization automatically. For a native PostgreSQL installation, copy `.env.example` to `.env`, then:

```bash
cd backend
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

If PostgreSQL reports `role "momentum" does not exist`, run the two initialization commands above before Alembic.

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` and `/uploads` to FastAPI. The production frontend build can be copied to `backend/static`; FastAPI will serve it as a single-origin application.

## Development environment

- New users receive deterministic BTC, ETH, USDT, and TON wallet data.
- Buy, send, swap, receive, and bank-card withdrawal flows use simulated balances.
- The demo card form accepts a card number, while the API receives and stores only `last4`.
- Card and crypto transfers use moderator-managed profile confirmation codes.
- Support replies are generated locally and persisted in PostgreSQL.
- Moderators can create labelled client profiles, issue one-time temporary passwords, credit
  simulated balances, search by label/login/email/ID, and configure up to 1,000 confirmation codes.
- Card and crypto sends share a persistent demo-verification workflow. After the configured codes
  are consumed in order, the transfer remains in a saved 24-hour processing state before completion.

## Production deployment

See [deploy/README.md](deploy/README.md) for a Debian 12 VPS runbook. The
default `docker compose up -d --build` configuration is production-safe: it
builds the frontend into the API image for nginx to serve as one application.

## Checks

```bash
cd backend && uv run pytest
cd frontend && npm run lint && npm run build
```

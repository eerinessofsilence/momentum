# Deploying to a Debian 12 VPS

Production stack: Postgres + the API container (which also serves the built
frontend as static files — see `backend/Dockerfile.prod`), reverse-proxied
by nginx on the host for TLS termination. No domain required to start; swap
the self-signed cert for Let's Encrypt once you have one.

## 1. Base VPS setup

SSH in as a non-root sudo user, then:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y ufw curl git openssl
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 2. Install Docker Engine

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Log out and back in so the group membership takes effect (or run
`newgrp docker`).

## 3. Install nginx

```bash
sudo apt install -y nginx
```

## 4. Clone the repo

```bash
git clone https://github.com/eerinessofsilence/momentum.git
cd momentum
```

## 5. Configure production secrets

```bash
cp .env.prod.example .env
nano .env
```

Set a real `POSTGRES_PASSWORD` and `FRONTEND_ORIGIN` (use
`https://<your-vps-ip>` for now). Leave
`DEMO_MODE=false` — the demo build shows OTP codes directly in the UI,
which you don't want for real users. Create a Cloudflare Turnstile widget for
your hostname and set its site key, secret key, and expected hostname as
`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and
`TURNSTILE_EXPECTED_HOSTNAMES` in `.env` (comma-separated when both the apex
and `www` hostnames serve the app).

## 6. Build and start the app

```bash
docker compose up -d --build
docker compose logs -f api
```

Wait for the `alembic upgrade head` step to finish and uvicorn to report
it's listening, then Ctrl-C out of the log tail (the containers keep
running in the background). The api container only publishes to
`127.0.0.1:8000` — it isn't reachable from outside until nginx is set up.

## 7. TLS termination with nginx

Generate a self-signed cert (fine for IP-only access — see the script for
why this is safe here):

```bash
sudo ./deploy/gen-self-signed-cert.sh
```

Install the reverse proxy config:

```bash
sudo cp deploy/nginx-rate-limit.conf /etc/nginx/conf.d/momentum-rate-limit.conf
sudo cp deploy/nginx.conf /etc/nginx/sites-available/momentum
sudo ln -s /etc/nginx/sites-available/momentum /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Registration is limited to two requests per minute per client IP, with a
three-request burst. Turnstile tokens are also verified by the API before an
account is created.

## 8. Verify

Visit `https://<your-vps-ip>` — your browser will warn about the
self-signed cert (expected, click through). Log in with the demo account
from the main README, or register a real one.

With `DEMO_MODE=false`, open the registration form on an allowed hostname and
complete Turnstile. Changing `TURNSTILE_SITE_KEY` requires rebuilding the API
image because Vite embeds the public site key in the frontend bundle.

## Updating after a new commit

```bash
cd momentum
git pull
docker compose up -d --build
```

## Once you have a domain

1. Point an A record at the VPS IP.
2. `sudo apt install -y certbot python3-certbot-nginx`
3. `sudo certbot --nginx -d yourdomain.example` — certbot rewrites
   `deploy/nginx.conf`'s cert paths and sets up auto-renewal for you.
4. Update `FRONTEND_ORIGIN` in `.env` to `https://yourdomain.example` and
   restart the `api` service: `docker compose up -d`.

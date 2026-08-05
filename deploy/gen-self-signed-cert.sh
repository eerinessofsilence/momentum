#!/usr/bin/env bash
# Generates a 10-year self-signed TLS cert for nginx when you don't have a
# domain yet. Browsers will show a trust warning (expected — it's
# self-signed) but the connection is still real TLS, which is all the
# app's Secure session cookie needs. Swap this for Let's Encrypt/certbot
# once you point a domain at the VPS.
set -euo pipefail

mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/momentum.key \
  -out /etc/nginx/ssl/momentum.crt \
  -subj "/CN=momentum"

chmod 600 /etc/nginx/ssl/momentum.key
echo "Certificate written to /etc/nginx/ssl/momentum.crt"

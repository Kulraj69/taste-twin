#!/usr/bin/env bash
# Switch Vercel deployment to live Qloo mode once secrets/qloo_key.txt exists. Never prints the key.
set -euo pipefail
KEY_FILE="${1:-/workspace/devpost/secrets/qloo_key.txt}"
[ -s "$KEY_FILE" ] || { echo "missing $KEY_FILE"; exit 1; }
vercel env rm QLOO_API_KEY production -y >/dev/null 2>&1 || true
tr -d '\n' < "$KEY_FILE" | vercel env add QLOO_API_KEY production >/dev/null
vercel deploy --prod --yes

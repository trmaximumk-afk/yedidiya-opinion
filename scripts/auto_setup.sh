#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-yedidiya-opinion}"
ADMIN_PW="${ADMIN_PW:-2026}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_ANON_KEY" ]]; then
  echo "[ERROR] SUPABASE_URL / SUPABASE_ANON_KEY required"
  exit 1
fi

cat > .env <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
VITE_ADMIN_PW=$ADMIN_PW
EOF

echo "[OK] .env generated"
npm install
npm run build

echo "[OK] local build done"

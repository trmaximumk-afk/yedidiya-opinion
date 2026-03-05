#!/usr/bin/env bash
set -euo pipefail
# requires: vercel cli logged in

: "${VITE_SUPABASE_URL:?required}"
: "${VITE_SUPABASE_ANON_KEY:?required}"
: "${VITE_ADMIN_PW:=2026}"

printf "%s" "$VITE_SUPABASE_URL" | vercel env add VITE_SUPABASE_URL production --yes || true
printf "%s" "$VITE_SUPABASE_ANON_KEY" | vercel env add VITE_SUPABASE_ANON_KEY production --yes || true
printf "%s" "$VITE_ADMIN_PW" | vercel env add VITE_ADMIN_PW production --yes || true

vercel --prod --yes

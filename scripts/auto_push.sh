#!/usr/bin/env bash
set -euo pipefail
REPO_URL="${REPO_URL:-}"
if [[ -z "$REPO_URL" ]]; then
  echo "[ERROR] REPO_URL required (ex: https://github.com/<user>/yedidiya-opinion.git)"
  exit 1
fi

if [[ ! -d .git ]]; then
  git init
fi

git add .
if ! git diff --cached --quiet; then
  git commit -m "chore: automated setup"
fi

git branch -M main
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

git push -u origin main

echo "[OK] pushed"

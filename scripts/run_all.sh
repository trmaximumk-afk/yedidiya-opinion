#!/usr/bin/env bash
set -euo pipefail
./scripts/auto_setup.sh
./scripts/auto_push.sh
./scripts/auto_vercel.sh
echo '[OK] all done'

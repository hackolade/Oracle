#!/usr/bin/env bash
# Wrapper — prefer: npm run build:jdbc (also runs on npm install / npm ci).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "${ROOT}/scripts/build-jdbc-kerberos.js" "$@"

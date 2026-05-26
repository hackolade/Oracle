#!/usr/bin/env bash
# Password-based smoke test (thick mode not required).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/.env"

ORACLE_HOST="${ORACLE_FQDN:-oracle-db.hackolade.local}"

docker exec hackolade-oracle-free bash -c \
	"echo \"SELECT 'Password auth OK' FROM DUAL;\" | sqlplus -s -L system/\"${ORACLE_PWD}\"@//localhost:1521/FREEPDB1"

echo "OK: system@${ORACLE_HOST}:1521/FREEPDB1"

#!/usr/bin/env bash
# Reset hackolade_krb password to match KRB_USER_PASSWORD in .env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/.env"

USER_PRINCIPAL="${KRB_USER}@${KRB5_REALM:-HACKOLADE.LOCAL}"
KDC_CONTAINER="${KDC_CONTAINER:-hackolade-kdc}"

# Pass password via env inside the container to avoid shell mangling (!, $, etc.)
docker exec -e KRB_PW="${KRB_USER_PASSWORD}" "${KDC_CONTAINER}" bash -c \
	"kadmin.local -q \"change_password -pw \\\"\$KRB_PW\\\" ${USER_PRINCIPAL}\""

echo "Password reset for ${USER_PRINCIPAL}"
echo "Run: kinit ${USER_PRINCIPAL}"
echo "Password (from .env KRB_USER_PASSWORD): ${KRB_USER_PASSWORD}"

#!/usr/bin/env bash
# Create principals + keytab via kadmin.local (works reliably; remote kadmin ktadd often fails).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"
# shellcheck source=/dev/null
source "${ROOT}/.env"

REALM="${KRB5_REALM:-HACKOLADE.LOCAL}"
ORACLE_FQDN="${ORACLE_FQDN:-oracle-db.hackolade.local}"
SERVICE_PRINCIPAL="oracle/${ORACLE_FQDN}@${REALM}"
USER_PRINCIPAL="${KRB_USER}@${REALM}"
KDC_CONTAINER="${KDC_CONTAINER:-hackolade-kdc}"
ORACLE_CONTAINER="${ORACLE_CONTAINER:-hackolade-oracle-free}"
KERB_MOUNT="/opt/oracle/kerberos"

kadmin_local() {
	docker exec "${KDC_CONTAINER}" kadmin.local -q "$1"
}

set_user_password() {
	docker exec -e KRB_PW="${KRB_USER_PASSWORD}" "${KDC_CONTAINER}" bash -c \
		"kadmin.local -q \"change_password -pw \\\"\$KRB_PW\\\" ${USER_PRINCIPAL}\""
}

echo "==> Creating principals in KDC (kadmin.local)..."
if ! kadmin_local "getprinc ${USER_PRINCIPAL}" >/dev/null 2>&1; then
	docker exec -e KRB_PW="${KRB_USER_PASSWORD}" "${KDC_CONTAINER}" bash -c \
		"kadmin.local -q \"addprinc -pw \\\"\$KRB_PW\\\" ${USER_PRINCIPAL}\""
else
	echo "    ${USER_PRINCIPAL} exists — syncing password from .env"
	set_user_password
fi

if ! docker exec "${KDC_CONTAINER}" kadmin.local -q "getprinc ${SERVICE_PRINCIPAL}" >/dev/null 2>&1; then
	docker exec "${KDC_CONTAINER}" kadmin.local -q "addprinc -randkey ${SERVICE_PRINCIPAL}"
else
	echo "    ${SERVICE_PRINCIPAL} already exists"
fi

echo "==> Writing keytab and sqlnet.ora into Oracle volume..."
docker exec "${KDC_CONTAINER}" rm -f /tmp/v5srvtab
docker exec "${KDC_CONTAINER}" kadmin.local -q "ktadd -k /tmp/v5srvtab ${SERVICE_PRINCIPAL}"

TMP_KEYTAB="$(mktemp)"
trap 'rm -f "${TMP_KEYTAB}" "${TMP_SQLNET}"' EXIT
docker cp "${KDC_CONTAINER}:/tmp/v5srvtab" "${TMP_KEYTAB}"

TMP_SQLNET="$(mktemp)"
sed \
	-e "s|@ORACLE_FQDN@|${ORACLE_FQDN}|g" \
	-e "s|@KRB5_REALM@|${REALM}|g" \
	"${ROOT}/oracle/config/sqlnet.ora.template" >"${TMP_SQLNET}"

docker exec "${ORACLE_CONTAINER}" mkdir -p "${KERB_MOUNT}"
docker cp "${TMP_KEYTAB}" "${ORACLE_CONTAINER}:${KERB_MOUNT}/v5srvtab"
docker cp "${TMP_SQLNET}" "${ORACLE_CONTAINER}:${KERB_MOUNT}/sqlnet.ora"
docker exec -u oracle "${ORACLE_CONTAINER}" chmod 640 "${KERB_MOUNT}/v5srvtab" 2>/dev/null || true
docker exec "${ORACLE_CONTAINER}" touch "${KERB_MOUNT}/.configured"

echo "==> Restarting Oracle to apply Kerberos config..."
docker compose restart oracle

echo "==> Ensuring EXTERNALLY user in FREEPDB1..."
"${ROOT}/scripts/ensure-kerberos-db-user.sh"

echo ""
echo "Done. Principals:"
docker exec "${KDC_CONTAINER}" kadmin.local -q "list_principals ${KRB_USER}* oracle/*" 2>/dev/null || true
echo ""
echo "Test on Mac (JDBC — works on all platforms):"
echo "  ./scripts/mac-kinit.sh"
echo "  cd .. && ./jdbc/build.sh && node docker/scripts/test-jdbc-kerberos.js"

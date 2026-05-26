#!/usr/bin/env bash
set -euo pipefail

REALM="${KRB5_REALM:-HACKOLADE.LOCAL}"
ORACLE_FQDN="${ORACLE_FQDN:-oracle-db.hackolade.local}"
KRB_USER="${KRB_USER:-hackolade_krb}"
KRB_USER_PASSWORD="${KRB_USER_PASSWORD:?KRB_USER_PASSWORD is required}"
KADMIN_PW="${KADMIN_PASSWORD:?KADMIN_PASSWORD is required}"

SERVICE_PRINCIPAL="oracle/${ORACLE_FQDN}@${REALM}"
USER_PRINCIPAL="${KRB_USER}@${REALM}"
KERB_DIR="/kerberos"
KEYTAB="${KERB_DIR}/v5srvtab"
MARKER="${KERB_DIR}/.configured"

echo "Waiting for KDC (kadmin)..."
for i in $(seq 1 60); do
	if kadmin -p "admin/admin@${REALM}" -w "${KADMIN_PW}" -q "list_principals" 2>/dev/null | grep -q "admin/admin@${REALM}"; then
		break
	fi
	sleep 2
done

KADMIN=(kadmin -p "admin/admin@${REALM}" -w "${KADMIN_PW}")

run_kadmin() {
	"${KADMIN[@]}" -q "$1"
}

echo "Creating Kerberos principals..."
if ! run_kadmin "getprinc ${USER_PRINCIPAL}" 2>/dev/null; then
	run_kadmin "addprinc -pw ${KRB_USER_PASSWORD} ${USER_PRINCIPAL}"
else
	run_kadmin "change_password -pw ${KRB_USER_PASSWORD} ${USER_PRINCIPAL}" || true
fi

if ! run_kadmin "getprinc ${SERVICE_PRINCIPAL}" 2>/dev/null; then
	run_kadmin "addprinc -randkey ${SERVICE_PRINCIPAL}"
fi

echo "Extracting service keytab..."
rm -f "${KEYTAB}"
run_kadmin "ktadd -k ${KEYTAB} ${SERVICE_PRINCIPAL}"
chmod 640 "${KEYTAB}"

echo "Writing Oracle Kerberos network config..."
sed \
	-e "s|@ORACLE_FQDN@|${ORACLE_FQDN}|g" \
	-e "s|@KRB5_REALM@|${REALM}|g" \
	/templates/sqlnet.ora.template >"${KERB_DIR}/sqlnet.ora"

cp /etc/krb5.conf "${KERB_DIR}/krb5.conf" 2>/dev/null || true

cat >"${KERB_DIR}/kerberos.env" <<EOF
KRB5_REALM=${REALM}
ORACLE_FQDN=${ORACLE_FQDN}
KRB_USER=${KRB_USER}
SERVICE_PRINCIPAL=${SERVICE_PRINCIPAL}
USER_PRINCIPAL=${USER_PRINCIPAL}
EOF

touch "${MARKER}"
echo "Kerberos setup complete. Marker: ${MARKER}"
echo "  Service principal: ${SERVICE_PRINCIPAL}"
echo "  User principal:    ${USER_PRINCIPAL}"
echo ""
echo "Next: docker compose restart oracle"
echo "      (startup script applies sqlnet.ora and reloads listener)"

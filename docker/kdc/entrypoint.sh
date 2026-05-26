#!/usr/bin/env bash
set -euo pipefail

REALM="${KRB5_REALM:-HACKOLADE.LOCAL}"
MASTER_PW="${KDC_MASTER_PASSWORD:?KDC_MASTER_PASSWORD is required}"
KADMIN_PW="${KADMIN_PASSWORD:?KADMIN_PASSWORD is required}"

PRINCIPAL_DB="/var/kerberos/krb5kdc/principal"

if [[ ! -f "${PRINCIPAL_DB}" ]]; then
	echo "Creating Kerberos realm ${REALM}..."
	kdb5_util create -s -P "${MASTER_PW}"
	kadmin.local -q "addprinc -pw ${KADMIN_PW} admin/admin@${REALM}"
	echo "Realm ${REALM} created."
fi

echo "Starting krb5kdc and kadmind..."
krb5kdc
exec kadmind -nofork

#!/usr/bin/env bash
# Applies Kerberos sqlnet.ora after kerberos-setup has run (marker file present).
set -euo pipefail

KERB_DIR="/opt/oracle/kerberos"
MARKER="${KERB_DIR}/.configured"

if [[ ! -f "${MARKER}" ]]; then
	echo "[kerberos] Setup marker not found (${MARKER}). Run: docker compose --profile setup run --rm kerberos-setup"
	exit 0
fi

if [[ -z "${ORACLE_HOME:-}" || ! -d "${ORACLE_HOME}" ]]; then
	ORACLE_HOME="$(ls -d /opt/oracle/product/*/dbhome* 2>/dev/null | head -1)"
fi
if [[ -z "${ORACLE_HOME:-}" || ! -d "${ORACLE_HOME}" ]]; then
	echo "[kerberos] ORACLE_HOME not found — skipping"
	exit 0
fi
NET_ADMIN="${ORACLE_HOME}/network/admin"

echo "[kerberos] Applying Kerberos configuration..."
mkdir -p "${NET_ADMIN}"
chown oracle:oinstall "${KERB_DIR}/v5srvtab" "${KERB_DIR}/sqlnet.ora" 2>/dev/null || true
chmod 640 "${KERB_DIR}/v5srvtab" 2>/dev/null || true
cp "${KERB_DIR}/sqlnet.ora" "${NET_ADMIN}/sqlnet.ora"
chmod 644 "${NET_ADMIN}/sqlnet.ora"

if [[ -f "${KERB_DIR}/krb5.conf" ]]; then
	cp "${KERB_DIR}/krb5.conf" /etc/krb5.conf
fi

echo "[kerberos] Setting OS_AUTHENT_PREFIX and reloading listener..."
sqlplus -s / as sysdba <<'EOSQL'
WHENEVER SQLERROR EXIT SQL.SQLCODE
ALTER SYSTEM SET OS_AUTHENT_PREFIX='' SCOPE=MEMORY;
ALTER SYSTEM SET OS_AUTHENT_PREFIX='' SCOPE=SPFILE;
EOSQL

"${ORACLE_HOME}/bin/lsnrctl" reload 2>/dev/null || "${ORACLE_HOME}/bin/lsnrctl" status || true

echo "[kerberos] Configuration applied."

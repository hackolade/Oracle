#!/usr/bin/env bash
# Create hackolade_krb EXTERNALLY user in FREEPDB1 (idempotent).
# Needed when the DB was created before 01_create_kerberos_user.sql ran.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/.env"

ORACLE_CONTAINER="${ORACLE_CONTAINER:-hackolade-oracle-free}"
ORACLE_PWD="${ORACLE_PWD:?Set ORACLE_PWD in docker/.env}"

SQL_FILE="$(mktemp)"
trap 'rm -f "${SQL_FILE}"' EXIT

cat >"${SQL_FILE}" <<'SQL'
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
DECLARE
  user_exists EXCEPTION;
  PRAGMA EXCEPTION_INIT(user_exists, -01920);
BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE USER hackolade_krb IDENTIFIED EXTERNALLY AS 'hackolade_krb@HACKOLADE.LOCAL'
  ]';
  DBMS_OUTPUT.PUT_LINE('Created user HACKOLADE_KRB');
EXCEPTION
  WHEN user_exists THEN
    DBMS_OUTPUT.PUT_LINE('User hackolade_krb already exists');
END;
/
GRANT CREATE SESSION TO hackolade_krb;
GRANT SELECT ANY DICTIONARY TO hackolade_krb;
GRANT SELECT_CATALOG_ROLE TO hackolade_krb;
SELECT username, external_name, authentication_type FROM dba_users WHERE username = 'HACKOLADE_KRB';
EXIT
SQL

docker exec "${ORACLE_CONTAINER}" bash -lc "
mkdir -p /tmp/admin_sqlnet
printf '%s\n' 'SQLNET.AUTHENTICATION_SERVICES=(NONE)' > /tmp/admin_sqlnet/sqlnet.ora
export TNS_ADMIN=/tmp/admin_sqlnet
sqlplus -s system/${ORACLE_PWD}@localhost:1521/FREEPDB1
" <"${SQL_FILE}"

echo "Kerberos DB user ensured in FREEPDB1."

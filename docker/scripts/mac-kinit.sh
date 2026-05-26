#!/usr/bin/env bash
# Obtain a Kerberos ticket in ~/.hackolade/krb5cc_hackolade (used by Hackolade plugin).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/.env" 2>/dev/null || true

REALM="${KRB5_REALM:-HACKOLADE.LOCAL}"
USER_PRINCIPAL="${KRB_USER:-hackolade_krb}@${REALM}"
CC_FILE="${KRB5_CC_FILE:-${HOME}/.hackolade/krb5cc_hackolade}"

mkdir -p "$(dirname "${CC_FILE}")"
export KRB5CCNAME="FILE:${CC_FILE}"
export KRB5_CONFIG="${KRB5_CONFIG:-/etc/krb5.conf}"

if [[ ! -f "${KRB5_CONFIG}" ]]; then
	echo "WARN: ${KRB5_CONFIG} not found."
	echo "      sudo cp ${ROOT}/client/macos/krb5.conf /etc/krb5.conf"
	echo "      or: export KRB5_CONFIG=${ROOT}/client/macos/krb5.conf"
fi

echo "Principal:   ${USER_PRINCIPAL}"
echo "Ticket file: ${CC_FILE}"
echo ""

if [[ -x /opt/homebrew/opt/krb5/bin/kinit ]]; then
	KINIT_BIN="/opt/homebrew/opt/krb5/bin/kinit"
elif [[ -x /usr/local/opt/krb5/bin/kinit ]]; then
	KINIT_BIN="/usr/local/opt/krb5/bin/kinit"
else
	echo "ERROR: MIT Kerberos is required (Apple Heimdal kinit does not work with Oracle Instant Client)."
	echo "Install: brew install krb5"
	echo "Then re-run this script."
	exit 1
fi

echo "Using MIT kinit: ${KINIT_BIN}"
"$KINIT_BIN" -V 2>&1 | head -1 || true

set +e
if "${KINIT_BIN}" -c "${CC_FILE}" "${USER_PRINCIPAL}"; then
	:
elif KRB5CCNAME="FILE:${CC_FILE}" "${KINIT_BIN}" "${USER_PRINCIPAL}"; then
	:
else
	echo "ERROR: kinit failed (exit $?)"
	exit 1
fi
set -e

if [[ ! -f "${CC_FILE}" ]]; then
	echo "ERROR: No ticket file at ${CC_FILE}"
	exit 1
fi

chmod 600 "${CC_FILE}" 2>/dev/null || true

echo ""
echo "Ticket OK:"
klist -c "${CC_FILE}" 2>/dev/null || klist

echo ""
echo "Hackolade plugin expects this cache path (set automatically when you rebuild the plugin)."

#!/usr/bin/env bash
# Full local lab bootstrap (run from docker/ directory).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

if [[ ! -f .env ]]; then
	echo "Creating .env from .env.example — review passwords before production use."
	cp .env.example .env
fi

echo "==> Starting KDC and Oracle Database Free..."
docker compose up -d kdc oracle

echo "==> Waiting for Oracle health (first start can take 10–15 minutes)..."
ORACLE_CONTAINER="${ORACLE_CONTAINER:-hackolade-oracle-free}"
for _ in $(seq 1 80); do
	state="$(docker inspect "${ORACLE_CONTAINER}" --format '{{.State.Status}}' 2>/dev/null || echo unknown)"
	health="$(docker inspect "${ORACLE_CONTAINER}" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo none)"

	if [[ "${state}" == "exited" ]]; then
		exit_code="$(docker inspect "${ORACLE_CONTAINER}" --format '{{.State.ExitCode}}' 2>/dev/null)"
		echo "ERROR: Oracle container exited (code ${exit_code})."
		if [[ "${exit_code}" == "137" ]]; then
			echo "       Exit 137 usually means OOM — give Docker Desktop at least 4–6 GB RAM."
		fi
		docker logs "${ORACLE_CONTAINER}" --tail 40 2>&1 || true
		exit 1
	fi

	if [[ "${health}" == "healthy" ]]; then
		break
	fi

	sleep 15
	echo "    state=${state} health=${health} — still starting..."
done

if [[ "${health:-}" != "healthy" ]]; then
	echo "ERROR: Oracle did not become healthy in time."
	docker compose ps
	exit 1
fi

echo "==> Configuring Kerberos (kadmin.local — not remote kadmin)..."
"${ROOT}/scripts/fix-kerberos-principals.sh"

echo ""
echo "Bootstrap complete."
echo ""
echo "Host setup (Kerberos JDBC):"
echo "  1. Add to /etc/hosts (see scripts/hosts-snippet.txt)"
echo "  2. sudo cp client/macos/krb5.conf /etc/krb5.conf   # or export KRB5_CONFIG=..."
echo "  3. ./scripts/mac-kinit.sh"
echo "  4. cd .. && ./jdbc/build.sh && node docker/scripts/test-jdbc-kerberos.js"
echo "  5. Hackolade: auth Kerberos + Java 21 — see README.md"
echo ""
echo "Password auth smoke test:"
echo "  ./scripts/smoke-password.sh"

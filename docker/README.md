# Oracle Free + Kerberos local lab

> **Hackolade Kerberos:** JDBC Thin + Java 11–21 (no Instant Client). See [KERBEROS-PLATFORMS.md](./KERBEROS-PLATFORMS.md) and [../docs/KERBEROS-JDBC.md](../docs/KERBEROS-JDBC.md).

Docker lab for testing the Hackolade Oracle plugin with **Kerberos (JDBC)** and optional **thick password** auth, using the official image you already pulled:

`container-registry.oracle.com/database/free:latest`

The same `docker-compose.yml` runs on **macOS (M4)** and can be copied to an **Azure Linux VM** with minimal changes.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Mac / Azure VM (Hackolade host)                            │
│  • Java 11–21 + npm install (JDBC Kerberos artifacts)       │
│  • krb5.conf + kinit → TGT (MIT krb5)                       │
└───────────────────────────┬─────────────────────────────────┘
                            │ :1521 / :88
┌───────────────────────────▼─────────────────────────────────┐
│  Docker network (kerbnet)                                     │
│  ┌──────────────┐    ┌────────────────────────────────────┐   │
│  │ MIT KDC      │    │ Oracle Database Free               │   │
│  │ kdc.hackolade│    │ oracle-db.hackolade.local          │   │
│  │   .local     │    │ SPN: oracle/oracle-db...@REALM     │   │
│  └──────────────┘    │ keytab + sqlnet.ora (server only)  │   │
│                      └────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Important:** Hackolade does not run inside Docker. Only the database and KDC do. Kerberos tickets and Java live on the Hackolade host.

## Prerequisites

- Docker Desktop (Mac M4) or Docker Engine (Azure VM)
- Logged in to Oracle Container Registry:  
  `docker login container-registry.oracle.com`
- Image already pulled: `database/free:latest`
- For Kerberos: **Java 21** (`brew install openjdk@21 krb5`) — no Instant Client
- For password + thick on Mac: [Instant Client for macOS ARM64](https://www.oracle.com/database/technologies/instant-client/macos-arm64-downloads.html) (optional)

### About `database/adb-free`

`adb-free` is Autonomous Database Free (wallet/TLS, different ports). This lab targets **`database/free`** (listener on 1521, `FREEPDB1`). Use adb-free only if you extend the compose file yourself.

## Quick start

```bash
cd docker
cp .env.example .env
chmod +x scripts/*.sh kdc/entrypoint.sh kerberos-setup/setup.sh oracle/scripts/startup/*.sh

./scripts/bootstrap.sh
```

First Oracle startup often takes **10–15 minutes**. Bootstrap waits for Oracle health, then runs `./scripts/fix-kerberos-principals.sh` (uses `kadmin.local` inside the KDC — reliable for `ktadd`).

If Oracle exits with code **137**, increase Docker Desktop memory (4–6 GB minimum).

### Host name resolution

Add to `/etc/hosts` on the machine running Hackolade:

```
127.0.0.1   oracle-db.hackolade.local kdc.hackolade.local
```

See `scripts/hosts-snippet.txt`.

### macOS client (Kerberos via JDBC — recommended)

1. **Java 21** (JDK 25 breaks Oracle Kerberos in JDBC):
   ```bash
   brew install openjdk@21 krb5
   ```
2. Build the JDBC bridge and obtain a ticket:
   ```bash
   cd docker && ./scripts/mac-kinit.sh
   cd .. && npm run build:jdbc
   ./docker/scripts/ensure-kerberos-db-user.sh   # if DB existed before Kerberos setup
   node docker/scripts/test-jdbc-kerberos.js     # expect: SUCCESS: [ [ 1 ] ]
   ```
3. Package the plugin and point Hackolade at it:
   ```bash
   npm ci && npm run package
   # copy release to ~/.hackolade/plugins/Oracle (or your pluginPath)
   ```
4. Hackolade connection:

   | Field | Value |
   |--------|--------|
   | Auth | Kerberos |
   | Java path | `/opt/homebrew/opt/openjdk@21/bin/java` |
   | Host | `oracle-db.hackolade.local` |
   | Port | `1521` |
   | Service | `FREEPDB1` |
   | User | `hackolade_krb` (or empty for ticket-only mapping) |
   | Ticket cache | default `~/.hackolade/krb5cc_hackolade` |

No Instant Client is required for Kerberos when using JDBC.

### Smoke tests

```bash
# Password (no Kerberos) — from host
./scripts/smoke-password.sh

# Kerberos JDBC (cross-platform, no Instant Client)
cd ..   # Oracle plugin repo root
npm run build:jdbc
node docker/scripts/test-jdbc-kerberos.js
```

Instant Client **Basic Light** does not include SQL*Plus. To add it, download the separate **SQL*Plus** package for macOS ARM64 from Oracle and unzip into the same `instantclient_*` folder.

## Manual steps (if you prefer)

```bash
docker compose up -d
./scripts/fix-kerberos-principals.sh
```

The `kerberos-setup` compose profile uses remote `kadmin` and may fail on `ktadd`; prefer `fix-kerberos-principals.sh`.

## Reset lab

```bash
docker compose down -v   # removes DB + KDC + Kerberos volume data
```

## Port to Azure VM

1. Create an Ubuntu 22.04+ VM (or RHEL). **4 GB+ RAM** recommended for Oracle Free.
2. Install Docker and compose plugin; login to `container-registry.oracle.com`.
3. Copy the entire `docker/` directory to the VM.
4. Open NSG / firewall: **1521** (Oracle), **88** tcp/udp (Kerberos, if clients connect from outside the VM).
5. In `.env`, you can keep the same `ORACLE_FQDN` / `KDC_FQDN` if clients use VM public IP in `/etc/hosts`:

   ```
   <VM_PUBLIC_IP>   oracle-db.hackolade.local kdc.hackolade.local
   ```

6. Run `./scripts/bootstrap.sh` on the VM.
7. Run Hackolade on your Mac or a jump box with `/etc/hosts` pointing at the VM IP, **Java 21**, and `kinit` (port 88 to the KDC if remote).

## Troubleshooting

| Symptom | Check |
|--------|--------|
| Oracle container unhealthy / OOM | Increase Docker memory (4 GB+); try `free:latest-lite` if memory protection key errors (see [oracle/docker-images#2972](https://github.com/oracle/docker-images/issues/2972)) |
| `kinit: CLIENT_NOT_FOUND` | Run `./scripts/fix-kerberos-principals.sh` |
| `kinit: Password incorrect` | Run `./scripts/reset-krb-password.sh` then use exact `KRB_USER_PASSWORD` from `.env` (watch `!` in zsh) |
| `ktadd` / `change-password` privilege / missing `v5srvtab` | Do **not** use `kerberos-setup` profile — run `./scripts/fix-kerberos-principals.sh` |
| Oracle exit **137** during bootstrap | Docker OOM — allocate more RAM to Docker Desktop |
| `ORA-01017` (Kerberos JDBC) | Run `./scripts/ensure-kerberos-db-user.sh` — external user may be missing in FREEPDB1 |
| `ORA-12655` | Server: run `./scripts/fix-kerberos-principals.sh`; client: `klist` and `./scripts/mac-kinit.sh` |
| `ORA-28040` / auth failure | `klist` — re-`kinit`; ticket expired |
| SPN / hostname mismatch | Host in connect string must match `oracle/${ORACLE_FQDN}@REALM` — use FQDN, not `localhost` |
| Thick `DPI-1047` on M4 | Use **ARM64** Instant Client, not x86 |
| Kerberos not applied in DB | Re-run setup + restart: `docker compose --profile setup run --rm kerberos-setup && docker compose restart oracle` |
| User missing in PDB | `./scripts/ensure-kerberos-db-user.sh` |

## Files

| Path | Role |
|------|------|
| `docker-compose.yml` | KDC + Oracle Free + optional setup job |
| `kdc/` | MIT KDC image |
| `kerberos-setup/` | Principals + keytab + server `sqlnet.ora` |
| `oracle/scripts/setup/` | `EXTERNALLY` Oracle user (first DB init) |
| `oracle/scripts/startup/` | Apply Kerberos config each start |
| `client/macos/` | Host `krb5.conf` template |

## Default principals

| Principal | Purpose |
|-----------|---------|
| `oracle/oracle-db.hackolade.local@HACKOLADE.LOCAL` | Database service (keytab) |
| `hackolade_krb@HACKOLADE.LOCAL` | Hackolade end user (`kinit`) |
| `admin/admin@HACKOLADE.LOCAL` | kadmin (setup only) |

Oracle DB user: `hackolade_krb` identified as `hackolade_krb@HACKOLADE.LOCAL` in `FREEPDB1`.

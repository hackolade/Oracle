# Kerberos authentication (JDBC Thin)

Hackolade Oracle plugin uses **JDBC Thin + Java** for Kerberos. Thick mode and Instant Client are **not** used for Kerberos sessions.

## Requirements

| Item | Notes |
|------|--------|
| Java | **11–21** only (JDK 25 breaks Oracle Kerberos in JDBC) |
| Ticket | MIT `kinit` — default cache `~/.hackolade/krb5cc_hackolade` |
| Build | Run `./jdbc/build.sh` once (ships `ojdbc11.jar` + bridge in `jdbc/lib/`) |
| Thick / IC | Optional for password/OS auth only; **not** required for Kerberos |

## Connection modal

| Field | Purpose |
|-------|---------|
| Authentication method | **Kerberos** |
| Java path | e.g. `/opt/homebrew/opt/openjdk@21/bin/java` |
| Kerberos ticket cache | Optional override of default cache path |
| User Name | DB user (`hackolade_krb`) or empty; proxy: `[username]` |
| Mode / Client | Ignored for Kerberos (JDBC path) |

## Implementation

- `reverse_engineering/helpers/jdbcKerberosHelper.js` — spawns Java bridge, JSON over stdio
- `jdbc/java/KerberosJdbcBridge.java` — JDBC Thin + Kerberos properties
- `reverse_engineering/helpers/oracleHelper.js` — routes `authMethod === 'Kerberos'` to JDBC before `initOracleClient`

## Local Docker lab

See `docker/README.md` and `docker/scripts/test-jdbc-kerberos.js`.

## Reference

[JDBC Client-Side Security — Kerberos](https://docs.oracle.com/en/database/oracle/oracle-database/26/jjdbc/client-side-security.html)

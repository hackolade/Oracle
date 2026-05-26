# Kerberos platform notes

## Hackolade plugin

Kerberos uses **JDBC Thin + Java 11–21**, not Oracle Instant Client or thick mode.

Works on **macOS, Linux, and Windows** with:

- MIT Kerberos (`brew install krb5` on Mac)
- Valid ticket (`docker/scripts/mac-kinit.sh` for the local lab)
- Java 21 recommended (`brew install openjdk@21`)

Test from the plugin repo:

```bash
npm install
node docker/scripts/test-jdbc-kerberos.js
```

See [../docs/KERBEROS-JDBC.md](../docs/KERBEROS-JDBC.md).

## macOS + Instant Client (password / OS auth only)

Instant Client on macOS does **not** support database Kerberos (`ORA-12638`). Use JDBC Kerberos in Hackolade, or use **username/password + thick** for non-Kerberos work on Mac.

## Docker lab

The KDC and Oracle server in `docker/` are platform-agnostic. Only the Hackolade host needs `kinit` + Java for Kerberos connections.

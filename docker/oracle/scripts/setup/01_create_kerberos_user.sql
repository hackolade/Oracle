-- Runs once on first database creation (FREEPDB1).
-- Kerberos principal must match the EXTERNALLY AS name.

ALTER SESSION SET CONTAINER = FREEPDB1;

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

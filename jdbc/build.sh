#!/usr/bin/env bash
# Build Kerberos JDBC bridge and download runtime JARs into jdbc/lib/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LIB="${ROOT}/lib"
SRC="${ROOT}/java/KerberosJdbcBridge.java"
OUT_JAR="${LIB}/kerberos-jdbc-bridge.jar"

OJDBC_VERSION="${OJDBC_VERSION:-23.4.0.24.05}"
OJDBC_URL="https://repo1.maven.org/maven2/com/oracle/database/jdbc/ojdbc11/${OJDBC_VERSION}/ojdbc11-${OJDBC_VERSION}.jar"
JSON_URL="https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar"

mkdir -p "${LIB}"

if [[ ! -f "${LIB}/ojdbc11.jar" ]]; then
	echo "Downloading ojdbc11.jar..."
	curl -fsSL "${OJDBC_URL}" -o "${LIB}/ojdbc11.jar"
fi

if [[ ! -f "${LIB}/json.jar" ]]; then
	echo "Downloading json.jar..."
	curl -fsSL "${JSON_URL}" -o "${LIB}/json.jar"
fi

JAVA_COMPILER="${JAVA_COMPILER:-}"
if [[ -z "${JAVA_COMPILER}" ]]; then
	for candidate in \
		/opt/homebrew/opt/openjdk@21/bin/javac \
		/usr/local/opt/openjdk@21/bin/javac \
		/opt/homebrew/opt/openjdk@17/bin/javac \
		"${JAVA_HOME:+$JAVA_HOME/bin/javac}" \
		javac; do
		if [[ -x "${candidate}" ]]; then
			JAVA_COMPILER="${candidate}"
			break
		fi
	done
fi

echo "Compiling KerberosJdbcBridge with ${JAVA_COMPILER}..."
rm -rf "${LIB}/classes"
mkdir -p "${LIB}/classes"
"${JAVA_COMPILER}" -cp "${LIB}/ojdbc11.jar:${LIB}/json.jar" -d "${LIB}/classes" "${SRC}"

jar cf "${OUT_JAR}" -C "${LIB}/classes" .

echo "Built ${OUT_JAR}"
echo "Classpath: ${LIB}/ojdbc11.jar:${LIB}/kerberos-jdbc-bridge.jar"
echo ""
echo "Kerberos JDBC requires Java 11–21 (not JDK 25+). On Mac: brew install openjdk@21"

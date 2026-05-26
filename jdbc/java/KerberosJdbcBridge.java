import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.Properties;

import oracle.jdbc.OracleConnection;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Line-delimited JSON protocol over stdin/stdout.
 * Commands: connect | execute | close | ping
 */
public class KerberosJdbcBridge {

	private static Connection connection;

	public static void main(String[] args) throws Exception {
		BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
		PrintWriter out = new PrintWriter(System.out, true, StandardCharsets.UTF_8);

		out.println(new JSONObject().put("ok", true).put("message", "ready").toString());

		String line;
		while ((line = in.readLine()) != null) {
			JSONObject req = new JSONObject(line);
			JSONObject response;
			try {
				response = handle(req);
			} catch (Exception e) {
				response = error(e.getMessage());
			}
			if (req.has("id")) {
				response.put("id", req.getInt("id"));
			}
			out.println(response.toString());
			out.flush();
		}
	}

	private static JSONObject handle(JSONObject req) throws Exception {
		String cmd = req.optString("cmd", "");
		switch (cmd) {
			case "ping":
				return new JSONObject().put("ok", true).put("message", "pong");
			case "connect":
				return connect(req);
			case "execute":
				return execute(req);
			case "close":
				return closeConnection();
			default:
				return error("Unknown command: " + cmd);
		}
	}

	private static JSONObject connect(JSONObject req) throws Exception {
		closeConnection();

		String host = req.getString("host");
		int port = req.getInt("port");
		String serviceName = req.getString("serviceName");
		String krb5Conf = req.optString("krb5Conf", "");
		String krb5Cc = req.optString("krb5Cc", "");
		String user = req.optString("user", "");

		if (!krb5Conf.isEmpty()) {
			System.setProperty("java.security.krb5.conf", krb5Conf);
		}
		if (!krb5Cc.isEmpty()) {
			System.setProperty("javax.security.auth.useSubjectCredsOnly", "false");
			System.setProperty("sun.security.krb5.ccache", krb5Cc);
			System.setProperty("KRB5CCNAME", "FILE:" + krb5Cc);
		}

		String url = "jdbc:oracle:thin:@//" + host + ":" + port + "/" + serviceName;

		Properties props = new Properties();
		props.setProperty(OracleConnection.CONNECTION_PROPERTY_THIN_NET_AUTHENTICATION_SERVICES, "(KERBEROS5)");
		props.setProperty(OracleConnection.CONNECTION_PROPERTY_THIN_NET_AUTHENTICATION_KRB5_MUTUAL, "true");
		props.setProperty("oracle.jdbc.thinNetAuthenticationKerberos5Service", "oracle");
		if (!user.isEmpty()) {
			props.setProperty("user", user);
		}

		connection = DriverManager.getConnection(url, props);

		return new JSONObject().put("ok", true).put("url", url);
	}

	private static JSONObject execute(JSONObject req) throws Exception {
		if (connection == null || connection.isClosed()) {
			return error("Not connected");
		}

		String sql = req.getString("sql");
		int maxRows = req.optInt("maxRows", 0);

		try (Statement stmt = connection.createStatement()) {
			if (maxRows > 0) {
				stmt.setMaxRows(maxRows);
			}
			boolean hasResultSet = stmt.execute(sql);
			if (!hasResultSet) {
				return new JSONObject().put("ok", true).put("rows", new JSONArray());
			}

			try (ResultSet rs = stmt.getResultSet()) {
				return new JSONObject().put("ok", true).put("rows", resultSetToJson(rs));
			}
		}
	}

	private static JSONArray resultSetToJson(ResultSet rs) throws Exception {
		ResultSetMetaData meta = rs.getMetaData();
		int columnCount = meta.getColumnCount();
		JSONArray rows = new JSONArray();

		while (rs.next()) {
			JSONArray row = new JSONArray();
			for (int i = 1; i <= columnCount; i++) {
				Object value = rs.getObject(i);
				row.put(value == null ? JSONObject.NULL : value);
			}
			rows.put(row);
		}
		return rows;
	}

	private static JSONObject closeConnection() throws Exception {
		if (connection != null) {
			connection.close();
			connection = null;
		}
		return new JSONObject().put("ok", true);
	}

	private static JSONObject error(String message) {
		return new JSONObject().put("ok", false).put("error", message);
	}
}

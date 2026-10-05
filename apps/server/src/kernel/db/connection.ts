/**
 * Turns a connection to one database into a way to reach any other database on the same PostgreSQL server, as the
 * same role: the directory's connection, pointed at an Organisation's database by the name the directory keeps
 * (DEC-093; deployment.md section 4, where the directory "lives in the same postgres service").
 *
 * Returns undefined for a connection string that is not a URL with a host, such as a Unix-socket form, because only
 * a URL's database can be replaced safely. The caller refuses it without echoing it: it holds the password, and a
 * parser's own error would carry the whole string into the log (PRD-SEC-014).
 */
export function connectionToDatabase(connectionString: string): ((databaseName: string) => string) | undefined {
  let base: URL;
  try {
    base = new URL(connectionString);
  } catch {
    return undefined;
  }
  if (base.hostname === '' || !/^postgres(ql)?:$/.test(base.protocol)) return undefined;
  return (databaseName: string) => {
    // Plain names only, so the name needs no escaping in the URL and reaches PostgreSQL unchanged.
    if (!DATABASE_NAME.test(databaseName)) {
      throw new Error('A database name must be letters, digits and _ only');
    }
    const target = new URL(base);
    target.pathname = `/${databaseName}`;
    return target.toString();
  };
}

const DATABASE_NAME = /^[A-Za-z0-9_]{1,63}$/;

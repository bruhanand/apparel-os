import { connectionToDatabase } from '../db/connection.js';

/**
 * The directory database as the runtime role, aos_runtime (code-house-rules 5.1; deployment.md section 4). Each
 * Organisation's database is reached on the same server, as the same role, by the name the directory keeps. It holds
 * the runtime role's password, so it is never logged.
 */
export const RUNTIME_DATABASE_URL_VARIABLE = 'AOS_RUNTIME_DATABASE_URL';

/**
 * The most connections each pool opens: the directory's, and each Organisation database's. No design gives a
 * number, so it has no default; each environment states it (technical setting, tuned after measurement).
 */
export const DATABASE_POOL_MAX_VARIABLE = 'AOS_DATABASE_POOL_MAX';

export interface OrganisationRoutingConfig {
  readonly directoryConnectionString: string;
  readonly poolMax: number;
}

/**
 * Reads the routing configuration, or throws saying which variable is missing or malformed. The error never holds
 * the connection string (PRD-SEC-014).
 */
export function routingConfigFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): OrganisationRoutingConfig {
  const directoryConnectionString = env[RUNTIME_DATABASE_URL_VARIABLE];
  if (directoryConnectionString === undefined || directoryConnectionString === '') {
    throw new Error(`${RUNTIME_DATABASE_URL_VARIABLE} is not set`);
  }
  if (connectionToDatabase(directoryConnectionString) === undefined) {
    throw new Error(
      `${RUNTIME_DATABASE_URL_VARIABLE} must have the form postgres://<user>:<password>@<host>:<port>/<database>, so that each Organisation database can be reached on the same server`,
    );
  }
  const poolMax = env[DATABASE_POOL_MAX_VARIABLE];
  if (poolMax === undefined || poolMax === '') {
    throw new Error(`${DATABASE_POOL_MAX_VARIABLE} is not set; it has no default`);
  }
  if (!/^[1-9][0-9]*$/.test(poolMax) || !Number.isSafeInteger(Number(poolMax))) {
    throw new Error(`${DATABASE_POOL_MAX_VARIABLE} must be a whole number of at least 1`);
  }
  return { directoryConnectionString, poolMax: Number(poolMax) };
}

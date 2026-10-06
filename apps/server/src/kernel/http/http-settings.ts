// The HTTP settings of the server, technical settings read at start (code-house-rules 12.14 "Technical settings"):
// a missing or malformed one stops the service at start, and nothing falls back to a value in code.

/**
 * The app's own origin, the one origin of deployment.md section 3, such as `https://<host>`. A command's `Origin`
 * header must equal it (code-house-rules 12.1 "Writes from another site"; RR-245). Behind Railway's proxy the server
 * cannot see the origin the browser used, so each environment states it; on Railway it is set from the service's
 * public domain.
 */
export const PUBLIC_ORIGIN_VARIABLE = 'AOS_PUBLIC_ORIGIN';

/**
 * How many proxies in front of the server add to `X-Forwarded-For`, so the source address of a request is the one
 * the nearest untrusted hop gave (Express's `trust proxy`). The access record keeps it and sign-in throttling counts
 * by it (numbering-and-audit 5.2; access-and-approvals 3.1, DEC-116). `0` trusts no proxy: the socket's peer.
 */
export const TRUSTED_PROXY_HOPS_VARIABLE = 'AOS_TRUSTED_PROXY_HOPS';

export interface HttpSettings {
  readonly publicOrigin: string;
  readonly trustedProxyHops: number;
}

/** Reads the HTTP settings, or throws naming the variable that is missing or malformed. */
export function httpSettingsFromEnvironment(env: Readonly<Record<string, string | undefined>>): HttpSettings {
  const origin = env[PUBLIC_ORIGIN_VARIABLE];
  if (origin === undefined || origin === '') throw new Error(`${PUBLIC_ORIGIN_VARIABLE} is not set; it has no default`);
  if (!isOrigin(origin)) {
    throw new Error(`${PUBLIC_ORIGIN_VARIABLE} must be an origin: http or https, a host, an optional port, no path`);
  }
  const hops = env[TRUSTED_PROXY_HOPS_VARIABLE];
  if (hops === undefined || hops === '') {
    throw new Error(`${TRUSTED_PROXY_HOPS_VARIABLE} is not set; it has no default`);
  }
  if (!/^(0|[1-9][0-9]?)$/.test(hops)) throw new Error(`${TRUSTED_PROXY_HOPS_VARIABLE} must be a whole number from 0`);
  return { publicOrigin: origin, trustedProxyHops: Number(hops) };
}

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value;
  } catch {
    return false;
  }
}

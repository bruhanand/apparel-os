import type { LoggerService, OnApplicationShutdown } from '@nestjs/common';
import { connectionToDatabase } from '../db/connection.js';
import { createDb, type Database, type DatabaseHandle } from '../db/create-db.js';
import { findDatabaseName } from '../db/directory.js';
import type { OrganisationRoutingConfig } from './routing-config.js';
import { decodeSessionCookieValue } from './session-cookie.js';

/** An Organisation found in the directory, bound to its own database through that database's pool. */
export interface RoutedOrganisation {
  readonly organisationCode: string;
  readonly databaseName: string;
  /** The Organisation's database, as the runtime role. Nothing here reaches any other Organisation's. */
  readonly db: Database;
}

/**
 * Sign-in: the Organisation, or not routed, which sign-in answers with the one refusal every wrong part gets
 * (access-and-approvals 3.1; `access.sign-in-refused`).
 */
export type SignInRouting =
  { readonly routed: true; readonly organisation: RoutedOrganisation } | { readonly routed: false };

/**
 * A later request: the Organisation its session cookie names and the identifier to look for there by its hash,
 * or not signed in (access-and-approvals 3.3).
 */
export type SessionRouting =
  | { readonly routed: true; readonly organisation: RoutedOrganisation; readonly sessionIdentifier: string }
  | { readonly routed: false };

const CONTEXT = 'OrganisationRouting';

/**
 * Organisation routing (module-map 4.1; DEC-093, PRD-MOD-001, PRD-ORG-002, PRD-ACS-020). Finds an Organisation's
 * database in the directory, by the code a person gives at sign-in or by the code in a session cookie afterwards,
 * and binds that database through a pool of its own, one pool per Organisation database. No request searches more
 * than one Organisation's database, and the directory is asked only for a code.
 *
 * An unknown code leaves one line in the service log, never what was typed or the cookie's value (PRD-SEC-014). A
 * failure to read the directory is an error, never taken as an unknown code.
 */
export class OrganisationRouter implements OnApplicationShutdown {
  private readonly directory: DatabaseHandle;
  private readonly connectionTo: (databaseName: string) => string;
  private readonly pools = new Map<string, DatabaseHandle>();
  private closed = false;

  constructor(
    private readonly config: OrganisationRoutingConfig,
    private readonly logger: LoggerService,
  ) {
    const connectionTo = connectionToDatabase(config.directoryConnectionString);
    if (connectionTo === undefined) {
      throw new Error('The directory connection must be a postgres:// URL with a host');
    }
    this.connectionTo = connectionTo;
    this.directory = this.openPool(config.directoryConnectionString);
  }

  /** At sign-in, from the Organisation code the person typed, compared exactly (access-and-approvals 3.1). */
  async resolveForSignIn(organisationCode: string): Promise<SignInRouting> {
    const organisation = await this.find(organisationCode);
    if (organisation === undefined) {
      this.logger.warn(
        'Sign-in refused: the Organisation code is not in the directory (nothing typed is logged)',
        CONTEXT,
      );
      return { routed: false };
    }
    return { routed: true, organisation };
  }

  /**
   * On a later request, from its session cookie (access-and-approvals 3.3). A missing cookie is not signed in. A
   * malformed cookie, or one whose code the directory does not list, is not signed in either, and the service log
   * notes it without the cookie's value. Whether the identifier matches a session is for sign-in (S1-F01-T08) to
   * answer, in the Organisation's database this returns.
   */
  async resolveFromSessionCookie(cookieValue: string | undefined): Promise<SessionRouting> {
    if (cookieValue === undefined || cookieValue === '') return { routed: false };
    const parts = decodeSessionCookieValue(cookieValue);
    if (parts === undefined) {
      this.logger.warn('Not signed in: the session cookie is malformed (the cookie is not logged)', CONTEXT);
      return { routed: false };
    }
    const organisation = await this.find(parts.organisationCode);
    if (organisation === undefined) {
      this.logger.warn(
        'Not signed in: the session cookie names no Organisation in the directory (the cookie is not logged)',
        CONTEXT,
      );
      return { routed: false };
    }
    return { routed: true, organisation, sessionIdentifier: parts.sessionIdentifier };
  }

  /** Closes the directory's pool and every Organisation's. Called when the application shuts down. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const handles = [this.directory, ...this.pools.values()];
    this.pools.clear();
    await Promise.all(handles.map((handle) => handle.close()));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  private async find(organisationCode: string): Promise<RoutedOrganisation | undefined> {
    this.refuseIfClosed();
    // A code PostgreSQL text cannot hold, one with U+0000, is in no directory: it is unknown, like any other
    // unknown code, and never reaches the query, where it would fail (access-and-approvals 3.1, 3.3).
    if (organisationCode === '' || organisationCode.includes('\u0000')) return undefined;
    const databaseName = await findDatabaseName(this.directory.db, organisationCode);
    if (databaseName === undefined) return undefined;
    return { organisationCode, databaseName, db: this.poolFor(databaseName).db };
  }

  private refuseIfClosed(): void {
    if (this.closed) throw new Error('Organisation routing is closed');
  }

  // One pool per Organisation database, made on first use and kept until close. Checked again here, after the
  // directory read, so a close that came while it waited leaves no pool behind.
  private poolFor(databaseName: string): DatabaseHandle {
    this.refuseIfClosed();
    let handle = this.pools.get(databaseName);
    if (handle === undefined) {
      handle = this.openPool(this.connectionTo(databaseName));
      this.pools.set(databaseName, handle);
    }
    return handle;
  }

  private openPool(connectionString: string): DatabaseHandle {
    return createDb(connectionString, {
      max: this.config.poolMax,
      onIdleError: (error) => {
        this.logger.error(error, CONTEXT);
      },
    });
  }
}

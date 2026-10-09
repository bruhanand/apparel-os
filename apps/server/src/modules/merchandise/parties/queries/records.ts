import type {
  AgreementRecord,
  AgreementTerms,
  BrandSupplierLinkRecord,
  PartyRecord,
  RestrictedText,
  TermsInForce,
} from '@apparel-os/schemas';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest, OrganisationKeys } from '../../../access/index.js';
import {
  agreement,
  agreementVersion,
  brandSupplierLink,
  brandSupplierLinkVersion,
  party,
  partyBankDetails,
  partyContact,
  partyRole,
  partyTaxIdentity,
  partyVersion,
  type Decision,
} from '../db/schema.js';
import { openBankDetails, type BankValues } from '../domain/bank-seal.js';
import { versionState } from '../domain/kinds.js';
import { datesOf } from '../commands/lines.js';

// The parties part's records with every version, a page at a time or one at a time (structure-and-masters 5.5, 8;
// code-house-rules 12.1; S1-F03-T03). Bank details are always masked in a read: showing a version is a protected action
// of its own (access-and-approvals 3.3, 6). Margins are shown only to a reader whose assignment grants the class.

export interface PageRequest {
  readonly after?: string | undefined;
  readonly limit?: number | undefined;
}
export interface Page<T> {
  readonly records: T[];
  readonly next: string | null;
}
/** The latest approval request of each version named, from `access` (9.1, 9.6). */
export type RequestReader = (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>;

/** A technical cap the builders set (code-house-rules 12.1), the same as the structure's. */
const PAGE_CAP = 100;

interface VersionRow {
  readonly id: string;
  readonly validDuring: string;
  readonly decision: Decision;
}

/** The shared fields of a version as a reader sees it: its dates, state and latest request. */
function versionView(row: VersionRow, today: string, request: LatestRequest | undefined) {
  const dates = datesOf(row.validDuring);
  return {
    id: row.id,
    validFrom: dates.start,
    ...(dates.end === undefined ? {} : { validTo: dates.end }),
    state: versionState({
      decision: row.decision,
      start: dates.start,
      end: dates.end,
      today,
      requestState: request?.state,
    }),
    ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
  };
}

const newestFirst = <T extends VersionRow>(rows: readonly T[]) =>
  [...rows].sort((a, b) => {
    const byStart = datesOf(b.validDuring).start.localeCompare(datesOf(a.validDuring).start);
    return byStart !== 0 ? byStart : b.id.localeCompare(a.id);
  });
const tokenOf = (rows: readonly VersionRow[]) =>
  rows
    .map((row) => row.id)
    .sort()
    .at(-1);

/** A page of identifiers in code order, then identifier, after the cursor's record (code-house-rules 12.1). */
async function codePage(
  context: TransactionContext,
  table: 'party' | 'agreement',
  page: PageRequest,
): Promise<{ ids: string[]; next: string | null }> {
  const limit = Math.min(page.limit ?? PAGE_CAP, PAGE_CAP);
  const name = sql.raw(`merchandise.${table}`);
  const after =
    page.after === undefined
      ? sql`true`
      : sql`(code, id) > (select code, id from ${name} where id = ${page.after}::uuid)`;
  const result = await context.tx.execute<{ id: string }>(
    sql`select id::text as id from ${name} where ${after} order by code, id limit ${limit + 1}`,
  );
  const ids = result.rows.map((row) => row.id);
  const shown = ids.slice(0, limit);
  return { ids: shown, next: ids.length > limit ? (shown.at(-1) ?? null) : null };
}

// Parties (5.1, 5.5).

async function partiesOf(
  context: TransactionContext,
  ids: readonly string[],
  today: string,
  requests: RequestReader,
): Promise<PartyRecord[]> {
  if (ids.length === 0) return [];
  const heads = await context.tx
    .select()
    .from(party)
    .where(inArray(party.id, [...ids]));
  const versions = await context.tx
    .select()
    .from(partyVersion)
    .where(inArray(partyVersion.partyId, [...ids]));
  const versionIds = versions.map((row) => row.id);
  const taxes =
    versionIds.length === 0
      ? []
      : await context.tx
          .select()
          .from(partyTaxIdentity)
          .where(inArray(partyTaxIdentity.partyVersionId, versionIds))
          .orderBy(asc(partyTaxIdentity.id));
  const contacts =
    versionIds.length === 0
      ? []
      : await context.tx
          .select()
          .from(partyContact)
          .where(inArray(partyContact.partyVersionId, versionIds))
          .orderBy(asc(partyContact.position));
  const roles = await context.tx
    .select()
    .from(partyRole)
    .where(inArray(partyRole.partyId, [...ids]));
  const banks = await context.tx
    .select({
      id: partyBankDetails.id,
      partyId: partyBankDetails.partyId,
      validDuring: partyBankDetails.validDuring,
      decision: partyBankDetails.decision,
    })
    .from(partyBankDetails)
    .where(inArray(partyBankDetails.partyId, [...ids]));
  const latest = await requests(banks.filter((row) => row.decision === 'Awaiting approval').map((row) => row.id));
  return ids.flatMap((id): PartyRecord[] => {
    const head = heads.find((row) => row.id === id);
    if (head === undefined) return [];
    const own = newestFirst(versions.filter((row) => row.partyId === id));
    const ownRoles = roles.filter((row) => row.partyId === id);
    const roleNames = [...new Set(ownRoles.map((row) => row.role))].sort();
    const ownBanks = newestFirst(banks.filter((row) => row.partyId === id));
    const bankToken = tokenOf(ownBanks);
    const token = tokenOf(own);
    return [
      {
        id,
        code: head.code,
        ...(token === undefined ? {} : { versionToken: token }),
        versions: own.map((row) => ({
          ...versionView(row, today, undefined),
          legalName: row.legalName,
          taxIdentities: taxes
            .filter((tax) => tax.partyVersionId === row.id)
            .map((tax) => ({ kind: tax.kind, number: tax.number })),
          msmeClassification: row.msmeClassification,
          contacts: contacts.filter((each) => each.partyVersionId === row.id).map((each) => each.contact),
        })),
        roles: roleNames.map((role) => {
          const line = newestFirst(ownRoles.filter((row) => row.role === role));
          return {
            role,
            versionToken: tokenOf(line) ?? '',
            versions: line.map((row) => ({ ...versionView(row, today, undefined), held: row.held })),
          };
        }),
        bankDetails: {
          ...(bankToken === undefined ? {} : { versionToken: bankToken }),
          // Never the value: a read shows that it exists, masked (access-and-approvals 6; PRD-ACS-008).
          versions: ownBanks.map((row) => ({ ...versionView(row, today, latest.get(row.id)), masked: true as const })),
        },
      },
    ];
  });
}

export async function partyPage(
  context: TransactionContext,
  page: PageRequest,
  today: string,
  requests: RequestReader,
): Promise<Page<PartyRecord>> {
  const found = await codePage(context, 'party', page);
  return { records: await partiesOf(context, found.ids, today, requests), next: found.next };
}

export async function partyRecord(
  context: TransactionContext,
  partyId: string,
  today: string,
  requests: RequestReader,
): Promise<PartyRecord | undefined> {
  const [record] = await partiesOf(context, [partyId], today, requests);
  return record;
}

/** One bank-detail version of the party, opened, or undefined when the party has none of that identifier. */
export async function openedBankDetails(
  context: TransactionContext,
  keys: OrganisationKeys,
  partyId: string,
  versionId: string,
): Promise<BankValues | undefined> {
  const [row] = await context.tx
    .select({ sealed: partyBankDetails.sealed, scheme: partyBankDetails.scheme })
    .from(partyBankDetails)
    .where(and(eq(partyBankDetails.id, versionId), eq(partyBankDetails.partyId, partyId)));
  if (row === undefined) return undefined;
  return openBankDetails(keys, context.organisationCode, versionId, { scheme: row.scheme, ciphertext: row.sealed });
}

// Brand–supplier links (5.1; PRD-MER-021).

export async function linkPage(
  context: TransactionContext,
  page: PageRequest,
  today: string,
): Promise<Page<BrandSupplierLinkRecord>> {
  const limit = Math.min(page.limit ?? PAGE_CAP, PAGE_CAP);
  const heads = await context.tx
    .select()
    .from(brandSupplierLink)
    .where(page.after === undefined ? undefined : gt(brandSupplierLink.id, page.after))
    .orderBy(asc(brandSupplierLink.id))
    .limit(limit + 1);
  const shown = heads.slice(0, limit);
  const versions =
    shown.length === 0
      ? []
      : await context.tx
          .select()
          .from(brandSupplierLinkVersion)
          .where(
            inArray(
              brandSupplierLinkVersion.linkId,
              shown.map((row) => row.id),
            ),
          );
  return {
    records: shown.map((head) => {
      const own = newestFirst(versions.filter((row) => row.linkId === head.id));
      return {
        id: head.id,
        brandId: head.brandId,
        partyId: head.partyId,
        versionToken: tokenOf(own) ?? '',
        versions: own.map((row) => ({ ...versionView(row, today, undefined), linked: row.linked })),
      };
    }),
    next: heads.length > limit ? (shown.at(-1)?.id ?? null) : null,
  };
}

// Agreements (5.2, 5.5).

const marginsOf = (margins: string | null, showMargins: boolean): RestrictedText =>
  showMargins ? { kind: 'shown', value: margins } : { kind: 'masked' };

async function agreementsOf(
  context: TransactionContext,
  ids: readonly string[],
  today: string,
  requests: RequestReader,
  showMargins: boolean,
): Promise<AgreementRecord[]> {
  if (ids.length === 0) return [];
  const heads = await context.tx
    .select()
    .from(agreement)
    .where(inArray(agreement.id, [...ids]));
  const versions = await context.tx
    .select()
    .from(agreementVersion)
    .where(inArray(agreementVersion.agreementId, [...ids]))
    .orderBy(desc(agreementVersion.id));
  const latest = await requests(versions.filter((row) => row.decision === 'Awaiting approval').map((row) => row.id));
  return ids.flatMap((id): AgreementRecord[] => {
    const head = heads.find((row) => row.id === id);
    if (head === undefined) return [];
    const own = newestFirst(versions.filter((row) => row.agreementId === id));
    const token = tokenOf(own);
    return [
      {
        id,
        code: head.code,
        counterparty:
          head.brandId !== null
            ? { kind: 'brand', brandId: head.brandId }
            : { kind: 'supplier', partyId: head.partyId ?? '' },
        ...(token === undefined ? {} : { versionToken: token }),
        versions: own.map((row) => ({
          ...versionView(row, today, latest.get(row.id)),
          terms: row.terms as AgreementTerms,
          margins: marginsOf(row.margins, showMargins),
          signedAgreement: row.signedAgreementAttachmentIds,
        })),
      },
    ];
  });
}

export async function agreementPage(
  context: TransactionContext,
  page: PageRequest,
  today: string,
  requests: RequestReader,
  showMargins: boolean,
): Promise<Page<AgreementRecord>> {
  const found = await codePage(context, 'agreement', page);
  return { records: await agreementsOf(context, found.ids, today, requests, showMargins), next: found.next };
}

export async function agreementRecord(
  context: TransactionContext,
  agreementId: string,
  today: string,
  requests: RequestReader,
  showMargins: boolean,
): Promise<AgreementRecord | undefined> {
  const [record] = await agreementsOf(context, [agreementId], today, requests, showMargins);
  return record;
}

/**
 * Read the terms in force (5.5; PRD-ORG-016): the approved version of the brand's or the supplier's agreement in force
 * on the date, with its identifier, which a transaction keeps (2.2; PRD-ACP-013); undefined when none is.
 */
export async function termsInForce(
  context: TransactionContext,
  of: { readonly brandId?: string | undefined; readonly partyId?: string | undefined },
  date: string,
  showMargins: boolean,
): Promise<Omit<TermsInForce, 'asOf'> | undefined> {
  const [row] = await context.tx
    .select({
      agreementId: agreement.id,
      code: agreement.code,
      versionId: agreementVersion.id,
      validDuring: agreementVersion.validDuring,
      terms: agreementVersion.terms,
      margins: agreementVersion.margins,
    })
    .from(agreementVersion)
    .innerJoin(agreement, eq(agreement.id, agreementVersion.agreementId))
    .where(
      and(
        of.brandId !== undefined
          ? eq(agreement.brandId, of.brandId)
          : of.partyId !== undefined
            ? eq(agreement.partyId, of.partyId)
            : sql`false`,
        eq(agreementVersion.decision, 'Approved'),
        sql`${agreementVersion.validDuring} @> ${date}::date`,
      ),
    )
    .limit(1);
  if (row === undefined) return undefined;
  const dates = datesOf(row.validDuring);
  return {
    agreementId: row.agreementId,
    code: row.code,
    versionId: row.versionId,
    validFrom: dates.start,
    ...(dates.end === undefined ? {} : { validTo: dates.end }),
    terms: row.terms as AgreementTerms,
    margins: marginsOf(row.margins, showMargins),
  };
}

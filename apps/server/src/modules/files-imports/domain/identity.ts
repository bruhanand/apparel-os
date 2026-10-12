import { createHash } from 'node:crypto';

// A document's source identity and content (imports-and-opening-data 7.1 to 7.3; PRD-IMP-011, PRD-INT-002,
// PRD-ACP-012; S1-F06-T04). The identity is the target, the scope key the handler names and the document reference;
// the content is the document's values for the handler's fields, whatever their origin, in no row order. A document
// whose identity is published with the same content is a duplicate; with other content a conflict, or, where the
// batch is a governed revision the handler supports, a revision. Pure, apart from hashing.

/** A value as the content reads it: its text, or Unknown. */
type ContentValue = { readonly kind: 'unknown' } | { readonly kind: string; readonly value: string };

/** The SHA-256 of the document's values for the fields named, each row as its fields' texts or null (Unknown). */
export function documentContentHash(
  fields: readonly string[],
  rows: readonly Readonly<Record<string, ContentValue | undefined>>[],
): string {
  const names = [...fields].sort();
  const lines = rows
    .map((row) =>
      JSON.stringify(
        names.map((name) => {
          const value = row[name];
          return value === undefined || !('value' in value) ? null : value.value;
        }),
      ),
    )
    .sort();
  return createHash('sha256').update(JSON.stringify(lines)).digest('hex');
}

export type IdentityFinding =
  { readonly kind: 'new' } | { readonly kind: 'duplicate' | 'conflict' | 'revision'; readonly of: string };

/**
 * What a document is against the published document of its identity (7.2, 7.3). A published document whose content
 * is Unknown, published before content was kept, is never a duplicate (PRD-MOD-015).
 */
export function identityFinding(
  published: { readonly documentId: string; readonly contentHash: string | null } | undefined,
  contentHash: string,
  revision: boolean,
): IdentityFinding {
  if (published === undefined) return { kind: 'new' };
  if (published.contentHash === contentHash) return { kind: 'duplicate', of: published.documentId };
  return { kind: revision ? 'revision' : 'conflict', of: published.documentId };
}

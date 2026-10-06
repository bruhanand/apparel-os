/** What My work orders an item by (access-and-approvals 11.2). */
export interface Orderable {
  /** The due time, or none while routing has no rows (RR-058). */
  readonly dueAt: Date | null;
  readonly exposure:
    { readonly kind: 'none' } | { readonly kind: 'unknown' } | { readonly kind: 'known'; readonly amount: number };
  readonly recordedAt: Date;
  readonly id: string;
}

/** Rank of an exposure: Unknown above every known amount, never as zero (PRD-MOD-015); no value at all last. */
function exposureRank(exposure: Orderable['exposure']): number {
  if (exposure.kind === 'unknown') return 0;
  if (exposure.kind === 'known') return 1;
  return 2;
}

/**
 * The order of My work (access-and-approvals 11.2; PRD-ACS-009, PRD-MOD-015): by due time, earliest first, then by
 * exposure, largest first, an Unknown exposure above every known amount at the same due time. **Design choice**
 * (S1-F01-T13): an item with no due time comes after every item with one, and an item with no value at all, such as
 * an access change, after every Unknown and known exposure; ties keep the order the items arrived in.
 */
export function compareWork(a: Orderable, b: Orderable): number {
  if (a.dueAt !== null || b.dueAt !== null) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    const due = a.dueAt.getTime() - b.dueAt.getTime();
    if (due !== 0) return due;
  }
  const rank = exposureRank(a.exposure) - exposureRank(b.exposure);
  if (rank !== 0) return rank;
  if (a.exposure.kind === 'known' && b.exposure.kind === 'known' && a.exposure.amount !== b.exposure.amount) {
    return b.exposure.amount - a.exposure.amount;
  }
  const arrived = a.recordedAt.getTime() - b.recordedAt.getTime();
  if (arrived !== 0) return arrived;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

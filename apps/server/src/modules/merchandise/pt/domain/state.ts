import type { PtRevisionState } from '@apparel-os/schemas';

// A PT revision's state (design-language 7; goods-in 5.7, 6.3, 6.6; S2-F06-T01), worked out from its rows, never stored
// apart (code-house-rules 7.2): Withdrawn once withdrawn; Official once its approval is posted; Rejected once rejected;
// Failed while its latest queued posting was refused; Posting while that posting waits, as stock-ledger 10.6 names it;
// Awaiting approval until then.
// Pure.

export interface RevisionFacts {
  readonly withdrawn: boolean;
  readonly approved: boolean;
  readonly rejected: boolean;
  /** Whether its latest request to post through a queued job exists, and whether that request was refused. */
  readonly postRequested: boolean;
  readonly failed: boolean;
}

export function revisionStateOf(facts: RevisionFacts): PtRevisionState {
  if (facts.withdrawn) return 'Withdrawn';
  if (facts.approved) return 'Official';
  if (facts.rejected) return 'Rejected';
  if (facts.failed) return 'Failed';
  if (facts.postRequested) return 'Posting';
  return 'Awaiting approval';
}

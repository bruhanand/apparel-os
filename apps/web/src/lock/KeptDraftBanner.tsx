import { Banner } from '../components/Banner';
import { Button } from '../components/Button';

/**
 * The offer of input kept from the last session (access-and-approvals 3.3; PRD-ACS-017, PRD-UXP-003), at the top of
 * the form it belongs to: restore it into the form, or discard it. Restricted fields were never kept.
 */
export function KeptDraftBanner({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <Banner tone="info" message="kept-draft.body">
      <div className="flex flex-wrap gap-2">
        <Button label="kept-draft.restore" size="small" onClick={onRestore} />
        <Button label="kept-draft.discard" size="small" variant="ghost" onClick={onDiscard} />
      </div>
    </Banner>
  );
}

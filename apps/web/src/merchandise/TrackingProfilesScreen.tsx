import { useState } from 'react';
import { t, type MessageId } from '../messages/catalogue';
import { MasterTab } from '../organisation/MasterTab';

// Setup › Merchandise tracking profiles (structure-and-masters 4.4 to 4.6, 8; ui-blueprint Setup; S1-F03-T02): the
// tracking profiles, piece-tracked or quantity, with batch and expiry, required identifiers and the minimum shelf life
// for receiving and selling, each Unknown until given (POL-04.05, V-05); each category's dated profile (POL-04.01);
// and the purchasing and selling packs with their conversions or contents (POL-04.03, POL-04.04). A SKU's stock unit
// is its own version, on Setup › Products. No profile, unit or pack is set in the app.

type TabId = 'tracking_profile' | 'category_tracking_profile' | 'pack';
const TABS: readonly { id: TabId; label: MessageId }[] = [
  { id: 'tracking_profile', label: 'tracking.tab.tracking_profile' },
  { id: 'category_tracking_profile', label: 'tracking.tab.category_tracking_profile' },
  { id: 'pack', label: 'tracking.tab.pack' },
];

/** Setup › Merchandise tracking profiles. */
export function TrackingProfilesScreen() {
  const [current, setCurrent] = useState<TabId>('tracking_profile');
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={t('screen.setup.merchandise-tracking-profiles')}
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tracking-tab-${tab.id}`}
            aria-selected={current === tab.id}
            aria-controls="tracking-tab-panel"
            className={
              current === tab.id
                ? 'h-9 border-b-2 border-accent px-3 font-semibold text-text'
                : 'h-9 px-3 text-text-2 hover:text-accent'
            }
            onClick={() => {
              setCurrent(tab.id);
            }}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <div id="tracking-tab-panel" role="tabpanel" aria-labelledby={`tracking-tab-${current}`}>
        <MasterTab key={current} kind={current} />
      </div>
    </div>
  );
}

import { cn } from '@apparel-os/ui';
import { t } from '../messages/catalogue';
import { familyGlyphs, stateFamilies, type Family, type StateId } from './states';

/** The background and text tokens of each family (design-language 7). */
export const familyClasses: Readonly<Record<Family, string>> = {
  neutral: 'bg-n-bg text-n-fg',
  pending: 'bg-i-bg text-i-fg',
  moving: 'bg-p-bg text-p-fg',
  done: 'bg-s-bg text-s-fg',
  attention: 'bg-w-bg text-w-fg',
  stopped: 'bg-d-bg text-d-fg',
  quarantine: 'bg-q-bg text-q-fg',
};

/**
 * A record's one status badge: glyph and word in its family's colours, 22 px, never clickable (design-language 7,
 * 10.2). It hugs its text wherever it sits, even in a column that stretches its children.
 */
export function StatusBadge({ state }: { state: StateId }) {
  return <FamilyBadge family={stateFamilies[state]} label={t(`state.${state}`)} />;
}

/**
 * The badge of a family with its own word, for a mark that is no record's state but takes a family's glyph and
 * colours, such as a row issue's severity (design-language 7).
 */
export function FamilyBadge({ family, label }: { family: Family; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] w-fit shrink-0 items-center gap-1 self-start whitespace-nowrap rounded-full px-[9px] text-[12px] font-semibold',
        familyClasses[family],
      )}
    >
      <span aria-hidden="true" className="text-[11px]">
        {familyGlyphs[family]}
      </span>
      <span>{label}</span>
    </span>
  );
}

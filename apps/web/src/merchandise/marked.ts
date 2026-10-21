import type { AttributeMark } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { readQuery } from '../api/query';
import type { MessageId } from '../messages/catalogue';
import { useGranted } from '../setup/parts';

// The attribute the Organisation marks as its season or its size list (structure-and-masters 4.2 "As built"; RR-550,
// RR-556), as a form that names a season or a size reads it: its values are the ones offered. Nothing is chosen in its
// place while none is marked (code-house-rules 12.14).

/** What each marking is called on the screens that show it (Setup › Vocabularies, the approval panel). */
export const MARK_LABEL: Readonly<Record<AttributeMark, MessageId>> = {
  season: 'marked.mark.season',
  size: 'marked.mark.size',
};

export type MarkedAttributeRead =
  | { readonly kind: 'reading' }
  | { readonly kind: 'set'; readonly attributeId: string }
  | { readonly kind: 'not-set' }
  /** The reader may not view the setting, or it could not be read. */
  | { readonly kind: 'unreadable' };

/** The attribute marked now as the season or the size list. */
export function useMarkedAttribute(mark: AttributeMark): MarkedAttributeRead {
  const granted = useGranted('merchandise.marked_attribute', 'view');
  const query = useQuery({ ...readQuery(api, 'listMarkedAttributes', {}), enabled: granted });
  if (!granted || query.isError) return { kind: 'unreadable' };
  if (query.data === undefined) return { kind: 'reading' };
  const inForce = query.data.marks.find((each) => each.mark === mark)?.inForce;
  return inForce?.kind === 'set' ? { kind: 'set', attributeId: inForce.attributeId } : { kind: 'not-set' };
}

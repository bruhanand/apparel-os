import type { FormatPartView } from '@apparel-os/schemas';
import { t } from '../messages/catalogue';

/**
 * A number format's parts as one line of text: fixed text as it is, the device code, the year and the sequence named
 * (numbering-and-audit 3.5; S1-F12-T03), for Setup and the approval panel.
 */
export function formatText(parts: readonly FormatPartView[]): string {
  return parts
    .map((part) => {
      switch (part.kind) {
        case 'text':
          return part.text;
        case 'scope':
          return t('numbering.format.part.scope-shown');
        case 'year':
          return t('numbering.format.part.year-shown');
        case 'sequence':
          return t('numbering.format.part.sequence-shown', { width: String(part.width) });
      }
    })
    .join('');
}

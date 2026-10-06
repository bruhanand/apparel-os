import { cn } from '@apparel-os/ui';
import type { ReactNode } from 'react';
import { t, type MessageId } from '../messages/catalogue';
import { familyClasses } from './StatusBadge';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const tones: Readonly<Record<BannerTone, { glyph: string; classes: string }>> = {
  info: { glyph: 'i', classes: familyClasses.pending },
  success: { glyph: '✓', classes: familyClasses.done },
  warning: { glyph: '!', classes: familyClasses.attention },
  danger: { glyph: '✕', classes: familyClasses.stopped },
};

/**
 * A banner at the top of the page or section it concerns (design-language 10.12): a glyph circle, the title or text,
 * and an optional action. It stays until its condition clears.
 */
export function Banner({
  tone,
  message,
  children,
  role,
}: {
  tone: BannerTone;
  message: MessageId;
  children?: ReactNode;
  role?: 'status' | 'alert';
}) {
  const { glyph, classes } = tones[tone];
  return (
    <div role={role} className={cn('grid grid-cols-[20px_1fr] items-start gap-3 px-4 py-2 text-body-sm', classes)}>
      <span
        aria-hidden="true"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px] font-bold"
      >
        {glyph}
      </span>
      <div className="flex flex-col gap-1">
        <span className="font-semibold">{t(message)}</span>
        {children}
      </div>
    </div>
  );
}

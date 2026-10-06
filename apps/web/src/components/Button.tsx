import { cn } from '@apparel-os/ui';
import type { ButtonHTMLAttributes } from 'react';
import { t, type MessageId } from '../messages/catalogue';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

const variants: Readonly<Record<ButtonVariant, string>> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface text-text border border-control hover:bg-hover',
  ghost: 'bg-transparent text-accent hover:bg-tint',
  destructive: 'bg-danger text-on-danger',
};

const sizes = { small: 'h-7 px-2', default: 'h-9 px-3', touch: 'h-12 px-4' } as const;

/**
 * A button of design-language 10.1. Its label is a message; at most one primary per view. Disabled uses the native
 * attribute and a dashed border; its reason sits beside it or in `reason`, shown as its tooltip.
 */
export function Button({
  label,
  variant = 'secondary',
  size = 'default',
  reason,
  className,
  type = 'button',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> & {
  label: MessageId;
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  reason?: MessageId;
}) {
  return (
    <button
      type={type}
      title={reason === undefined ? undefined : t(reason)}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control text-body font-semibold',
        'disabled:border disabled:border-dashed disabled:border-control disabled:bg-sunken disabled:text-text-3',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {t(label)}
    </button>
  );
}

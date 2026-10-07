import type { ReactNode } from 'react';
import { t } from '../messages/catalogue';

/**
 * "No access assigned" (design-language 10.20; personas.md section 2; DEC-118, RR-260; PRD-ACS-002): what a signed-in
 * person who holds no role assignment in force sees. One solid card, a line saying an Admin must assign a role, and
 * Sign out as the one action; no menu and no screen.
 */
export function NoAccessAssigned({ signOut }: { signOut?: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-e1">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">{t('no-access.title')}</h1>
        <p className="text-body text-text-2">{t('no-access.body')}</p>
      </div>
      {signOut}
    </div>
  );
}

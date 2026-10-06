import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, type FieldValues, type Resolver, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { keptInput, type DeclaredFields } from '../lock/kept-input';
import { useSession } from '../shell/session';

/**
 * A form for one command route (PRD Stack: Web, React Hook Form and Zod; code-house-rules 12.2): validated with the
 * route's body schema on blur and on submit (design-language 10.7). When the session locks, the form keeps its unsaved
 * input but clears every field the route declares secret or restricted (access-and-approvals 3.3; PRD-SEC-006), so
 * the person enters those again after unlocking.
 */
export function useRouteForm<Values extends FieldValues>(
  route: DeclaredFields & { body: z.ZodType<Values, FieldValues> },
): UseFormReturn<Values> {
  const form = useForm<Values>({
    resolver: zodResolver(route.body) as unknown as Resolver<Values>,
    mode: 'onBlur',
  });
  const { session } = useSession();
  useEffect(() => {
    if (session.state === 'locked') {
      form.reset(keptInput(route, form.getValues()) as Values, { keepDirty: true, keepErrors: true });
    }
  }, [session.state, form, route]);
  return form;
}

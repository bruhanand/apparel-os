import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, type FieldValues, type Resolver, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { keptInput, type DeclaredFields } from '../lock/kept-input';
import { useSession } from '../shell/session';

/**
 * The resolver of a command route's form: it checks the input with the route's body schema, and hands on the input
 * as typed, not the schema's output. The typed client sends the body's input shape (CallInput), and a secret field's
 * output is a `Secret` that serialises as a placeholder, so the parsed output must never be what is sent
 * (code-house-rules 12.2; PRD-SEC-014; S1-F01-T15).
 */
export function routeResolver<Body extends z.ZodType<unknown, FieldValues>>(route: {
  body: Body;
}): Resolver<z.input<Body>> {
  return zodResolver(route.body, undefined, { raw: true }) as unknown as Resolver<z.input<Body>>;
}

/**
 * A form for one command route (PRD Stack: Web, React Hook Form and Zod; code-house-rules 12.2): validated with the
 * route's body schema on blur and on submit (design-language 10.7). Its values are the body's input, as typed, which
 * is what the typed client sends (routeResolver). When the session locks, the form keeps its unsaved
 * input but clears every field the route declares secret or restricted (access-and-approvals 3.3; PRD-SEC-006), so
 * the person enters those again after unlocking.
 */
export function useRouteForm<Body extends z.ZodType<unknown, FieldValues>>(
  route: DeclaredFields & { body: Body },
): UseFormReturn<z.input<Body>> {
  type Values = z.input<Body>;
  const form = useForm<Values>({
    resolver: routeResolver(route),
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

import { z } from 'zod';
import { errorEnvelopeSchema, errorKindOf, statusOfKind } from './errors.js';
import { IDEMPOTENCY_KEY_HEADER } from './headers.js';
import { codesOfRoute, needsIdempotencyKey, type Route, type RouteTable } from './route-table.js';
import { secretRegistry } from './secret.js';

// The OpenAPI document, generated from the route table with Zod's own JSON Schema output, so no generator library is
// added (code-house-rules 12.2, 10.6). The document is committed, and a unit test fails when it differs from a fresh
// generation, so every API change shows in review (PRD-SEC-015, PRD-SEC-016).

type JsonSchema = Record<string, unknown>;

/**
 * One schema as JSON Schema, in its wire form (Zod's input side). A secret field is a write-only password; a secret
 * an answer shows once is a read-only password marked `x-shown-once` (code-house-rules 12.2, 12.6; PRD-SEC-014).
 */
function jsonSchema(schema: z.ZodType): JsonSchema {
  const generated = z.toJSONSchema(schema, {
    io: 'input',
    override: (context) => {
      const meta = secretRegistry.get(context.zodSchema);
      if (meta === undefined) return;
      context.jsonSchema.format = 'password';
      if (meta.shownOnce === true) {
        context.jsonSchema.readOnly = true;
        context.jsonSchema['x-shown-once'] = true;
      } else {
        context.jsonSchema.writeOnly = true;
      }
    },
  }) as JsonSchema;
  delete generated.$schema;
  return generated;
}

function parameters(route: Route): JsonSchema[] {
  const list: JsonSchema[] = [];
  const add = (where: 'path' | 'query', schema: z.ZodObject | undefined): void => {
    if (schema === undefined) return;
    const object = jsonSchema(schema) as { properties?: Record<string, JsonSchema>; required?: string[] };
    for (const [name, property] of Object.entries(object.properties ?? {})) {
      list.push({ name, in: where, required: (object.required ?? []).includes(name), schema: property });
    }
  };
  add('path', route.params);
  add('query', route.query);
  if (needsIdempotencyKey(route)) {
    list.push({
      name: IDEMPOTENCY_KEY_HEADER,
      in: 'header',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    });
  }
  return list;
}

function responses(route: Route): Record<string, JsonSchema> {
  const answers: Record<string, JsonSchema> = {
    '200': { description: 'Success', content: { 'application/json': { schema: jsonSchema(route.response) } } },
  };
  const byStatus = new Map<number, string[]>();
  for (const code of codesOfRoute(route)) {
    const status = statusOfKind(errorKindOf(code));
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  for (const [status, codes] of [...byStatus].sort(([a], [b]) => a - b)) {
    answers[String(status)] = {
      description: 'The error envelope (code-house-rules 12.3)',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
      'x-error-codes': codes,
    };
  }
  return answers;
}

function operation(name: string, route: Route): JsonSchema {
  const entry: JsonSchema = {
    operationId: name,
    'x-access': route.access,
    parameters: parameters(route),
    responses: responses(route),
  };
  if (route.command) {
    entry.requestBody = { required: true, content: { 'application/json': { schema: jsonSchema(route.body) } } };
  }
  return entry;
}

/** The OpenAPI 3.1 document of a route table. */
export function openApiDocument(table: RouteTable): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {};
  for (const [name, route] of Object.entries(table).sort(([a], [b]) => a.localeCompare(b))) {
    paths[route.path] = { ...paths[route.path], [route.method.toLowerCase()]: operation(name, route) };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Apparel OS API', version: '0' },
    paths,
    components: { schemas: { ErrorEnvelope: jsonSchema(errorEnvelopeSchema) } },
  };
}

/** The document as it is committed: two-space JSON with a final newline. */
export function openApiText(table: RouteTable): string {
  return `${JSON.stringify(openApiDocument(table), null, 2)}\n`;
}

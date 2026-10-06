import { z } from 'zod';

/** Body of GET /api/health. */
export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

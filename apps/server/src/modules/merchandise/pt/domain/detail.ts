import { z } from 'zod';

// The payload a PT row keeps beside its columns (code-house-rules 3.3 "Payload snapshot"; goods-in 5.7, 5.8;
// PRD-IMP-006): the origin of each value the file gave, as the import staged it (Supplied, Calculated, Mapped or
// Entered by a person; the staged row keeps the cell itself), and where the row's existing product holds another value
// than the row (goods-in 5.5). Versioned by its shape.

export const ptRowDetailSchema = z.strictObject({
  shape: z.literal('pt-row-detail/1'),
  origins: z.record(z.string(), z.enum(['supplied', 'calculated', 'mapped', 'entered'])),
  differences: z.array(z.strictObject({ field: z.string(), file: z.string(), product: z.string().nullable() })),
});
export type PtRowDetail = z.infer<typeof ptRowDetailSchema>;

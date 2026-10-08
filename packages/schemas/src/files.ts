import { z } from 'zod';
import { idSchema } from './common.js';
import { fieldClassSchema } from './roles.js';

// Stored files and evidence attachments (imports-and-opening-data 3.1 step 2, 11, 13.1, 15.1; S1-F06-T05). The route
// table carries JSON only, so a file travels as base64 inside the JSON body (design choice, 9.3 "Evidence files").

/**
 * The size limit of an evidence file (PDF, JPEG, PNG) in bytes: 10 MiB. Chosen by the builders within the safeguards
 * of imports-and-opening-data 9.3 (DEC-117, GC6-5); it is no KDPS value and no policy. A scanned supplier invoice or
 * a phone photograph of a challan is normally well under it. A file over it is refused with this number named, and
 * never truncated. Tuned by measurement; the figure is documented in imports-and-opening-data 9.3.
 */
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The most a store-file request body may hold on the wire (bytes): twice the base64 form of the limit, so a file
 * over the limit by any ordinary amount still reaches the check that names the limit.
 */
export const STORE_FILE_BODY_LIMIT_BYTES = 2 * Math.ceil(EVIDENCE_MAX_BYTES / 3) * 4 + 8192;

/** The real formats of an evidence file, found from its content and never from its name (9.2, class A-1). */
export const storedFileFormatSchema = z.enum(['pdf', 'jpeg', 'png']);
export type StoredFileFormat = z.infer<typeof storedFileFormatSchema>;

/** Store a file (13.1): the bytes, the source system and the document reference claimed, where known. */
export const storeFileRequestSchema = z.strictObject({
  /** The system the file came from, such as `manual-upload`; a label, not a setting. */
  sourceSystem: z.string().min(1).max(120),
  /** The document reference the sender claims for it; left out when none is claimed. */
  claimedReference: z.string().min(1).max(200).optional(),
  /** The name the file had when handed in. A label only: the type is never read from it. */
  originalName: z.string().min(1).max(255),
  contentBase64: z.base64(),
});
export type StoreFileRequest = z.infer<typeof storeFileRequestSchema>;

const contentHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const storedFileSchema = z.strictObject({
  storedFileId: idSchema,
  receiptId: idSchema,
  contentHash: contentHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  format: storedFileFormatSchema,
  /** True when the same bytes were stored before: this call added a receipt and wrote no second object. */
  alreadyStored: z.boolean(),
});
export type StoredFileAnswer = z.infer<typeof storedFileSchema>;

/**
 * A receipt of the file as an authorised reader is served it: the name and reference are decrypted only here (section
 * 11, 15.1; RR-433). A null reference is none claimed; a null name is Unknown (a receipt written before it was encrypted).
 */
export const receiptSchema = z.strictObject({
  receiptId: idSchema,
  receivedAt: z.iso.datetime({ offset: true }),
  sourceSystem: z.string(),
  originalName: z.string().nullable(),
  claimedReference: z.string().nullable(),
});
export type Receipt = z.infer<typeof receiptSchema>;

/** A file read through the record it is attached to (13.1, section 11). */
export const attachedFileSchema = z.strictObject({
  attachmentId: idSchema,
  storedFileId: idSchema,
  contentHash: contentHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  format: storedFileFormatSchema,
  /** The restricted field classes the attachment carries; empty for a plain file. */
  restrictedClasses: z.array(fieldClassSchema),
  /** Every receipt of the file, oldest first. */
  receipts: z.array(receiptSchema),
  contentBase64: z.base64(),
});
export type AttachedFile = z.infer<typeof attachedFileSchema>;

import { mappingVerificationSchema, type RecordState } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { ApiFailure } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { t } from '../messages/catalogue';
import { formatDateTime } from '../history/format';
import { GrantedButton, inputClass, useGranted } from '../setup/parts';
import { useTimeZone } from '../shell/session';
import { RefusalBanner } from '../sign-in/RefusalBanner';
import { ORGANISATION_READS } from './kinds';

// A mapping version's verification on Setup › Organisation structure (structure-and-masters 3.4, 8; POL-10.08;
// S1-F02-T02): who verified it and when, with its evidence files; or, for an approved version not yet verified, the
// verify action, which stores the evidence file first (S1-F06-T05) and then records the verification. Verifying is a
// permission of its own, and the person who made the mapping is refused with the reason on screen (GC2-2, DEC-105).

const VERIFICATION = 'organisation.business_unit_mapping_verification';
const APPROVED: readonly RecordState[] = ['Scheduled', 'In force', 'Ended'];

/** One evidence file, named by the receipt it was attached from, where the reader may read it (imports 11). */
function EvidenceFile({ attachmentId, index }: { attachmentId: string; index: number }) {
  const query = useQuery({
    queryKey: ['readAttachedFile', attachmentId],
    queryFn: async () => {
      const result = await api.call('readAttachedFile', { params: { attachmentId } });
      if (result.ok) return result.data;
      throw new ApiFailure(result.status, result.error);
    },
    enabled: useGranted(VERIFICATION, 'view'),
  });
  return <li>{query.data?.receipt.originalName ?? t('organisation.verification.file', { number: index + 1 })}</li>;
}

/** The bytes of a chosen file, as base64 (imports-and-opening-data 9.3 "Evidence files"). */
async function base64Of(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/** Stores the evidence file, then verifies the mapping version with it. */
function VerifyForm({ unitId, versionId }: { unitId: string; versionId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const storing = useSubmission('storeFile', []);
  const verifying = useSubmission('verifyBusinessUnitMapping', ORGANISATION_READS);
  const pending = storing.state.kind === 'pending' || verifying.state.kind === 'pending';
  const id = `verify-${versionId}`;
  if (!open) {
    return (
      <div>
        <GrantedButton
          label="organisation.verification.verify"
          recordType={VERIFICATION}
          action="create"
          onClick={() => {
            setOpen(true);
          }}
        />
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-card border border-border p-3"
      aria-label={t('organisation.verification.verify')}
      onSubmit={(event) => {
        event.preventDefault();
        if (file === null) return;
        void (async () => {
          const stored = await storing.submit({
            body: { sourceSystem: 'manual-upload', originalName: file.name, contentBase64: await base64Of(file) },
          });
          if (stored === undefined) return;
          await verifying.submit({
            params: { recordId: unitId, versionId },
            body: { evidence: [{ storedFileId: stored.storedFileId, fileReceiptId: stored.receiptId }] },
          });
        })();
      }}
    >
      {storing.state.kind === 'refused' && <RefusalBanner refusal={storing.state.refusal} />}
      {verifying.state.kind === 'refused' && <RefusalBanner refusal={verifying.state.refusal} />}
      {verifying.state.kind === 'done' && (
        <Banner tone="success" role="status" message="organisation.verification.done" />
      )}
      <label className="flex flex-col gap-1" htmlFor={id}>
        <span className="text-body-sm font-semibold">{t('organisation.verification.evidence')}</span>
        <input
          id={id}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className={inputClass}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
          }}
        />
      </label>
      <div>
        <Button type="submit" label="organisation.verification.submit" disabled={file === null || pending} />
      </div>
    </form>
  );
}

/** A mapping version's verification, or the verify action for an approved version that has none. */
export function MappingVerification({
  unitId,
  version,
}: {
  unitId: string;
  version: { readonly id: string; readonly state: RecordState; readonly verification?: unknown };
}) {
  const timeZone = useTimeZone();
  const parsed = mappingVerificationSchema.safeParse(version.verification);
  if (parsed.success) {
    return (
      <div
        className="flex flex-col gap-1 rounded-card bg-raised p-2"
        role="group"
        aria-label={t('organisation.verification.title')}
      >
        <span className="text-body-sm font-semibold">
          {t('organisation.verification.verified-at', { time: formatDateTime(parsed.data.verifiedAt, timeZone) })}
        </span>
        <span className="text-caption text-text-2">{t('organisation.verification.evidence')}</span>
        <ul className="m-0 list-none p-0 text-body-sm">
          {parsed.data.attachmentIds.map((attachmentId, index) => (
            <EvidenceFile key={attachmentId} attachmentId={attachmentId} index={index} />
          ))}
        </ul>
      </div>
    );
  }
  if (!APPROVED.includes(version.state)) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-body-sm text-text-2">{t('organisation.verification.unverified')}</span>
      <VerifyForm unitId={unitId} versionId={version.id} />
    </div>
  );
}

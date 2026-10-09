import type { AttachedFile, EvidenceFile } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { ApiFailure, failureBody } from '../api/query';
import { inputClass } from '../setup/parts';
import { t, type MessageId } from '../messages/catalogue';
import { RefusalBanner } from '../sign-in/RefusalBanner';

// Evidence files on a record (imports-and-opening-data 11, 13.1; design-language 10.14, 10.15; S1-F08-T03): the
// picker that stores a chosen file first (Store a file), and the list of a record's attached files with name, type and
// size, each opened through the app as a file the browser saves, never from a link to the bucket. A file that carries
// a restricted class is an export the plain read refuses; it is listed as restricted and is not opened here.

/** The bytes of a chosen file, as base64 (imports-and-opening-data 9.3 "Evidence files"). */
export async function base64Of(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/** The accepted types: PDF, JPEG and PNG, checked again from the content by the server (9.2). */
export const EVIDENCE_ACCEPT = 'application/pdf,image/jpeg,image/png';

const MEDIA_TYPE: Readonly<Record<AttachedFile['format'], string>> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** A size in bytes as the screens write it (design-language 8). */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return t('evidence.size.bytes', { size: bytes });
  if (bytes < 1024 * 1024) return t('evidence.size.kb', { size: Math.round((bytes / 1024) * 10) / 10 });
  return t('evidence.size.mb', { size: Math.round((bytes / (1024 * 1024)) * 10) / 10 });
}

/**
 * Stores a chosen file, answering the evidence a command hands to its record (Store a file, imports 13.1), or
 * undefined when it was refused, with the refusal shown by `banner`.
 */
export function useStoreEvidence() {
  const storing = useSubmission('storeFile', []);
  return {
    state: storing.state,
    banner: storing.state.kind === 'refused' ? <RefusalBanner refusal={storing.state.refusal} /> : null,
    store: async (file: File): Promise<EvidenceFile | undefined> => {
      const stored = await storing.submit({
        body: { sourceSystem: 'manual-upload', originalName: file.name, contentBase64: await base64Of(file) },
      });
      return stored === undefined ? undefined : { storedFileId: stored.storedFileId, fileReceiptId: stored.receiptId };
    },
  };
}

/** The file input of an evidence picker (design-language 10.14, 10.15). */
export function EvidencePicker({
  id,
  label,
  onChange,
  resetKey,
}: {
  id: string;
  label: MessageId;
  onChange: (file: File | null) => void;
  /** Changing it clears the input, as after the file was added. */
  resetKey?: number;
}) {
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-body-sm font-semibold">{t(label)}</span>
      <input
        key={resetKey}
        id={id}
        type="file"
        accept={EVIDENCE_ACCEPT}
        className={inputClass}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
        }}
      />
      <span id={`${id}-help`} className="text-caption text-text-2">
        {t('evidence.picker.help')}
      </span>
    </label>
  );
}

/** One attached file: its name, type and size, and Open, which saves it from the app. */
function EvidenceItem({ attachmentId, number }: { attachmentId: string; number: number }) {
  const query = useQuery({
    queryKey: ['readAttachedFile', attachmentId],
    queryFn: async () => {
      const result = await api.call('readAttachedFile', { params: { attachmentId } });
      if (result.ok) return result.data;
      throw new ApiFailure(result.status, result.error);
    },
    retry: false,
  });
  const file = query.data;
  const url = useMemo(() => {
    if (file === undefined) return undefined;
    const bytes = Uint8Array.from(atob(file.contentBase64), (char) => char.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: MEDIA_TYPE[file.format] }));
  }, [file]);
  useEffect(
    () => () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    },
    [url],
  );
  const fallback = t('evidence.file', { number });
  if (query.isError) {
    const body = failureBody(query.error);
    const message: MessageId =
      body?.code === 'files-imports.restricted-file-is-an-export' ? 'evidence.restricted' : 'evidence.not-readable';
    return (
      <li className="flex flex-col gap-1 border-b border-border pb-2 last:border-b-0">
        <span className="font-semibold">{fallback}</span>
        <span className="text-body-sm text-text-2">{t(message)}</span>
      </li>
    );
  }
  if (file === undefined || url === undefined) {
    return <li className="text-body-sm text-text-2">{fallback}</li>;
  }
  const name = file.receipt.originalName;
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-all font-semibold">{name}</span>
        <span className="text-body-sm text-text-2">
          {t(`evidence.type.${file.format}`)} · {sizeText(file.sizeBytes)}
        </span>
      </span>
      <a
        href={url}
        download={name}
        className="inline-flex h-9 items-center rounded-control border border-control px-3 text-body-sm font-semibold hover:bg-hover"
        aria-label={t('evidence.open-named', { name })}
      >
        {t('evidence.open')}
      </a>
    </li>
  );
}

/** The files attached to a record as evidence, in the order they were attached. */
export function EvidenceList({ attachmentIds }: { attachmentIds: readonly string[] }) {
  if (attachmentIds.length === 0) return <p className="m-0 text-body-sm text-text-2">{t('evidence.none')}</p>;
  return (
    <ul aria-label={t('evidence.title')} className="m-0 flex list-none flex-col gap-2 p-0">
      {attachmentIds.map((attachmentId, index) => (
        <EvidenceItem key={attachmentId} attachmentId={attachmentId} number={index + 1} />
      ))}
    </ul>
  );
}

/** A picker and its chosen file, for a form that stores the file when it is sent. */
export function useChosenFile() {
  const [file, setFile] = useState<File | null>(null);
  const [resetKey, setResetKey] = useState(0);
  return {
    file,
    resetKey,
    choose: setFile,
    clear: () => {
      setFile(null);
      setResetKey((key) => key + 1);
    },
  };
}

import { parentPort } from 'node:worker_threads';

// The worker that inspects and reads one workbook under the caps at intake (imports-and-opening-data 9.3; DEC-112
// GC6-5; S1-F06-T02). Its heap is limited by the parent to the parser-memory cap, and the parent ends it at the
// processing-time cap (workbook-read.ts). It takes the bytes and the expanded-size and row caps, runs the safety
// checks, then the XLSX reader, and answers the grid or the refusal. It imports its two modules by the extension it
// runs with: `.js` once built, `.ts` when tests run the sources, which Node reads with their types stripped.

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
const safety = (await import(`../domain/workbook-safety${extension}`)) as typeof import('../domain/workbook-safety.js');
const reader = (await import(`./xlsx-reader${extension}`)) as typeof import('./xlsx-reader.js');

export interface WorkbookWorkerRequest {
  readonly bytes: Uint8Array;
  readonly maxExpandedBytes: number;
  readonly maxRows: number;
}

if (parentPort === null) throw new Error('The workbook worker runs only as a worker thread');
const port = parentPort;

port.once('message', (request: WorkbookWorkerRequest) => {
  void (async () => {
    const bytes = Buffer.from(request.bytes.buffer, request.bytes.byteOffset, request.bytes.byteLength);
    const inspected = safety.inspectWorkbook(bytes, { maxExpandedBytes: request.maxExpandedBytes });
    if (inspected.kind === 'refused') {
      port.postMessage(inspected);
      return;
    }
    const read = await reader.readXlsx(bytes, { maxRows: request.maxRows });
    if (read.kind === 'read') port.postMessage(read);
    else if (read.kind === 'too-many-rows') {
      port.postMessage({
        kind: 'refused',
        code: 'files-imports.over-intake-cap',
        missing: [{ kind: 'intake-cap', cap: 'rows', limit: String(request.maxRows) }],
      });
    } else {
      port.postMessage({
        kind: 'refused',
        code: 'files-imports.file-unreadable',
        missing: [{ kind: 'reader-error', error: 'workbook-not-read' }],
      });
    }
  })();
});

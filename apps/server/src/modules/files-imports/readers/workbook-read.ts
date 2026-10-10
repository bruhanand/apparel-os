import { Worker } from 'node:worker_threads';
import type { Grid } from '../domain/grid.js';
import type { IntakeCaps } from '../domain/intake-caps.js';
import type { WorkbookSafety } from '../domain/workbook-safety.js';
import type { WorkbookWorkerRequest } from './workbook-worker.js';

// Reading a workbook under the caps at intake (imports-and-opening-data 9.1, 9.3; DEC-112 GC6-5; PRD-SEC-011;
// S1-F06-T02). The safety checks and the XLSX reader run in a worker thread of their own whose heap is limited to the
// parser-memory cap; the worker is ended at the processing-time cap. A file over a cap is refused with the cap named,
// and nothing of it is kept: it is never truncated to fit. The same read serves intake, before anything is stored,
// and every later read of the stored file (Start an import, Detect a layout), so a cap holds wherever the file is read.

export type WorkbookRead =
  | { readonly kind: 'read'; readonly grid: Grid }
  | Extract<WorkbookSafety, { readonly kind: 'refused' }>;

function overCap(cap: 'parser-memory' | 'processing-time', limit: number): WorkbookRead {
  return {
    kind: 'refused',
    code: 'files-imports.over-intake-cap',
    missing: [{ kind: 'intake-cap', cap, limit: String(limit) }],
  };
}

const WORKER_FILE = new URL(`./workbook-worker${import.meta.url.endsWith('.ts') ? '.ts' : '.js'}`, import.meta.url);

/** Inspects and reads the workbook in its own worker under the caps; the first cap passed or check failed refuses. */
export function readWorkbook(bytes: Buffer, caps: IntakeCaps): Promise<WorkbookRead> {
  return new Promise<WorkbookRead>((resolve) => {
    let settled = false;
    const worker = new Worker(WORKER_FILE, {
      resourceLimits: { maxOldGenerationSizeMb: caps.maxParserMemoryMb },
      stdout: false,
      stderr: true,
    });
    // The worker's own warnings (such as Node's note that it strips types from sources in tests) are not logged.
    worker.stderr.resume();
    const settle = (answer: WorkbookRead) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(answer);
      void worker.terminate();
    };
    const timer = setTimeout(() => {
      settle(overCap('processing-time', caps.maxProcessingMs));
    }, caps.maxProcessingMs);
    worker.once('message', (answer: WorkbookRead) => {
      settle(answer);
    });
    worker.once('error', (error: Error & { code?: string }) => {
      if (error.code === 'ERR_WORKER_OUT_OF_MEMORY') settle(overCap('parser-memory', caps.maxParserMemoryMb));
      // Anything else the reader threw is a workbook it could not read; the error itself may quote the file.
      else settle({ kind: 'refused', code: 'files-imports.file-unreadable', missing: [{ kind: 'reader-error', error: 'workbook-not-read' }] });
    });
    worker.once('exit', () => {
      settle({ kind: 'refused', code: 'files-imports.file-unreadable', missing: [{ kind: 'reader-error', error: 'workbook-not-read' }] });
    });
    const request: WorkbookWorkerRequest = {
      bytes: new Uint8Array(bytes),
      maxExpandedBytes: caps.maxExpandedBytes,
      maxRows: caps.maxRows,
    };
    worker.postMessage(request);
  });
}

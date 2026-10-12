import { normalisedName, type ImportVersionState, type LayoutStructure } from '@apparel-os/schemas';
import type { Grid } from './grid.js';
import { compatibility } from './staging.js';

// Detecting a layout (imports-and-opening-data 6.5; PRD-IMP-004; S1-F06-T03): a version is compatible only when the
// file has its sheet, every required column at its header row and no column it does not know (A-4). A source hint,
// the supplier or brand the uploader names or a word in the file name, narrows the compatible versions to those it
// matches, where any does, and orders them; it never selects a version that is not compatible. One compatible version
// is proposed; with several the preparer chooses; with none the preparer proposes a new version. A Rejected version is
// never a candidate (6.4). Pure: no database.

export interface DetectableVersion {
  readonly layoutVersionId: string;
  readonly layoutCode: string;
  readonly source: string;
  readonly version: number;
  readonly state: ImportVersionState;
  readonly structure: LayoutStructure;
}

export interface Detection {
  readonly compatible: readonly {
    readonly layoutVersionId: string;
    readonly layoutCode: string;
    readonly version: number;
    readonly state: ImportVersionState;
    readonly matchesHint: boolean;
  }[];
  readonly proposed?: string;
  readonly incompatible: readonly {
    readonly layoutVersionId: string;
    readonly layoutCode: string;
    readonly version: number;
    readonly missing: readonly { readonly kind: string; readonly [field: string]: string }[];
  }[];
}

const words = (text: string) => normalisedName(text).toLowerCase();

/** Whether the hint names the layout: its code or source within the hint, or the hint within them. */
function matches(version: DetectableVersion, hint: string | undefined): boolean {
  if (hint === undefined || words(hint) === '') return false;
  const said = words(hint);
  return [version.layoutCode, version.source].some((name) => said.includes(words(name)) || words(name).includes(said));
}

export function detect(grid: Grid, versions: readonly DetectableVersion[], hint?: string): Detection {
  const compatible: Detection['compatible'][number][] = [];
  const incompatible: Detection['incompatible'][number][] = [];
  for (const version of versions) {
    if (version.state === 'Rejected') continue;
    const found = compatibility(grid, version.structure);
    const named = {
      layoutVersionId: version.layoutVersionId,
      layoutCode: version.layoutCode,
      version: version.version,
    };
    if ('kind' in found) incompatible.push({ ...named, missing: found.missing });
    else compatible.push({ ...named, state: version.state, matchesHint: matches(version, hint) });
  }
  const hinted = compatible.filter((each) => each.matchesHint);
  const candidates = hinted.length > 0 ? hinted : compatible;
  const [only] = candidates;
  return {
    compatible: candidates,
    ...(candidates.length === 1 && only !== undefined ? { proposed: only.layoutVersionId } : {}),
    incompatible,
  };
}

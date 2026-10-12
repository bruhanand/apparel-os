import { kernelRestoreParticipant, RestoreRegistry } from './kernel/index.js';
import { accessRestoreParticipant } from './modules/access/index.js';
import { auditRestoreParticipant } from './modules/audit/index.js';
import { configurationRestoreParticipant } from './modules/configuration/index.js';
import { eboImportsRestoreParticipant } from './modules/ebo-imports/index.js';
import { exceptionsRestoreParticipant } from './modules/exceptions/index.js';
import { booksRestoreParticipant } from './modules/finance/books/index.js';
import { taxRulesRestoreParticipant } from './modules/finance/tax-rules/index.js';
import { filesImportsRestoreParticipant } from './modules/files-imports/index.js';
import { inboxRestoreParticipant } from './modules/inbox/index.js';
import { catalogueRestoreParticipant } from './modules/merchandise/catalogue/index.js';
import { partiesRestoreParticipant } from './modules/merchandise/parties/index.js';
import { numberingRestoreParticipant } from './modules/numbering/index.js';
import { organisationRestoreParticipant } from './modules/organisation/index.js';
import { posRestoreParticipant } from './modules/pos/index.js';
import { siteLifecycleRestoreParticipant } from './modules/site-lifecycle/index.js';
import { stockLedgerRestoreParticipant } from './modules/stock/ledger/index.js';

// The restore participants of every module that holds records (backup-and-restore 10.1, 10.2; S1-F14-T02): each
// module defines its own and the composition registers them, as it registers numbered kinds (numbered-kinds.ts). The
// registry checks at start that no table has two owners; a test checks that every table of the Organisation set's
// register has one (restore-participants.test.ts). A module that starts holding records adds its participant here.
export const restoreRegistry = new RestoreRegistry([
  kernelRestoreParticipant,
  accessRestoreParticipant,
  auditRestoreParticipant,
  configurationRestoreParticipant,
  filesImportsRestoreParticipant,
  inboxRestoreParticipant,
  numberingRestoreParticipant,
  organisationRestoreParticipant,
  catalogueRestoreParticipant,
  partiesRestoreParticipant,
  exceptionsRestoreParticipant,
  booksRestoreParticipant,
  taxRulesRestoreParticipant,
  stockLedgerRestoreParticipant,
  posRestoreParticipant,
  eboImportsRestoreParticipant,
  siteLifecycleRestoreParticipant,
]);

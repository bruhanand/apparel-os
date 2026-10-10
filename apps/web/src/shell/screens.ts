import type { PermissionAction, PersonaId } from '@apparel-os/schemas';

// The screens of the back office built so far, their sidebar sections, and each persona's menu and home screen
// (ui-blueprint "Menus by persona"; personas.md section 2). A screen is granted by a permission of the person's role
// assignments, never by a persona (PRD-ACS-002, PRD-ACS-003). Screens of later stages join this list as they are built.

/** One effective grant: an action on a record type, from a role assignment in force (access-and-approvals 4.1, 5). */
export interface Grant {
  readonly recordType: string;
  readonly action: PermissionAction;
}

/**
 * What a screen needs. `none`: My work, which needs no permission (access-and-approvals 9.11, 11.2). `grant`: a
 * permission of a role assignment. The record type names are those of the permission registry
 * (`permissionRegistry` in `@apparel-os/schemas`; access-and-approvals 4.1, 9.11; RR-261), `configuration`'s
 * among them since S1-F04-T01 (RR-297).
 */
export type ScreenNeed = { readonly kind: 'none' } | { readonly kind: 'grant'; readonly grant: Grant };

export const sections = ['home', 'setup'] as const;
export type Section = (typeof sections)[number];

export interface Screen {
  readonly section: Section;
  /** The route path. */
  readonly path: string;
  readonly need: ScreenNeed;
}

const view = (recordType: string): ScreenNeed => ({ kind: 'grant', grant: { recordType, action: 'view' } });

/** Every screen of the shell, in sidebar order. */
export const screens = {
  'my-work': { section: 'home', path: '/my-work', need: { kind: 'none' } },
  'setup.users': { section: 'setup', path: '/setup/users', need: view('access.user') },
  'setup.roles': { section: 'setup', path: '/setup/roles', need: view('access.role') },
  'setup.role-assignments': {
    section: 'setup',
    path: '/setup/role-assignments',
    need: view('access.role_assignment'),
  },
  'setup.reason-codes': { section: 'setup', path: '/setup/reason-codes', need: view('access.approval_reason') },
  // Approval limits (access-and-approvals 9.2, 14; S1-F05-T01).
  'setup.approval-limits': {
    section: 'setup',
    path: '/setup/approval-limits',
    need: view('access.approval_limit'),
  },
  // The essential security settings (design-language 10.19; DEC-118, RR-334; S1-F01-T25).
  'setup.security-settings': {
    section: 'setup',
    path: '/setup/security-settings',
    need: view('access.setting'),
  },
  // The organisation structure (structure-and-masters 8; ui-blueprint Setup; S1-F02-T01).
  'setup.organisation-structure': {
    section: 'setup',
    path: '/setup/organisation-structure',
    need: view('organisation.site'),
  },
  'setup.geography': { section: 'setup', path: '/setup/geography', need: view('organisation.country') },
  // Vocabularies: brands, the category tree, size sets and the Organisation's attributes with their values and
  // proposals (structure-and-masters 4.2, 8; ui-blueprint Setup › Vocabularies; S1-F03-T01).
  'setup.vocabularies': {
    section: 'setup',
    path: '/setup/vocabularies',
    need: view('merchandise.vocabulary_value'),
  },
  // Products: styles, SKUs, barcodes and aliases, and product proposals; Merchandise tracking profiles: profiles, each
  // category's profile and packs (structure-and-masters 4, 8; ui-blueprint Setup; S1-F03-T02).
  'setup.products': { section: 'setup', path: '/setup/products', need: view('merchandise.sku') },
  'setup.merchandise-tracking-profiles': {
    section: 'setup',
    path: '/setup/merchandise-tracking-profiles',
    need: view('merchandise.tracking_profile'),
  },
  // Suppliers and agreements: parties with their roles and bank details, and brand–supplier links; Agreement: an
  // agreement's dated terms (structure-and-masters 5, 8; ui-blueprint Setup; S1-F03-T03).
  'setup.suppliers-and-agreements': {
    section: 'setup',
    path: '/setup/suppliers-and-agreements',
    need: view('merchandise.party'),
  },
  'setup.agreement': { section: 'setup', path: '/setup/agreement', need: view('merchandise.agreement') },
  // Exception rules: owner, due time and escalation per type and Site (access-and-approvals 12.2, 14; S1-F08-T02).
  'setup.exception-rules': {
    section: 'setup',
    path: '/setup/exception-rules',
    need: view('exceptions.exception_routing'),
  },
  'setup.audit-log': { section: 'setup', path: '/setup/audit-log', need: view('audit.audit_record') },
  // The operations view: failed jobs, later backup and recovery status (code-house-rules 12.9; S1-F08-T04, S1-F14).
  'setup.operations': { section: 'setup', path: '/setup/operations', need: view('kernel.job') },
  'setup.policy-readiness': {
    section: 'setup',
    path: '/setup/policy-readiness',
    need: view('configuration.policy_status'),
  },
  // Site opening and closure › Readiness (ui-blueprint Setup; module-map 4.16; S1-F04-T02).
  'setup.site-opening': {
    section: 'setup',
    path: '/setup/site-opening-and-closure',
    need: view('site_lifecycle.readiness_record'),
  },
} as const satisfies Record<string, Screen>;

export type ScreenId = keyof typeof screens;
export const screenIds = Object.keys(screens) as ScreenId[];

/**
 * Each persona's home screen ("Lands on") and menu, as far as the screens built so far reach. `home: null` where the
 * persona's home screen belongs to a later stage. The menu keeps the order of ui-blueprint "Menus by persona".
 */
export const personaMenus: Readonly<Record<PersonaId, { home: ScreenId | null; menu: readonly ScreenId[] }>> = {
  // The Owner's Setup is "Policy readiness · Approval limits · Approve changes" (ui-blueprint).
  'P-OWN': { home: 'my-work', menu: ['my-work', 'setup.policy-readiness', 'setup.approval-limits'] },
  'P-ADM': {
    home: 'setup.policy-readiness',
    menu: [
      'my-work',
      'setup.users',
      'setup.roles',
      'setup.role-assignments',
      'setup.reason-codes',
      'setup.approval-limits',
      'setup.security-settings',
      'setup.organisation-structure',
      'setup.geography',
      'setup.exception-rules',
      'setup.operations',
      'setup.policy-readiness',
    ],
  },
  // Accounts verifies business-unit mappings on Setup › Organisation structure, the synthetic journey's choice; who
  // holds the verify permission is KDPS's (POL-10.08, V-01; S1-F02-T02). My work is open to every person without a
  // menu entry, as the blueprint lists none for Accounts.
  'P-ACC': { home: null, menu: ['setup.organisation-structure'] },
  'P-CHA': { home: null, menu: [] },
  // Booking's Setup is "Products · Suppliers and agreements" (ui-blueprint); Products arrives with S1-F03-T02.
  'P-BKG': { home: null, menu: ['setup.products'] },
  // Operations' Setup is "Site opening and closure" (ui-blueprint; S1-F04-T02).
  'P-OPS': { home: 'my-work', menu: ['my-work', 'setup.site-opening'] },
  'P-WHS': { home: null, menu: ['my-work'] },
  'P-BRM': { home: null, menu: [] },
  'P-STM': { home: null, menu: ['my-work'] },
  'P-CSH': { home: null, menu: [] },
  'P-SLS': { home: null, menu: [] },
  'P-EBO': { home: null, menu: [] },
  'P-HRS': { home: null, menu: [] },
  'P-AUD': {
    home: 'setup.audit-log',
    menu: [
      'setup.users',
      'setup.roles',
      'setup.role-assignments',
      'setup.reason-codes',
      'setup.organisation-structure',
      'setup.geography',
      'setup.audit-log',
    ],
  },
};

/** Whether the person may open a screen: My work always; any other screen only through a grant. */
export function screenOpen(id: ScreenId, grants: readonly Grant[]): boolean {
  const need: ScreenNeed = screens[id].need;
  return need.kind === 'none' || grantedByRoles(need.grant, grants);
}

/** Whether a role assignment grants a screen: a screen that needs no permission is granted by no role. */
export function screenGrantedByRoles(id: ScreenId, grants: readonly Grant[]): boolean {
  const need: ScreenNeed = screens[id].need;
  return need.kind === 'grant' && grantedByRoles(need.grant, grants);
}

function grantedByRoles(needed: Grant, grants: readonly Grant[]): boolean {
  return grants.some((grant) => grant.recordType === needed.recordType && grant.action === needed.action);
}

/** The screens the person may open, in sidebar order: the sidebar lists only these (design-language 6 A). */
export function openScreens(grants: readonly Grant[]): ScreenId[] {
  return screenIds.filter((id) => screenOpen(id, grants));
}

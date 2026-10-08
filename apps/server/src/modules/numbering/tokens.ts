/** The token of the numbering module's interface (NumberingInterface). Inject it with @Inject(NUMBERING). */
export const NUMBERING = 'numbering.Numbering';

/**
 * The token of the kinds the owning modules number (numbering-and-audit 3.1), a list of NumberedKind the composition
 * root provides (module-map section 3, rule 6). While none is provided, no kind is declared and every series is refused.
 */
export const NUMBERED_KINDS = 'numbering.NumberedKinds';

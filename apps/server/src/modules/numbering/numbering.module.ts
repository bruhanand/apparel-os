import { Module } from '@nestjs/common';
import type { NumberedKind } from './domain/kinds.js';
import { Numbering } from './numbering.js';
import { NUMBERED_KINDS, NUMBERING } from './tokens.js';

/**
 * The numbering module (module-map 4.6; numbering-and-audit 3): tier 1, uses only `kernel`. Gapless number series for
 * the kinds the owning modules declare, which reach it from the composition root under NUMBERED_KINDS (module-map
 * section 3, rule 6).
 */
@Module({
  providers: [
    {
      provide: NUMBERING,
      useFactory: (kinds: readonly NumberedKind[] | undefined) => new Numbering({ kinds: kinds ?? [] }),
      inject: [{ token: NUMBERED_KINDS, optional: true }],
    },
  ],
  exports: [NUMBERING],
})
export class NumberingModule {}

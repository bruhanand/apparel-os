import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { StructureController } from './http/structure.controller.js';
import { Organisation } from './organisation.js';
import { ORGANISATION } from './tokens.js';

/**
 * The organisation module (module-map 4.11; structure-and-masters 3): tier 2, uses `access`, `audit` and `kernel`.
 * Geography, legal entities, tax registrations, accounting books, Sites, Stores and groupings, each change approved by
 * a different authorised person (S1-F02-T01). Its approval rules and decision effects reach `access` through the
 * composition root (organisationApprovals; access-and-approvals 9.8b).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule],
  controllers: [StructureController],
  providers: [
    {
      provide: ORGANISATION,
      useFactory: (audit: AuditInterface, access: AccessInterface) => new Organisation({ audit, access }),
      inject: [AUDIT, ACCESS],
    },
  ],
  exports: [ORGANISATION],
})
export class OrganisationModule {}

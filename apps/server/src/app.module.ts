import { Module } from '@nestjs/common';
import { CommandRunnerModule, IdempotencyModule, KernelModule, OrganisationRoutingModule } from './kernel/index.js';
import { CatalogueModule } from './modules/merchandise/catalogue/index.js';
import { PartiesModule } from './modules/merchandise/parties/index.js';
import { OrganisationModule } from './modules/organisation/index.js';

// House rule: every constructor injection names its token with @Inject(...), so nothing depends on decorator metadata.
@Module({
  imports: [
    KernelModule,
    OrganisationRoutingModule,
    CommandRunnerModule,
    IdempotencyModule,
    OrganisationModule,
    CatalogueModule,
    PartiesModule,
  ],
})
export class AppModule {}

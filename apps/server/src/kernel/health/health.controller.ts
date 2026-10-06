import { routes, type HealthResponse } from '@apparel-os/schemas';
import { Controller } from '@nestjs/common';
import { ApiRoute } from '../http/api-route.js';

/** The health check: a public read with no unit in its path (code-house-rules 12.1). */
@Controller()
export class HealthController {
  @ApiRoute(routes.health)
  get(): HealthResponse {
    return { status: 'ok' };
  }
}

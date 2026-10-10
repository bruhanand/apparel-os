import { originRefusal } from '../../src/modules/configuration/commands/policy-status.js';
import type { ConfigurationInterface } from '../../src/modules/configuration/index.js';

/**
 * Which origins of a value local work accepts, as `configuration` answers it where AOS_ENVIRONMENT is `local`, for a
 * test that builds `access` on its own (code-house-rules 12.14; S1-F04 review H2): synthetic values on a synthetic
 * Organisation and KDPS's anywhere; no test-setup value.
 */
export const localOrigins: Pick<ConfigurationInterface, 'originRefusal'> = {
  originRefusal: (context, origin) => originRefusal({ name: 'local' }, context, origin),
};

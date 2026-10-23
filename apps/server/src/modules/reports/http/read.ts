import { ApiRefusal, type CommandRunner, type ReadModelGateway } from '../../../kernel/index.js';
import type { AccessInterface, SignedInUser } from '../../access/index.js';
import { asReader, type Reading } from '../queries/reading.js';

// The read of a search or a report as a route runs it (code-house-rules 8.1, 12.1 "Reads", 12.3; goods-in 9.1;
// S2-F11-T01, S2-F11-T02): in a READ ONLY transaction as the signed-in user, on the business date, a refusal answered
// as the API answers it. One for every route of `reports`.

export function readAsUser<Answer>(
  services: { readonly runner: CommandRunner; readonly gateway: ReadModelGateway; readonly access: AccessInterface },
  user: SignedInUser,
  commandName: string,
  work: (reading: Reading) => Promise<Answer>,
): Promise<Answer> {
  return services.runner.read(
    {
      commandName,
      organisation: user.organisation,
      correlationId: user.correlationId,
      actor: { kind: 'actor', actorId: user.userId },
    },
    async (context) => {
      const read = await asReader(
        { gateway: services.gateway, access: services.access, context, actorId: user.userId },
        work,
      );
      if ('refused' in read) throw new ApiRefusal({ ...read.refused, missing: [...read.refused.missing] });
      return read.answer;
    },
  );
}

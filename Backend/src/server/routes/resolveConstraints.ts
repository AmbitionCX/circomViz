import { FastifyRequest, FastifyReply } from 'fastify';
import {
  parseSymFile,
  parseConstraintsFile,
  resolveConstraintsWithNames,
  type ResolvedConstraint,
} from '../../core/utils/symbolParser.js';
import { PathGuard } from '../../core/project/pathGuard.js';
import { logger } from '../../utils/logger.js';

interface resolve_constraints_request {
  symPath: string;
  constraintsJsonPath: string;
}

interface resolve_constraints_response {
  success: boolean;
  constraints: ResolvedConstraint[];
  signalCount: number;
  constraintCount: number;
  error?: string;
}

export async function resolveConstraintsHandler(
  request: FastifyRequest<{ Body: resolve_constraints_request }>,
  reply: FastifyReply
) {
  try {
    const { symPath, constraintsJsonPath } = request.body;

    if (!symPath || !constraintsJsonPath) {
      return reply.code(400).send({
        success: false,
        constraints: [],
        signalCount: 0,
        constraintCount: 0,
        error: 'symPath and constraintsJsonPath are required',
      });
    }

    const pathGuard = new PathGuard();
    const artifactValidation = pathGuard.validateGeneratedArtifactPaths(symPath, constraintsJsonPath);
    if (!artifactValidation.valid) {
      return reply.code(400).send({
        success: false,
        constraints: [],
        signalCount: 0,
        constraintCount: 0,
        error: artifactValidation.error,
      });
    }

    logger.info(`Resolving constraints: sym=${artifactValidation.symPath}, constraints=${artifactValidation.constraintsJsonPath}`);

    const symEntries = await parseSymFile(artifactValidation.symPath!);
    const constraints = await parseConstraintsFile(artifactValidation.constraintsJsonPath!);

    const resolved = resolveConstraintsWithNames(constraints, symEntries);

    const response: resolve_constraints_response = {
      success: true,
      constraints: resolved,
      signalCount: symEntries.length,
      constraintCount: constraints.length,
    };

    logger.info(`Resolved ${resolved.length} constraints with ${symEntries.length} signals`);

    reply.send(response);
  } catch (error: any) {
    logger.error(`Error resolving constraints: ${error.message}`);
    reply.code(500).send({
      success: false,
      constraints: [],
      signalCount: 0,
      constraintCount: 0,
      error: error.message,
    });
  }
}

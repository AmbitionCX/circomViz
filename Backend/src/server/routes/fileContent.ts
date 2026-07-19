import { FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PathGuard } from '../../core/project/pathGuard.js';
import { logger } from '../../utils/logger.js';

interface FileContentRequest {
  filePath: string;
}

export async function fileContentHandler(
  request: FastifyRequest<{ Body: FileContentRequest }>,
  reply: FastifyReply
) {
  try {
    const { filePath } = request.body;

    if (!filePath) {
      return reply.code(400).send({ success: false, error: 'filePath is required' });
    }

    const pathGuard = new PathGuard();
    const validated = pathGuard.validateSubmoduleFilePath(filePath);
    if (!validated.valid) {
      return reply.code(400).send({ success: false, error: validated.error });
    }

    const resolvedPath = validated.path!;
    const content = await fs.readFile(resolvedPath, 'utf-8');
    const baseName = path.basename(resolvedPath);

    reply.send({ success: true, content, fileName: baseName, filePath: resolvedPath });
  } catch (error: any) {
    logger.error(`Failed to read file: ${error.message}`);
    reply.code(500).send({ success: false, error: error.message });
  }
}

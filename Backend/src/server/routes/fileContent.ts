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
    const submodulesRoot = path.resolve(pathGuard.getSubmodulePath('', '')).replace(/\\/g, '/');

    const normalized = path.resolve(filePath).replace(/\\/g, '/');

    if (!normalized.includes('/submodules/')) {
      return reply.code(403).send({ success: false, error: 'Access denied: path outside submodules directory' });
    }

    if (!normalized.endsWith('.circom')) {
      return reply.code(400).send({ success: false, error: 'Only .circom files can be viewed' });
    }

    const content = await fs.readFile(normalized, 'utf-8');
    const baseName = path.basename(normalized);

    reply.send({ success: true, content, fileName: baseName, filePath: normalized });
  } catch (error: any) {
    logger.error(`Failed to read file: ${error.message}`);
    reply.code(500).send({ success: false, error: error.message });
  }
}

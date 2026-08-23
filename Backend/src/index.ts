import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

import { CircomParser as SubmoduleParser } from './core/parser/submoduleParser.js';
import { parseCircuitHandler } from './server/routes/parseCircuit.js';
import { readParseCompilationStatus } from './server/compilations/parseCompilation.js';
import { compileTemplateHandler } from './server/routes/compileTemplate.js';
import { findTemplateParamsHandler } from './server/routes/findTemplateParams.js';
import { generateWrapperHandler } from './server/routes/generateWrapper.js';
import { fileContentHandler } from './server/routes/fileContent.js';
import { generateContractHandler } from './server/routes/generateContract.js';
import { partialDebuggingAnalyzeHandler, partialDebuggingConstraintGraphHandler, partialDebuggingSliceHandler, partialDebuggingSourceGraphHandler } from './server/routes/partialDebugging.js';
import { Logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const frontendDist = path.join(repoRoot, 'Frontend/dist');
const logger = new Logger('Server');

const usesExpertStudyCatalog = (request: { query?: unknown }): boolean =>
  (request.query as { catalog?: string } | undefined)?.catalog === 'expert-study';

const server = fastify();
server.register(cors, {
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
});

if (fs.existsSync(frontendDist)) {
  server.register(fastifyStatic, {
    root: frontendDist,
    wildcard: false
  });
} else {
  server.get('/', (_, reply) => {
    return reply.code(404).send({
      error: 'Frontend build not found. Run cd Frontend && pnpm run build before serving the app from Backend.',
    });
  });
}

server.setErrorHandler((error, request, reply) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`${request.method} ${request.url} failed: ${message}`);
  reply.status(500).send({ error: message });
});

server.get('/submodules', (request, reply) => {
  const submodules = usesExpertStudyCatalog(request)
    ? SubmoduleParser.getAllExpertStudyRealWorldExamples()
    : SubmoduleParser.getAllSubmodules();
  reply.send({ submodules });
});

server.get('/submodules/:id', (request, reply) => {
  const { id } = request.params as { id: string };
  const submodule = usesExpertStudyCatalog(request)
    ? SubmoduleParser.getExpertStudyRealWorldExampleById(id)
    : SubmoduleParser.getSubmoduleById(id);

  if (!submodule) {
    return reply.code(404).send({ error: 'Submodule not found' });
  }

  reply.send({ submodule });
});

server.get('/examples', (request, reply) => {
  const examples = usesExpertStudyCatalog(request)
    ? SubmoduleParser.getAllExpertStudyToyExamples()
    : SubmoduleParser.getAllExamples();
  reply.send({ examples });
});

server.get('/examples/:id', (request, reply) => {
  const { id } = request.params as { id: string };
  const example = usesExpertStudyCatalog(request)
    ? SubmoduleParser.getExpertStudyToyExampleById(id)
    : SubmoduleParser.getExampleById(id);

  if (!example) {
    return reply.code(404).send({ error: 'Example not found' });
  }

  reply.send({ example });
});

// parse circuit to tree structure
server.post('/parse_circuit', parseCircuitHandler);
server.get('/parse_compilation/:compilationId', async (request, reply) => {
  const { compilationId } = request.params as { compilationId: string };
  const status = await readParseCompilationStatus(compilationId);
  if (!status) return reply.code(404).send({ error: 'Compilation status not found' });
  return reply.send(status);
});

// partial compile
server.post('/compile_template', compileTemplateHandler);

// find template parameter candidates
server.post('/find_template_params', findTemplateParamsHandler);

// generate wrapper and compile
server.post('/generate_wrapper', generateWrapperHandler);
server.get('/partial-debugging/builds/:buildId/source-graph', partialDebuggingSourceGraphHandler);
server.get('/partial-debugging/builds/:buildId/constraint-graph', partialDebuggingConstraintGraphHandler);
server.get('/partial-debugging/builds/:buildId/slice', partialDebuggingSliceHandler);
server.post('/partial-debugging/builds/:buildId/analyze', partialDebuggingAnalyzeHandler);

// file content viewer
server.post('/file_content', fileContentHandler);

// contract generation helper
server.post('/generate_contract', generateContractHandler);

server.listen({ port: 8080 }, (err, address) => {
  if (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
  logger.info(`Listening at ${address}`);
});

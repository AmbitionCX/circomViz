import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

import { CircomParser as SubmoduleParser } from './core/parser/submoduleParser.js';
import { parseCircuitHandler } from './server/routes/parseCircuit.js';
import { compileTemplateHandler } from './server/routes/compileTemplate.js';
import { findTemplateParamsHandler } from './server/routes/findTemplateParams.js';
import { generateWrapperHandler } from './server/routes/generateWrapper.js';
import { fileContentHandler } from './server/routes/fileContent.js';
import { generateContractHandler } from './server/routes/generateContract.js';
import { partialDebuggingConstraintGraphHandler, partialDebuggingSliceHandler, partialDebuggingSourceGraphHandler } from './server/routes/partialDebugging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const frontendDist = path.join(repoRoot, 'Frontend/dist');

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

server.setErrorHandler((error, _, reply) => {
  reply.status(500).send({ error: error });
});

server.get('/submodules', (_, reply) => {
  const submodules = SubmoduleParser.getAllSubmodules();
  reply.send({ submodules });
});

server.get('/submodules/:id', (request, reply) => {
  const { id } = request.params as { id: string };
  const submodule = SubmoduleParser.getSubmoduleById(id);

  if (!submodule) {
    return reply.code(404).send({ error: 'Submodule not found' });
  }

  reply.send({ submodule });
});

server.get('/examples', (_, reply) => {
  const examples = SubmoduleParser.getAllExamples();
  reply.send({ examples });
});

server.get('/examples/:id', (request, reply) => {
  const { id } = request.params as { id: string };
  const example = SubmoduleParser.getExampleById(id);

  if (!example) {
    return reply.code(404).send({ error: 'Example not found' });
  }

  reply.send({ example });
});

// parse circuit to tree structure
server.post('/parse_circuit', parseCircuitHandler);

// partial compile
server.post('/compile_template', compileTemplateHandler);

// find template parameter candidates
server.post('/find_template_params', findTemplateParamsHandler);

// generate wrapper and compile
server.post('/generate_wrapper', generateWrapperHandler);
server.get('/partial-debugging/builds/:buildId/source-graph', partialDebuggingSourceGraphHandler);
server.get('/partial-debugging/builds/:buildId/constraint-graph', partialDebuggingConstraintGraphHandler);
server.get('/partial-debugging/builds/:buildId/slice', partialDebuggingSliceHandler);

// file content viewer
server.post('/file_content', fileContentHandler);

// contract generation helper
server.post('/generate_contract', generateContractHandler);

server.listen({ port: 8080 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});

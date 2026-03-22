import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { saveCode } from './scripts/compilation.js';
import { CircomParser as SubmoduleParser } from './core/parser/submoduleParser.js';
import { parseCircuitHandler } from './server/routes/parseCircuit.js';
import { compileTemplateHandler } from './server/routes/compileTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = fastify();
server.register(cors, {
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
});

server.register(fastifyStatic, {
  root: path.join(__dirname, '../Frontend/dist'),
  wildcard: false
});

server.setErrorHandler((error, _, reply) => {
  reply.status(500).send({ error: error });
});

server.get('/', (_, reply) => {
  reply.sendFile(path.join(__dirname, '../Frontend/dist/index.html'));
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

// parse circuit to tree structure
server.post('/parse_circuit', parseCircuitHandler);

// partial compile
server.post('/compile_template', compileTemplateHandler);

server.listen({ port: 8080 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
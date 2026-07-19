import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

import { saveCode } from './scripts/compilation.js';
import { CircomParser as SubmoduleParser } from './core/parser/submoduleParser.js';
import { parseCircuitHandler } from './server/routes/parseCircuit.js';
import { compileTemplateHandler } from './server/routes/compileTemplate.js';
import { findTemplateParamsHandler } from './server/routes/findTemplateParams.js';
import { generateWrapperHandler } from './server/routes/generateWrapper.js';
import { staticAnalysisHandler } from './server/routes/staticAnalysis.js';
import { soundnessCheckHandler } from './server/routes/soundnessCheck.js';
import { fileContentHandler } from './server/routes/fileContent.js';
import { resolveConstraintsHandler } from './server/routes/resolveConstraints.js';
import { intentAlignmentHandler } from './server/routes/intentAlignment.js';
import { formalConformanceHandler } from './server/routes/formalConformance.js';
import { buildConstraintIndexHandler } from './server/routes/buildConstraintIndex.js';
import { coneSliceHandler } from './server/routes/coneSlice.js';
import { bipartiteGraphHandler } from './server/routes/bipartiteGraph.js';
import { generateContractHandler } from './server/routes/generateContract.js';
import { contractVerifyHandler } from './server/routes/contractVerify.js';
import { refinementExpandHandler } from './server/routes/refinementExpand.js';
import { sliceCandidatesHandler } from './server/routes/sliceCandidates.js';
import { constraintTreesHandler } from './server/routes/constraintTrees.js';
import { aiAdviceHandler } from './server/routes/aiAdvice.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const frontendDist = path.join(repoRoot, 'Frontend/dist');
const frontendIndex = path.join(frontendDist, 'index.html');

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

// static analysis
server.post('/static_analysis', staticAnalysisHandler);

// soundness check (cvc5)
server.post('/soundness_check', soundnessCheckHandler);

// file content viewer
server.post('/file_content', fileContentHandler);

// resolve constraints to human-readable formulas
server.post('/resolve_constraints', resolveConstraintsHandler);

// intent alignment (LLM analysis)
server.post('/intent_alignment', intentAlignmentHandler);

server.post('/formal_conformance', formalConformanceHandler);

// constraint index builder
server.post('/build_constraint_index', buildConstraintIndexHandler);

// cone of influence slicing
server.post('/cone_slice', coneSliceHandler);

// bipartite graph data for visualization
server.post('/bipartite_graph', bipartiteGraphHandler);

// contract generation
server.post('/generate_contract', generateContractHandler);

// contract-based verification
server.post('/contract_verify', contractVerifyHandler);

// refinement expansion
server.post('/refinement_expand', refinementExpandHandler);

// slice candidates for auto-slicing
server.post('/slice_candidates', sliceCandidatesHandler);

// constraint tree structure
server.post('/constraint_trees', constraintTreesHandler);

// AI advice for verification violations
server.post('/ai_advice', aiAdviceHandler);

server.listen({ port: 8080 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
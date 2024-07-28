import fastify from 'fastify';
import cors from '@fastify/cors';

const server = fastify();
server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
});

server.post('/parse-circom', async (request, reply) => {
    const { code } = request.body as { code: string };
    try {
        const circuitData = parseCircomCode(code);
        reply.send(circuitData);
    } catch (error) {
        const err = error as Error;
        reply.status(400).send({ error: 'Failed to parse Circom code', details: err.message });
    }
});

server.listen({ port: 8080 }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server listening at ${address}`);
});

function parseCircomCode(code: string) {
    const signals = extractSignals(code);
    const components = extractComponents(code);
    const connections = extractConnections(code);
    return { signals, components, connections };
}

function extractSignals(code: string): string[] {
    const signalRegex = /signal\s+\w+\s+(\w+);/g;
    const signals: string[] = [];
    let match;
    while ((match = signalRegex.exec(code)) !== null) {
        signals.push(match[1]);
    }
    return signals;
}

function extractComponents(code: string): any[] {
    const componentRegex = /component\s+(\w+)\s*=\s*(\w+)\((.*?)\);/g;
    const components: any[] = [];
    let match;
    while ((match = componentRegex.exec(code)) !== null) {
        const inputs = match[3].split(',').map(input => input.trim());
        components.push({ name: match[1], type: match[2], inputs });
    }
    return components;
}

function extractConnections(code: string): any[] {
    const connectionRegex = /(\w+)\s*->\s*(\w+);/g;
    const connections: any[] = [];
    let match;
    while ((match = connectionRegex.exec(code)) !== null) {
        connections.push({ from: match[1], to: match[2] });
    }
    return connections;
}

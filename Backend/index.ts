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
        
        reply.send("Hello");
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
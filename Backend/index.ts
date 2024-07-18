import fastify from 'fastify'
import cors from '@fastify/cors'

const server = fastify()
server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
})

server.get('/', async () => {
    return 'Hello World'
})

server.listen({ port: 8080 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(`Server listening at ${address}`)
})
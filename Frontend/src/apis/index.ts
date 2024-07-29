import request from './request'

enum API {
    generate_circuit = '/generateCircuit',
}

// --------- generate_circuit ---------
interface generate_circuit_request {
    code: string
}

interface generate_circuit_response {
    data: string
}

export const generate_circuit = (data: generate_circuit_request) =>
    request.post<any, generate_circuit_response>(API.generate_circuit, data, {
        headers: {
            'Access-Control-Allow-Origin': '*'
        },
    })

// ---------  ---------
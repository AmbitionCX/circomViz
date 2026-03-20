import request from './request';
import type { SubmoduleInfo } from '@/types/parseTypes.js';
import type { ParseCircuitResponse } from '@/types/circuitTypes.js';

const enum API {
  parse_circuit = '/parse_circuit',
  submodules = '/submodules'
}

export interface getSubmodules_response {
  submodules: SubmoduleInfo[];
}

export interface getSubmoduleById_response {
  submodule: SubmoduleInfo;
}

export interface parse_circuit_request {
  repo: string;
  entry: string;
  rootComponent?: string;
}

export const getSubmodules = () =>
  request.get<getSubmodules_response>(API.submodules);

export const getSubmoduleById = (id: string) =>
  request.get<getSubmoduleById_response>(`${API.submodules}/${id}`);

export const parseCircuitRequest = (data: parse_circuit_request) =>
  request.post<any, ParseCircuitResponse>(API.parse_circuit, data, {
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
  })

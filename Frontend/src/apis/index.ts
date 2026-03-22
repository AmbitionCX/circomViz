import request from './request';
import type { SubmoduleInfo } from '@/types/parseTypes.js';
import type { ParseCircuitResponse } from '@/types/circuitTypes.js';

const enum API {
  parse_circuit = '/parse_circuit',
  submodules = '/submodules',
  compile_template = '/compile_template'
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

export interface compile_template_request {
  repo: string;
  entry: string;
  templatePath: string[];
  templateName: string;
}

export interface compile_template_response {
  success: boolean;
  constraints: string[];
  signals: Record<string, string>;
  substitutions: Record<string, Record<string, string>>;
  stats: {
    constraintCount: number;
    signalCount: number;
    substitutionCount: number;
    executionTimeMs: number;
  };
  error?: string;
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

export const compileTemplate = (data: compile_template_request) =>
  request.post<any, compile_template_response>(API.compile_template, data, {
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
  })

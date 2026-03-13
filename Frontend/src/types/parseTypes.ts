import request from '@/apis/request.js';

export type SubmoduleInfo = {
  id: string;
  name: string;
  entry: string;
  rootComponent: string;
  description: string;
};

// Submodules API
export interface getSubmodules_response {
  submodules: SubmoduleInfo[];
}

export interface getSubmoduleById_response {
  submodule: SubmoduleInfo;
}

export const getSubmodules = () =>
  request.get<getSubmodules_response>('/submodules');

export const getSubmoduleById = (id: string) =>
  request.get<getSubmoduleById_response>(`/submodules/${id}`);

// 现有的 parse_circuit API（保持兼容）
export interface parse_circuit_request {
  code: string;
}

export interface parse_circuit_response {
  repo: string;
  entry: string;
  files: FileSummary[];
  tree: any;
  errors: ParseMessage[];
  statistics: {
    totalFiles: number;
    totalTemplates: number;
    totalInstances: number;
    maxDepth: number;
  };
}

export interface FileSummary {
  id: string;
  path: string;
  includes: string[];
}

export interface ParseMessage {
  level: 'warning' | 'error';
  file?: string;
  message: string;
}

export const parseCircuit = (data: parse_circuit_request) =>
  request.post<any, parse_circuit_response>('/parse_circuit', data, {
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
  })

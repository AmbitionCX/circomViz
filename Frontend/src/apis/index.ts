import request from './request';
import type { SubmoduleInfo } from '@/types/parseTypes.js';
import type { ParseCircuitResponse, FindTemplateParamsResponse, SoundnessCheckResponse } from '@/types/circuitTypes.js';

const enum API {
  parse_circuit = '/parse_circuit',
  submodules = '/submodules',
  compile_template = '/compile_template',
  find_template_params = '/find_template_params',
  generate_wrapper = '/generate_wrapper',
  static_analysis = '/static_analysis',
  soundness_check = '/soundness_check'
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

export interface find_template_params_request {
  templateName: string;
  repo: string;
  entry: string;
}

export const findTemplateParams = (data: find_template_params_request) =>
  request.post<any, FindTemplateParamsResponse>(API.find_template_params, data, {
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
  })

export interface generate_wrapper_request {
  templateName: string;
  params: { name: string; value: number }[];
  publicParams: string[];
  publicSignals: string[];
  repo: string;
  entry: string;
  templatePath: string[];
}

export interface generate_wrapper_response {
  success: boolean;
  wrapperCode: string;
  debugOutput?: string;
  optimizedOutput?: string;
  witnessOutput?: string;
  symPath?: string;
  constraintsJsonPath?: string;
  error?: string;
}

export const generateWrapper = (data: generate_wrapper_request) =>
  request.post<any, generate_wrapper_response>(API.generate_wrapper, data, {
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
  })

export interface static_analysis_request {
  repo: string;
  entry: string;
  symPath: string;
  constraintsJsonPath: string;
}

export interface static_analysis_response {
  success: boolean;
  findings: Array<{
    severity: 'high' | 'medium' | 'low';
    type: string;
    message: string;
    file?: string;
    line?: number;
  }>;
  error?: string;
}

export const staticAnalysis = (data: static_analysis_request) =>
  request.post<any, static_analysis_response>(API.static_analysis, data, {
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
  })

export interface soundness_check_request {
  repo: string;
  entry: string;
  symPath: string;
  constraintsJsonPath: string;
  queries: {
    satisfiability?: boolean;
    determinism?: boolean;
    coverage?: {
      signalNames: string[];
      fixedInputs?: Record<string, string | number>;
    };
  };
}

export const soundnessCheck = (data: soundness_check_request) =>
  request.post<any, SoundnessCheckResponse>(API.soundness_check, data, {
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
  })

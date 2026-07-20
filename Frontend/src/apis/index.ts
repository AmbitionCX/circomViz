import request from './request';
import type { SubmoduleInfo } from '@/types/parseTypes.js';
import type { ParseCircuitResponse, FindTemplateParamsResponse, HumanReadableConstraint } from '@/types/circuitTypes.js';

const enum API {
  parse_circuit = '/parse_circuit',
  submodules = '/submodules',
  examples = '/examples',
  compile_template = '/compile_template',
  find_template_params = '/find_template_params',
  generate_wrapper = '/generate_wrapper',
  file_content = '/file_content',
}

export interface getSubmodules_response {
  submodules: SubmoduleInfo[];
}

export interface getSubmoduleById_response {
  submodule: SubmoduleInfo;
}

export interface getExamples_response {
  examples: SubmoduleInfo[];
}

export interface getExampleById_response {
  example: SubmoduleInfo;
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

export const getExamples = () =>
  request.get<getExamples_response>(API.examples);

export const getExampleById = (id: string) =>
  request.get<getExampleById_response>(`${API.examples}/${id}`);

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

export interface AbstractValidatorWarning {
  templateName: string;
  instance: string;
  reason: string;
}

export interface generate_wrapper_request {
  templateName: string;
  params: { name: string; value: number }[];
  publicParams: string[];
  publicSignals: string[];
  repo: string;
  entry: string;
  templatePath: string[];
  confirmedTemplateNames?: string[];
  mode?: 'full' | 'interface-mock';
}

export interface generate_wrapper_response {
  success: boolean;
  wrapperCode: string;
  debugOutput?: string;
  optimizedOutput?: string;
  witnessOutput?: string;
  debugSuccess?: boolean;
  optimizedSuccess?: boolean;
  witnessSuccess?: boolean;
  symPath?: string;
  constraintsJsonPath?: string;
  r1csConstraints?: HumanReadableConstraint[];
  r1csEquationText?: string;
  error?: string;
  abstractCompile?: boolean;
  mockedChildren?: string[];
  unmockedChildren?: string[];
  validatorWarnings?: AbstractValidatorWarning[];
  boundaryInputs?: Array<{ instance: string; signal: string; isArray: boolean }>;
}

export const generateWrapper = (data: generate_wrapper_request) =>
  request.post<any, generate_wrapper_response>(API.generate_wrapper, data, {
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
  })

export interface FileContentResponse {
  success: boolean;
  content?: string;
  fileName?: string;
  filePath?: string;
  error?: string;
}

export const getFileContent = (data: { filePath: string }) =>
  request.post<any, FileContentResponse>(API.file_content, data)

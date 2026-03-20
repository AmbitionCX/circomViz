export type SubmoduleInfo = {
  id: string;
  name: string;
  entry: string;
  rootComponent: string;
  description: string;
};

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

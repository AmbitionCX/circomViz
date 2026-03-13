export interface parse_circuit_request {
  repo: string;
  entry: string;
  rootComponent?: string;
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

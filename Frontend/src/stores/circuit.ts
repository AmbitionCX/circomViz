import { defineStore } from 'pinia';

import { SymbolObject, ConstraintObject, QAPData, QAPNode, QAPLink } from '@/types/circuitTypes';

interface CircuitState {
  circomCode: string;
  compilationId: string;
  symbols: SymbolObject[];
  constraints: ConstraintObject[];
  substitutions: Record<string, any>;
  selectedSignals: any[];
  code: string;
  qapData: {
    numVars: number;
    numConstraints: number;
    qapPolysA: any[];
    qapPolysB: any[];
    qapPolysC: any[];
    zPoly: any[];
    evaluationPoints: any[];
  };
  nodes_list: QAPNode[];
  links_list: QAPLink[];
  componentNameColorMap: Record<string, string>;
  componentIdColorMap: Record<number, string>;
  selectedElements: Set<string>;
  templateTree: any;
  parseFiles: any[];
  parseErrors: any[];
}

export const useCircuitStore = defineStore('circuit', {
  state: (): CircuitState => ({
    circomCode: '',
    compilationId: '',
    symbols: [],
    constraints: [],
    substitutions: {},
    selectedSignals: [],
    code: '',
    qapData: {
      numVars: 0,
      numConstraints: 0,
      qapPolysA: [],
      qapPolysB: [],
      qapPolysC: [],
      zPoly: [],
      evaluationPoints: []
    },
    nodes_list: [],
    links_list: [],
    componentNameColorMap: {},
    componentIdColorMap: {},
    selectedElements: new Set<string>(),
    templateTree: null,
    parseFiles: [],
    parseErrors: []
  }),
  getters: {
    isCodeEmpty(): boolean {
      return this.code === '';
    },
  },
  actions: {
    setCompilationId(id: string) {
      this.compilationId = id;
    },
    setSymbols(symbol: any[]) {
      this.symbols = symbol;
    },
    setConstraints(constraint: any[]) {
      this.constraints = constraint;
    },
    setSubstitutions(substitution: {}) {
      this.substitutions = substitution;
    },
    pushSignal(signal: any) {
      if (!this.selectedSignals.some(s => s.symbol_id === signal.symbol_id)) {
        this.selectedSignals.push(signal);
      }
    },
    popSignal(signal: any) {
      this.selectedSignals = this.selectedSignals.filter(s => s.symbol_id !== signal.symbol_id);
    },
    resetCompilationId() {
      this.compilationId = '';
    },
    setCode(newCode: string) {
      this.code = newCode;
    },
    setQAPData(qapData: QAPData) {
      this.qapData = qapData;
    },
    setNodesList(nodes_list: QAPNode[]) {
      this.nodes_list = nodes_list;
    },
    setLinksList(links_list: QAPLink[]) {
      this.links_list = links_list;
    },
    setComponentNameColors(colorMap: Record<string, string>) {
      this.componentNameColorMap = colorMap;
    },
    setComponentIdColors(colorMap: Record<string, string>) {
      this.componentIdColorMap = colorMap;
    },
    setTemplateTree(tree: any) {
      this.templateTree = tree;
    },
    setParseFiles(files: any[]) {
      this.parseFiles = files;
    },
    setParseErrors(errors: any[]) {
      this.parseErrors = errors;
    }
  }
});

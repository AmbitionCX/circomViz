import { defineStore } from 'pinia';
import * as d3 from 'd3';
import type {
  TemplateInfo,
  SignalInfo,
  FileSummary,
  ParseError,
  CircuitStatistics,
  CompilationConstraints,
  ConstraintVerification,
  IndexMetadata,
  SliceResult,
  BipartiteGraphResponse,
  TemplateContract,
  ContractVerifyResult
} from '@/types/circuitTypes';
import { extractNodeModulesLibrary } from '@/utils/templateTree';

interface CircuitState {
  parseData: {
    repo: string;
    entry: string;
    files: FileSummary[];
    tree: TemplateInfo | null;
    errors: ParseError[];
    statistics: CircuitStatistics;
  };

  selectedTemplate: TemplateInfo | null;
  selectedTemplatePath: string[];

  templateColorMap: Record<string, string>;
  
  compilationVersion: number;
  confirmedTemplateNames: string[];
  compilationData: {
    isCompiling: boolean;
    debugOutput: string | null;
    optimizedOutput: string | null;
    witnessOutput: string | null;
    debugStatus: 'success' | 'failure' | null;
    optimizedStatus: 'success' | 'failure' | null;
    witnessStatus: 'success' | 'failure' | null;
    symPath: string | null;
    constraintsJsonPath: string | null;
    constraints: CompilationConstraints | null;
    verifications: ConstraintVerification[];
    staticAnalysisFindings: Array<{
      severity: 'high' | 'medium' | 'low';
      type: string;
      message: string;
      file?: string;
      line?: number;
    }>;
    error: string | null;
    abstractCompile: boolean;
    mockedChildren: string[];
    unmockedChildren: string[];
    validatorWarnings: Array<{ templateName: string; instance: string; reason: string }>;
    boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }>;
  };
  
  signalFilter: {
    selectedSignals: Set<string>;
    filterByType: 'input' | 'output' | 'intermediate' | 'all';
    searchTerm: string;
  };

  constraintIndex: {
    metadata: IndexMetadata | null;
    loading: boolean;
  };

  sliceData: {
    currentSlice: SliceResult | null;
    loading: boolean;
  };

  bipartiteData: {
    graph: BipartiteGraphResponse | null;
    loading: boolean;
    expandedComponent: string | null;
    highlightedSignals: Set<number>;
    highlightedConstraints: Set<number>;
  };

  contracts: {
    cache: Record<string, TemplateContract>;
    verificationResults: Record<string, ContractVerifyResult>;
    generating: boolean;
    verifying: boolean;
  };

  fileHighlight: {
    filePaths: string[];
    version: number;
  } | null;

  activeLeftPanel: 'signal' | 'submodule';
}

export const useCircuitStore = defineStore('circuit', {
  state: (): CircuitState => ({
    parseData: {
      repo: '',
      entry: '',
      files: [],
      tree: null,
      errors: [],
      statistics: {
        totalFiles: 0,
        totalTemplates: 0,
        totalInstances: 0,
        maxDepth: 0
      }
    },
    
    selectedTemplate: null,
    selectedTemplatePath: [],
    templateColorMap: {},
    
    compilationVersion: 0,
    confirmedTemplateNames: [],
    compilationData: {
      isCompiling: false,
      debugOutput: null,
      optimizedOutput: null,
      witnessOutput: null,
      debugStatus: null,
      optimizedStatus: null,
      witnessStatus: null,
      symPath: null,
      constraintsJsonPath: null,
      constraints: null,
      verifications: [],
      staticAnalysisFindings: [],
      error: null,
      abstractCompile: false,
      mockedChildren: [],
      unmockedChildren: [],
      validatorWarnings: [],
      boundaryInputs: []
    },
    
    signalFilter: {
      selectedSignals: new Set<string>(),
      filterByType: 'all',
      searchTerm: ''
    },
    constraintIndex: {
      metadata: null,
      loading: false
    },
    sliceData: {
      currentSlice: null,
      loading: false
    },
    bipartiteData: {
      graph: null,
      loading: false,
      expandedComponent: null,
      highlightedSignals: new Set<number>(),
      highlightedConstraints: new Set<number>()
    },
    contracts: {
      cache: {},
      verificationResults: {},
      generating: false,
      verifying: false
    },
    fileHighlight: null,
    activeLeftPanel: 'submodule' as 'signal' | 'submodule',
  }),
  
  getters: {
    isParsed(): boolean {
      return this.parseData.tree !== null;
    },
    
    filteredSignals(): SignalInfo[] {
      if (!this.parseData.tree) return [];
      let signals: SignalInfo[] = [];
      
      const extractSignals = (template: TemplateInfo) => {
        signals = signals.concat(template.signals);
        template.components.forEach(comp => {
          if (comp.template) {
            extractSignals(comp.template);
          }
        });
      };
      
      extractSignals(this.parseData.tree);
      
      if (this.signalFilter.filterByType !== 'all') {
        signals = signals.filter((s: SignalInfo) => s.kind === this.signalFilter.filterByType);
      }
      
      if (this.signalFilter.searchTerm) {
        const term = this.signalFilter.searchTerm.toLowerCase();
        signals = signals.filter((s: SignalInfo) => s.name.toLowerCase().includes(term));
      }
      
      return signals;
    },
    
    templateHierarchy(): TemplateInfo[] {
      if (!this.selectedTemplate) return [];
      
      const hierarchy: TemplateInfo[] = [];
      
      const buildHierarchy = (template: TemplateInfo) => {
        hierarchy.push(template);
        template.components.forEach(comp => {
          if (comp.template) {
            buildHierarchy(comp.template);
          }
        });
      };
      
      buildHierarchy(this.selectedTemplate);
      return hierarchy;
    }
  },
  
  actions: {
    setParseData(data: CircuitState['parseData']) {
      this.parseData = data;
      this.templateColorMap = {};
      if (data.tree) {
        this.rebuildTemplateColorMap(data.tree);
      }
    },

    resetParseData() {
      this.parseData = {
        repo: '',
        entry: '',
        files: [],
        tree: null,
        errors: [],
        statistics: {
          totalFiles: 0,
          totalTemplates: 0,
          totalInstances: 0,
          maxDepth: 0
        }
      };
      this.selectedTemplate = null;
      this.selectedTemplatePath = [];
      this.templateColorMap = {};
    },
    
    setSelectedTemplate(template: TemplateInfo, path: string[]) {
      this.selectedTemplate = template;
      this.selectedTemplatePath = path;
    },
    
    clearSelectedTemplate() {
      this.selectedTemplate = null;
      this.selectedTemplatePath = [];
    },
    
    setSignalFilter(filter: Partial<CircuitState['signalFilter']>) {
      this.signalFilter = { ...this.signalFilter, ...filter };
    },
    
    toggleSignalSelection(signalName: string) {
      if (this.signalFilter.selectedSignals.has(signalName)) {
        this.signalFilter.selectedSignals.delete(signalName);
      } else {
        this.signalFilter.selectedSignals.add(signalName);
      }
    },
    
    clearSignalSelection() {
      this.signalFilter.selectedSignals.clear();
    },
    
    setCompiling(isCompiling: boolean) {
      this.compilationData.isCompiling = isCompiling;
    },
    
    setCompilationResult(constraints: CompilationConstraints) {
      this.compilationData.constraints = constraints;
    },
    
    setVerification(verifications: ConstraintVerification[]) {
      this.compilationData.verifications = verifications;
    },
    
    setCompilationError(error: string | null) {
      this.compilationData.error = error;
    },

    bumpCompilationVersion() {
      this.compilationVersion++;
    },

    setDebugOutput(output: string | null) {
      this.compilationData.debugOutput = output;
    },

    setOptimizedOutput(output: string | null) {
      this.compilationData.optimizedOutput = output;
    },

    setWitnessOutput(output: string | null) {
      this.compilationData.witnessOutput = output;
    },

    setDebugStatus(status: 'success' | 'failure' | null) {
      this.compilationData.debugStatus = status;
    },

    setOptimizedStatus(status: 'success' | 'failure' | null) {
      this.compilationData.optimizedStatus = status;
    },

    setWitnessStatus(status: 'success' | 'failure' | null) {
      this.compilationData.witnessStatus = status;
    },
    
    setSymPath(path: string | null) {
      this.compilationData.symPath = path;
    },
    
    setConstraintsJsonPath(path: string | null) {
      this.compilationData.constraintsJsonPath = path;
    },
    
    setStaticAnalysisFindings(findings: Array<{
      severity: 'high' | 'medium' | 'low';
      type: string;
      message: string;
      file?: string;
      line?: number;
    }>) {
      this.compilationData.staticAnalysisFindings = findings;
    },

    setAbstractCompileMeta(meta: {
      abstractCompile: boolean;
      mockedChildren?: string[];
      unmockedChildren?: string[];
      validatorWarnings?: Array<{ templateName: string; instance: string; reason: string }>;
      boundaryInputs?: Array<{ instance: string; signal: string; isArray: boolean }>;
    }) {
      this.compilationData.abstractCompile = meta.abstractCompile;
      this.compilationData.mockedChildren = meta.mockedChildren ?? [];
      this.compilationData.unmockedChildren = meta.unmockedChildren ?? [];
      this.compilationData.validatorWarnings = meta.validatorWarnings ?? [];
      this.compilationData.boundaryInputs = meta.boundaryInputs ?? [];
    },
    
    resetCompilationData() {
      this.compilationVersion++;
      this.confirmedTemplateNames = [];
      this.compilationData = {
        isCompiling: false,
        debugOutput: null,
        optimizedOutput: null,
        witnessOutput: null,
        debugStatus: null,
        optimizedStatus: null,
        witnessStatus: null,
        symPath: null,
        constraintsJsonPath: null,
        constraints: null,
        verifications: [],
        staticAnalysisFindings: [],
        error: null,
        abstractCompile: false,
        mockedChildren: [],
        unmockedChildren: [],
        validatorWarnings: [],
        boundaryInputs: []
      };
    },

    autoConfirmNodeModulesTemplates() {
      if (!this.parseData.tree) return;
      const names = new Set<string>();
      const walk = (t: TemplateInfo) => {
        if (extractNodeModulesLibrary(t.sourceFile)) {
          names.add(t.templateName);
        }
        if (t.components) {
          for (const comp of t.components) {
            if (comp.template) walk(comp.template);
          }
        }
      };
      walk(this.parseData.tree);
      this.confirmedTemplateNames = [...new Set([...this.confirmedTemplateNames, ...names])];
    },

    flattenSignals(template: TemplateInfo): SignalInfo[] {
      let signals: SignalInfo[] = [...template.signals];
      
      for (const component of template.components) {
        if (component.template) {
          signals = signals.concat(this.flattenSignals(component.template));
        }
      }
      
      return signals;
    },
    
    buildTemplateHierarchy(template: TemplateInfo): TemplateInfo[] {
      const hierarchy: TemplateInfo[] = [template];
      
      for (const component of template.components) {
        if (component.template) {
          hierarchy.push(...this.buildTemplateHierarchy(component.template));
        }
      }
      
      return hierarchy;
    },
    
    findTemplateByName(template: TemplateInfo, name: string): TemplateInfo | null {
      if (template.templateName === name) {
        return template;
      }
      
      for (const component of template.components) {
        if (component.template) {
          const found = this.findTemplateByName(component.template, name);
          if (found) return found;
        }
      }
      
      return null;
    },

    confirmTemplateName(templateName: string) {
      if (!this.confirmedTemplateNames.includes(templateName)) {
        this.confirmedTemplateNames = [...this.confirmedTemplateNames, templateName];
      }
    },

    isTemplateConfirmed(templateName: string): boolean {
      return this.confirmedTemplateNames.includes(templateName);
    },

    collectTemplateNames(template: TemplateInfo): string[] {
      const names: string[] = [template.templateName];
      for (const comp of template.components) {
        if (comp.template) {
          names.push(...this.collectTemplateNames(comp.template));
        } else {
          names.push(comp.templateName);
        }
      }
      return names;
    },

    rebuildTemplateColorMap(root: TemplateInfo) {
      const names = [...new Set(this.collectTemplateNames(root))];

      const confirmedGreen = '#16a34a';

      function isExcluded(hex: string): boolean {
        if (hex === confirmedGreen) return true;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        if (g > r * 1.3 && g > b * 1.2) return true;
        if (r > 200 && g > 200 && b < 180) return true;
        return false;
      }

      const palette = [
        ...d3.schemeTableau10,
        ...d3.schemeSet3,
        ...d3.schemePaired,
      ].filter(c => !isExcluded(c));

      const colorScale = d3.scaleOrdinal<string>(palette);

      const colorMap: Record<string, string> = {};
      for (const name of names) {
        colorMap[name] = colorScale(name);
      }

      this.templateColorMap = colorMap;
    },

    getTemplateColor(templateName: string): string {
      return this.templateColorMap[templateName] ?? '#5f6368';
    },

    highlightFiles(filePaths: string[]) {
      this.fileHighlight = { filePaths: [...filePaths], version: Date.now() };
      this.activeLeftPanel = 'signal';
    },

    clearFileHighlight() {
      this.fileHighlight = null;
    }
  }
});

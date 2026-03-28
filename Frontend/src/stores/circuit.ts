import { defineStore } from 'pinia';
import type {
  TemplateInfo,
  SignalInfo,
  FileSummary,
  ParseError,
  CircuitStatistics,
  CompilationConstraints,
  ConstraintVerification
} from '@/types/circuitTypes';

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
  };
  
  signalFilter: {
    selectedSignals: Set<string>;
    filterByType: 'input' | 'output' | 'intermediate' | 'all';
    searchTerm: string;
  };
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
      error: null
    },
    
    signalFilter: {
      selectedSignals: new Set<string>(),
      filterByType: 'all',
      searchTerm: ''
    }
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
        error: null
      };
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
    }
  }
});

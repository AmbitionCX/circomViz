import { defineStore } from 'pinia';
import { SymbolType, constraintType, CircuitNode, CircuitEdge } from '@/types/circuitTypes';

export const useCircuitStore = defineStore('circuit', {
    state: () => ({
        circomCode: '' as string,
        compilationId: '' as string,
        symbols: [] as SymbolType[],
        constraints: [] as constraintType[],
        substitutions: {} as Record<string, any>,
        selectedSignals: [] as any[],
        code: '' as string,
        symbolMap: new Map<string, SymbolType | string>(),
        nodes_list: [] as CircuitNode[],
        edges_list: [] as CircuitEdge[],
        viewportTransform: {
            x: 0,
            y: 0,
            scale: 1
        },
        selectedElements: new Set<string>()
    }),
    getters: {
        isCodeEmpty(): boolean {
            return this.circomCode === '';
        },
    },
    actions: {
        setCompilationId(id: string) {
            this.compilationId = id;
        },
        setSymbols(symbol: any[]) {
            this.symbols = symbol;
            this.calculateSymbolMap();
        },
        setConstraints(constraint: any[]) {
            this.constraints = constraint;
        },
        setSubstitutions(substitution: {}) {
            this.substitutions = substitution
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
        calculateSymbolMap() {
            this.symbolMap = new Map<string, string>();
            this.symbolMap.set('0', "{symbol_id:'0',component:'none',name:'const'}"); // signal number 0 expressing the constant 1
            this.symbols.forEach(s => {
                if (s.symbol_id && s.name) {
                    this.symbolMap.set(s.symbol_id, s);
                }
            })
        },
        setNodesList(nodes_list: CircuitNode[]) {
            this.nodes_list = nodes_list;
        },
        setEdgesList(edges_list: CircuitEdge[]) {
            this.edges_list = edges_list;
        },
    }
});

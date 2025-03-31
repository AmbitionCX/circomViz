import { defineStore } from 'pinia';
import { SymbolObject, ConstraintObject, CircuitNode, CircuitEdge } from '@/types/circuitTypes';

export const useCircuitStore = defineStore('circuit', {
    state: () => ({
        circomCode: '' as string,
        compilationId: '' as string,
        symbols: [] as SymbolObject[],
        constraints: [] as ConstraintObject[],
        substitutions: {} as Record<string, any>,
        selectedSignals: [] as any[],
        code: '' as string,
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
        setNodesList(nodes_list: CircuitNode[]) {
            this.nodes_list = nodes_list;
        },
        setEdgesList(edges_list: CircuitEdge[]) {
            this.edges_list = edges_list;
        },
    }
});

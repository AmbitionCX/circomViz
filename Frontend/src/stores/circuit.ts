import { defineStore } from 'pinia';
import { SymbolObject, ConstraintObject, QAPData, QAPNode, QAPLink } from '@/types/circuitTypes';

export const useCircuitStore = defineStore('circuit', {
    state: () => ({
        circomCode: '' as string,
        compilationId: '' as string,
        symbols: [] as SymbolObject[],
        constraints: [] as ConstraintObject[],
        substitutions: {} as Record<string, any>,
        selectedSignals: [] as any[],
        code: '' as string,
        qapData: {} as QAPData,
        nodes_list: [] as QAPNode[],
        links_list: [] as QAPLink[],
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
        setQAPData(qapData: QAPData) {
            this.qapData = qapData;
        },
        setNodesList(nodes_list: QAPNode[]) {
            this.nodes_list = nodes_list;
        },
        setLinksList(links_list: QAPLink[]) {
            this.links_list = links_list;
        }
    }
});

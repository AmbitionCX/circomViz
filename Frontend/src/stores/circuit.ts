import { defineStore } from 'pinia';

export const useCircuitStore = defineStore('circuit', {
    state: () => ({
        circomCode: '' as string,

        compilationId: '' as string,
        symbols: [] as any[],
        constraints: [] as any[],
        substitutions: {},
        
        selectedSignals: [] as any[],
        code: '' as string,
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
        setSelectedSignals(signals: any[]) {
            this.selectedSignals = signals;
        },
        resetCompilationId() {
            this.compilationId = '';
        },
        setCode(newCode: string) {
            this.code = newCode;
        },
    }
});

import { defineStore } from 'pinia';

export const useCircuitStore = defineStore('circuit', {
    state: () => ({
        circomCode: '' as string,

        compilationId: '' as string,
        circuitData: {
            signals: [] as any[],
            components: [] as any[],
        },
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
        resetCompilationId() {
            this.compilationId = '';
        },
        setCode(newCode: string) {
            this.code = newCode;
        },
    }
});

import { defineStore } from 'pinia';

export const useCircuitStore = defineStore('circuit', {
    state: () => ({
        compilationId: '' as string,
        circuitData: {
            signals: [] as any[],
            components: [] as any[],
        },
        selectedSignals: [] as any[],
        code: '' as string,
    }),
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

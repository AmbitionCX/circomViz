import { defineStore } from 'pinia';

export const useCircuitStore = defineStore('circuit', {
    state: () => ({
        compilationId: '' as string,
        circuitData: {
            signals: [],
            components: []
        },
        selectedSignals: []
    }),
    actions: {
        setCompilationId(id: string) {
            this.compilationId = id;
        },
        resetCompilationId() {
            this.compilationId = '';
        }
    }
});

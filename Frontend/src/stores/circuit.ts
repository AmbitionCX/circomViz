import { defineStore } from 'pinia';

export const useCircuitStore = defineStore('circuit', {
    state: () => ({
        circuitData: {
            signals: [],
            components: []
        },
        selectedSignals: []
    }),
    actions: {
        setCircuitData(data) {
            this.circuitData = data;
        },
        setSelectedSignals(signals) {
            this.selectedSignals = signals;
        }
    }
});

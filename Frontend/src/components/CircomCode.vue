<template>
  <div class="flex flex-col h-full w-full">
    <div>
      <h2 class="text-base font-bold mb-2">Circom Code Input Area</h2>
    </div>
    <div class="grow border">
      <MonacoEditor v-model="circuitStore.code" class="w-full h-full" />
    </div>
    <div>
      <el-button @click="generateCircuit" type="primary" class="mt-2">Generate Circuit</el-button>
      <el-alert v-if="error" type="error" class="mt-4">{{ error }}</el-alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import MonacoEditor from '@/components/MonacoEditor.vue';
import { generate_circuit, generate_circuit_request, generate_circuit_response } from '@/apis/index.ts';
import { useCircuitStore } from '@/stores/circuit';

const circuitStore = useCircuitStore();
const error = ref<string>('');

const generateCircuit = async () => {
  if (!circuitStore.code) {
    console.log("Empty code");
  } else {
    let data: generate_circuit_request = {
      code: circuitStore.code,
    };

    generate_circuit(data).then((response: generate_circuit_response) => {
      console.log("Circom code compiled:", response.compilationId);
      circuitStore.setCompilationId(response.compilationId);
    }).catch((err: any) => {
      console.log(error);
      error.value = err.response?.data?.error || 'Error generating circuit';
    });
  }
};
</script>

<style scoped>
:deep(textarea) {
  height: 100%;
}
</style>

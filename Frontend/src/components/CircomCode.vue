<template>
  <div class="flex flex-col h-full w-full">
    <div>
      <h2 class="text-base font-bold mb-2">Circom Code Input Area</h2>
    </div>
    <div class="grow">
      <MonacoEditor v-model="code" class="w-full h-full" />
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
import { generate_circuit } from '@/apis/index.ts';
import { useCircuitStore } from '@/stores/circuit';

const code = ref<string>('');
const circuitStore = useCircuitStore();
const error = ref<string>('');

interface generate_circuit_response {
  data: string;
}

interface ErrorType {
  response?: {
    data?: {
      error?: string;
    };
  };
}

const generateCircuit = async () => {
  if (!code.value) {
    console.log("Empty code");
  } else {
    let data = {
      code: code.value,
    };

    generate_circuit(data).then((response: generate_circuit_response) => {
      let circuitData = response.data;
      console.log(circuitData);

      circuitStore.setCircuitData(circuitData);
    }).catch((err: ErrorType) => {
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

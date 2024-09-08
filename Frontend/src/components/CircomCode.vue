<template>
  <div class="flex flex-col flex-nowrap h-full w-full">
    <div class="flex flex-row flex-nowrap justify-between">
      <div class="text-base font-bold mb-2">Code Input</div>
      <div class="mb-2">
        <el-button type="primary" plain :disabled="!codeEmpty" @click="fillExampleCode">Example</el-button>
        <el-button type="warning" plain :disabled="codeEmpty" @click="cleanCode">Clean</el-button>
      </div>
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
import { ref, computed } from 'vue';

import MonacoEditor from '@/components/MonacoEditor.vue';
import { generate_circuit, generate_circuit_request, generate_circuit_response } from '@/apis/index.ts';
import { useCircuitStore } from '@/stores/circuit';

const codeEmpty = computed(() => {
  return circuitStore.code.length === 0;
})
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

const fillExampleCode = () => {
  circuitStore.setCode(
    `pragma circom 2.1.6;
    include "circomlib/poseidon.circom";

    template Example () {
      signal input a;
      signal input b;
      signal output c;
      
      var unused = 4;
      c <== a * b;
      assert(a > 2);
      
      component hash = Poseidon(2);
      hash.inputs[0] <== a;
      hash.inputs[1] <== b;

      log("hash", hash.out);
    }

    component main { public [ a ] } = Example();

    /* INPUT = {
        "a": "5",
        "b": "77"
    } */
    `)
}

const cleanCode = () => {
  circuitStore.setCode('');
}
</script>

<style scoped>
:deep(textarea) {
  height: 100%;
}
</style>

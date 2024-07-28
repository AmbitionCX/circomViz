<template>
  <div>
    <h2 class="text-xl font-bold mb-4">Circom Code Input Area</h2>
    <el-input type="textarea" v-model="code" rows="10" class="w-full"
      placeholder="Enter your Circom code here..."></el-input>
    <el-button @click="generateCircuit" type="primary" class="mt-4">Generate Circuit</el-button>
    <el-alert v-if="error" type="error" class="mt-4">{{ error }}</el-alert>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { useCircuitStore } from '../stores/circuit';

const code = ref('');
const circuitStore = useCircuitStore();
const error = ref('');

const generateCircuit = async () => {
  try {
    error.value = '';
    const response = await axios.post('http://localhost:8080/parse-circom', { code: code.value });
    const circuitData = response.data;
    circuitStore.setCircuitData(circuitData);
  } catch (err) {
    error.value = err.response?.data?.error || 'Error generating circuit';
  }
};
</script>

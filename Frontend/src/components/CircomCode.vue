<template>
  <!-- <div class="fixed top-4 left-4 right-4" style="max-width: 400px">
    <el-alert v-if="isCompilationFail" :title="compilationFailMessage" type="error" show-icon
      @close="isCompilationFail = false" />
  </div> -->
  <div class="flex flex-col flex-nowrap h-full w-full">
    <div class="flex flex-row flex-nowrap justify-between">
      <div class="text-base font-bold mb-2">Code Input</div>
      <div class="mb-2">
        <el-dropdown @command="handleDropdownSelect">
          <el-button type="primary" round class="mr-2">
            Examples<el-icon class="el-icon--right"><arrow-down /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="1-constraint">1-constraint</el-dropdown-item>
              <el-dropdown-item command="simpleVote">simpleVote</el-dropdown-item>
              <el-dropdown-item command="mimc7">mimc7</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="warning" round :disabled="codeEmpty" @click="cleanCode">Clean</el-button>
      </div>
    </div>
    <div class="flex-grow border">
      <MonacoEditor v-model="circuitStore.code" @validation="handleEditorValidation"
        style="min-height: 300px; height: 99%;" />
    </div>
    <div >
      <el-button @click="generateCircuit" type="primary" round class="mt-2">Generate Circuit</el-button>
      <el-alert v-if="error" type="error" class="mt-4">{{ error }}</el-alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import MonacoEditor from '@/components/MonacoEditor.vue';
import { generate_circuit, generate_circuit_request, generate_circuit_response } from '@/apis/index.ts';
import { useCircuitStore } from '@/stores/circuit';

const selectedExample = ref<string | null>(null);
const codeEmpty = computed(() => {
  return circuitStore.code.length === 0;
})
const circuitStore = useCircuitStore();
const error = ref<string>('');
const isCompilationFail = ref(false);
const compilationFailMessage = ref('');

const handleDropdownSelect = (command: string) => {
  selectedExample.value = command;
  console.log('Selected example:', selectedExample.value);
  fillExampleCode(selectedExample.value);
};

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
      circuitStore.setConstraints(response.circuitData.constraints);
      circuitStore.setSubstitutions(response.circuitData.substitutions);
      circuitStore.setSymbols(response.circuitData.symbols);

    }).catch((err: any) => {
      if (err.response?.status === 400) {
        compilationFailMessage.value = 'Circom code compilation failed.';
        isCompilationFail.value = true;
        ElMessage.error(`${compilationFailMessage.value}`)
        return; // Interrupt the function
      }
      console.log(error);
      error.value = err.response?.data?.error || 'Error generating circuit';
    });
  }
};

const fillExampleCode = async (example: string) => {
  if (selectedExample.value == null){
    ElMessage.error("No example selected");
    return;
  }

  try {
    const response = await fetch(`src/examples/${example}.circom`);                                                                                                       
    if (!response.ok) throw new Error('Failed to load example');                                                                                                                 
    const exampleCode = await response.text();
    circuitStore.setCode(exampleCode);
  } catch (err) {
    console.error('Error loading example:', err);
    error.value = 'Failed to load example code';
    ElMessage.error(`${error.value}`)
  }
}

const cleanCode = () => {
  circuitStore.setCode('');
}

watch(isCompilationFail, (newVal) => {
  if (newVal) {
    setTimeout(() => {
      isCompilationFail.value = false;
    }, 5000);
  }
});

const handleEditorValidation = (markers: any) => {
  error.value = markers.length > 0
    ? markers[0].message
    : null;
};
</script>

<style lang="css" scoped>
:deep(textarea) {
  height: 100%;
}

.el-alert {
  margin: 20px 0 0;
}

.el-alert:first-child {
  margin: 0;
}
</style>

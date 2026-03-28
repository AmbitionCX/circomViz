<template>
  <div class="h-full flex flex-col min-h-0 overflow-auto">
    <div class="mb-2 flex-shrink-0 flex flex-row-reverse items-center gap-2">
      <el-button
        type="success"
        size="small"
        @click="$emit('confirm')"
        :disabled="staticAnalysisFindings.length === 0 && !confirmed"
      >
        <el-icon class="mr-1"><CircleCheck /></el-icon>
        Confirm
      </el-button>

      <el-button
        type="warning"
        size="small"
        @click="handleRunSoundnessCheck"
        :loading="isRunningSoundnessCheck"
        :disabled="!canRunSoundnessCheck"
      >
        <el-icon class="mr-1"><Cpu /></el-icon>
        Structural Check
      </el-button>

      <el-button
        type="primary"
        size="small"
        @click="handleRunStaticAnalysis"
        :loading="isRunningStaticAnalysis"
        :disabled="!canRunStaticAnalysis"
      >
        <el-icon class="mr-1"><Select /></el-icon>
        Static Analysis
      </el-button>
    </div>

    <!-- Soundness Check Controls -->
    <div v-if="showSoundnessControls" class="mb-2 p-2 bg-gray-50 rounded-lg border flex-shrink-0">
      <div class="text-xs font-medium text-gray-600 mb-2">Structural Property Checks (cvc5)</div>
      <div class="flex flex-wrap gap-3 mb-2">
        <el-checkbox v-model="querySatisfiability">Satisfiability</el-checkbox>
        <el-checkbox v-model="queryDeterminism">Output Determinism</el-checkbox>
        <el-checkbox v-model="queryCoverage">Key Constraint Coverage</el-checkbox>
      </div>
      <div v-if="queryCoverage" class="mb-2">
        <div class="text-xs text-gray-500 mb-1">Target signal names (comma-separated, e.g. main.out,main.hash):</div>
        <el-input
          v-model="coverageSignalNamesStr"
          placeholder="main.out"
          size="small"
          style="width: 300px"
        />
      </div>
    </div>

    <!-- Soundness Results -->
    <div v-if="soundnessResults" class="flex-1 overflow-auto mb-2">
      <div class="text-xs font-medium text-gray-600 mb-2">Structural Check Results</div>

      <!-- Satisfiability -->
      <div v-if="soundnessResults.satisfiability" class="mb-2 p-2 rounded-lg border"
        :class="soundnessResults.satisfiability.satisfiable ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">Satisfiability</span>
          <el-tag :type="soundnessResults.satisfiability.satisfiable ? 'success' : 'danger'" size="small">
            {{ soundnessResults.satisfiability.satisfiable ? 'SAT' : 'UNSAT' }}
          </el-tag>
        </div>
        <div class="text-xs text-gray-500">{{ soundnessResults.satisfiability.executionTimeMs.toFixed(0) }}ms</div>
        <div v-if="soundnessResults.satisfiability.satisfiable && soundnessResults.satisfiability.model" class="mt-1">
          <div class="text-xs text-gray-500 mb-1">Witness assignment (signal index → value):</div>
          <div class="text-xs font-mono bg-white p-1 rounded max-h-32 overflow-auto">
            <div v-for="(value, idx) in soundnessResults.satisfiability.model" :key="String(idx)">
              s_{{ idx }} = {{ value }}
            </div>
          </div>
        </div>
        <el-collapse>
          <el-collapse-item title="Solver Output" name="sat-output">
            <pre class="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">{{ soundnessResults.satisfiability.solverOutput }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- Determinism -->
      <div v-if="soundnessResults.determinism" class="mb-2 p-2 rounded-lg border"
        :class="soundnessResults.determinism.deterministic ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">Output Determinism</span>
          <el-tag :type="soundnessResults.determinism.deterministic ? 'success' : 'danger'" size="small">
            {{ soundnessResults.determinism.deterministic ? 'DETERMINISTIC' : 'NON-DETERMINISTIC' }}
          </el-tag>
        </div>
        <div class="text-xs text-gray-500">{{ soundnessResults.determinism.executionTimeMs.toFixed(0) }}ms</div>
        <div v-if="!soundnessResults.determinism.deterministic && soundnessResults.determinism.counterexample" class="mt-1">
          <div class="text-xs text-gray-500 mb-1">Counterexample (same input, different outputs):</div>
          <div class="grid grid-cols-3 gap-2 text-xs">
            <div class="bg-white p-1 rounded">
              <div class="font-medium text-gray-600 mb-1">Input</div>
              <div v-for="(value, name) in soundnessResults.determinism.counterexample.input" :key="String(name)" class="font-mono">
                {{ name }} = {{ value }}
              </div>
            </div>
            <div class="bg-white p-1 rounded">
              <div class="font-medium text-gray-600 mb-1">Output 1</div>
              <div v-for="(value, name) in soundnessResults.determinism.counterexample.output1" :key="String(name)" class="font-mono">
                {{ name }} = {{ value }}
              </div>
            </div>
            <div class="bg-white p-1 rounded">
              <div class="font-medium text-gray-600 mb-1">Output 2</div>
              <div v-for="(value, name) in soundnessResults.determinism.counterexample.output2" :key="String(name)" class="font-mono">
                {{ name }} = {{ value }}
              </div>
            </div>
          </div>
        </div>
        <el-collapse>
          <el-collapse-item title="Solver Output" name="det-output">
            <pre class="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">{{ soundnessResults.determinism.solverOutput }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- Coverage -->
      <div v-if="soundnessResults.coverage" class="mb-2 p-2 rounded-lg border"
        :class="soundnessResults.coverage.covered ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">Key Constraint Coverage</span>
          <el-tag :type="soundnessResults.coverage.covered ? 'success' : 'danger'" size="small">
            {{ soundnessResults.coverage.covered ? 'COVERED' : 'NOT COVERED' }}
          </el-tag>
        </div>
        <div class="text-xs text-gray-500">{{ soundnessResults.coverage.executionTimeMs.toFixed(0) }}ms</div>
        <div v-if="!soundnessResults.coverage.covered && soundnessResults.coverage.drifts && soundnessResults.coverage.drifts.length > 0" class="mt-1">
          <div class="text-xs text-gray-500 mb-1">Drifts detected:</div>
          <div v-for="drift in soundnessResults.coverage.drifts" :key="drift.signalName" class="text-xs font-mono bg-white p-1 rounded mb-1">
            {{ drift.signalName }}: {{ drift.value1 }} vs {{ drift.value2 }}
          </div>
        </div>
        <el-collapse>
          <el-collapse-item title="Solver Output" name="cov-output">
            <pre class="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">{{ soundnessResults.coverage.solverOutput }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>

    <!-- Static Analysis Findings -->
    <div v-if="staticAnalysisFindings.length > 0" class="flex-1 overflow-auto">
      <div class="text-xs text-gray-500 mb-2">
        {{ staticAnalysisFindings.length }} findings
      </div>
      <div
        v-for="(finding, index) in staticAnalysisFindings"
        :key="index"
        :class="[
          'mb-2 p-3 rounded-lg border',
          finding.severity === 'high' ? 'bg-red-50 border-red-200' :
          finding.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
          'bg-blue-50 border-blue-200'
        ]"
      >
        <div class="flex items-center justify-between mb-1">
          <el-tag :type="finding.severity === 'high' ? 'danger' : finding.severity === 'medium' ? 'warning' : 'info'" size="small">
            {{ finding.severity.toUpperCase() }}
          </el-tag>
          <span class="text-xs text-gray-600">{{ finding.type }}</span>
        </div>
        <div class="text-sm text-gray-700">{{ finding.message }}</div>
        <div v-if="finding.line" class="text-xs text-gray-500 mt-1">
          Line: {{ finding.line }}
        </div>
      </div>
    </div>

    <div v-else-if="!isRunningStaticAnalysis && !isRunningSoundnessCheck && !soundnessResults" class="flex-1 flex items-center justify-center">
      <el-empty description="No findings yet. Run static analysis or structural checks." :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Select, CircleCheck, Cpu } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { staticAnalysis, soundnessCheck } from '@/apis';
import { ElMessage } from 'element-plus';

interface Props {
  canRunStaticAnalysis: boolean;
}

defineProps<Props>();
defineEmits<{
  confirm: [];
}>();

const circuitStore = useCircuitStore();

interface Finding {
  severity: 'high' | 'medium' | 'low';
  type: string;
  message: string;
  file?: string;
  line?: number;
}

const staticAnalysisFindings = ref<Finding[]>([...circuitStore.compilationData.staticAnalysisFindings]);

const isRunningStaticAnalysis = ref(false);
const isRunningSoundnessCheck = ref(false);
const confirmed = ref(false);
const showSoundnessControls = ref(true);

const querySatisfiability = ref(true);
const queryDeterminism = ref(true);
const queryCoverage = ref(false);
const coverageSignalNamesStr = ref('');

const soundnessResults = ref<Record<string, any> | null>(null);

const canRunSoundnessCheck = computed(() => {
  const { symPath, constraintsJsonPath } = circuitStore.compilationData;
  const { repo, entry } = circuitStore.parseData;
  return !!(symPath && constraintsJsonPath && repo && entry);
});

watch(() => circuitStore.compilationVersion, () => {
  staticAnalysisFindings.value = [];
  confirmed.value = false;
  soundnessResults.value = null;
});

const handleRunStaticAnalysis = async () => {
  const { symPath, constraintsJsonPath } = circuitStore.compilationData;
  const repo = circuitStore.parseData.repo;
  const entry = circuitStore.parseData.entry;

  if (!symPath || !constraintsJsonPath) {
    ElMessage.error('Missing required files for static analysis');
    return;
  }

  if (!repo || !entry) {
    ElMessage.error('Missing project info. Please re-parse the repository.');
    return;
  }

  isRunningStaticAnalysis.value = true;

  try {
    ElMessage.info('Running static analysis...');

    const result = await staticAnalysis({
      repo,
      entry,
      symPath,
      constraintsJsonPath
    });

    if (!result.success) {
      throw new Error(result.error || 'Static analysis failed');
    }

    staticAnalysisFindings.value = [...result.findings];
    circuitStore.setStaticAnalysisFindings(result.findings);

    ElMessage.success(`Static analysis completed: ${result.findings.length} findings found`);
  } catch (error: any) {
    console.error('Error running static analysis:', error);
    ElMessage.error(error.response?.data?.error || error.message || 'Failed to run static analysis');
  } finally {
    isRunningStaticAnalysis.value = false;
  }
};

const handleRunSoundnessCheck = async () => {
  const { symPath, constraintsJsonPath } = circuitStore.compilationData;
  const repo = circuitStore.parseData.repo;
  const entry = circuitStore.parseData.entry;

  if (!symPath || !constraintsJsonPath || !repo || !entry) {
    ElMessage.error('Missing required data for soundness check');
    return;
  }

  if (!querySatisfiability.value && !queryDeterminism.value && !queryCoverage.value) {
    ElMessage.warning('Select at least one check to run');
    return;
  }

  if (queryCoverage.value && !coverageSignalNamesStr.value.trim()) {
    ElMessage.warning('Enter signal names for coverage check');
    return;
  }

  isRunningSoundnessCheck.value = true;
  soundnessResults.value = null;

  try {
    ElMessage.info('Running cvc5 structural checks...');

    const result = await soundnessCheck({
      repo,
      entry,
      symPath,
      constraintsJsonPath,
      queries: {
        satisfiability: querySatisfiability.value || undefined,
        determinism: queryDeterminism.value || undefined,
        coverage: queryCoverage.value ? {
          signalNames: coverageSignalNamesStr.value.split(',').map(s => s.trim()).filter(Boolean),
        } : undefined,
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'Soundness check failed');
    }

    soundnessResults.value = result.results;

    const parts: string[] = [];
    if (result.results.satisfiability) {
      parts.push(result.results.satisfiability.satisfiable ? 'SAT' : 'UNSAT');
    }
    if (result.results.determinism) {
      parts.push(result.results.determinism.deterministic ? 'Deterministic' : 'Non-deterministic');
    }
    if (result.results.coverage) {
      parts.push(result.results.coverage.covered ? 'Covered' : 'Not covered');
    }

    ElMessage.success(`Checks complete: ${parts.join(', ')}`);
  } catch (error: any) {
    console.error('Error running soundness check:', error);
    ElMessage.error(error.response?.data?.error || error.message || 'Failed to run soundness check');
  } finally {
    isRunningSoundnessCheck.value = false;
  }
};

function reset() {
  staticAnalysisFindings.value = [];
  confirmed.value = false;
  soundnessResults.value = null;
}

defineExpose({
  handleRunStaticAnalysis,
  handleRunSoundnessCheck,
  staticAnalysisFindings,
  isRunningStaticAnalysis,
  isRunningSoundnessCheck,
  confirmed,
  soundnessResults,
  reset
});
</script>

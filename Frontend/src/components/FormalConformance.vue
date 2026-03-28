<template>
  <div class="h-full flex flex-col min-h-0 overflow-auto">
    <div class="mb-2 flex-shrink-0 flex flex-row-reverse items-center gap-2">
      <el-button
        type="success"
        size="small"
        @click="$emit('confirm')"
        :disabled="!hasResults"
      >
        <el-icon class="mr-1"><CircleCheck /></el-icon>
        Confirm
      </el-button>

      <el-button
        type="primary"
        size="small"
        @click="handleRunFormalConformance"
        :loading="isRunning"
        :disabled="!canRun"
      >
        <el-icon class="mr-1"><Connection /></el-icon>
        Run Conformance
      </el-button>
    </div>

    <!-- Confirmed Spec DSL Display -->
    <div v-if="confirmedSpecs.length > 0" class="mb-3 flex-shrink-0">
      <div class="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
        <el-icon class="text-green-500"><CircleCheckFilled /></el-icon>
        User-Confirmed Candidate Spec DSL
      </div>
      <el-collapse v-model="expandedSpecGroups">
        <el-collapse-item
          v-for="(group, index) in confirmedSpecs"
          :key="group.groupId"
          :name="index"
        >
          <template #title>
            <div class="flex items-center gap-2 flex-1 pr-2">
              <el-tag type="success" size="small">{{ group.templateName }}</el-tag>
              <span class="text-xs text-gray-500 truncate">
                {{ shortFileName(group.sourceFile) }}:{{ group.lineRange[0] }}-{{ group.lineRange[1] }}
              </span>
            </div>
          </template>

          <div class="pl-1">
            <div class="mb-2 p-2 bg-gray-50 rounded-lg border">
              <div class="text-xs font-mono text-gray-700">{{ group.normalizedContext.templateSignature }}</div>
            </div>

            <div v-if="group.llmResult" class="border-t pt-2">
              <el-collapse>
                <el-collapse-item title="Summary (Natural Language)" name="summary">
                  <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {{ group.llmResult.summary }}
                  </div>
                </el-collapse-item>

                <el-collapse-item title="Candidate Spec DSL" name="spec">
                  <pre class="text-xs bg-gray-50 p-2 rounded font-mono overflow-auto max-h-60 whitespace-pre-wrap">{{ group.llmResult.candidateSpecDSL }}</pre>
                </el-collapse-item>

                <el-collapse-item
                  v-if="group.llmResult.ambiguities.length > 0"
                  :title="`Ambiguities (${group.llmResult.ambiguities.length})`"
                  name="ambiguities"
                >
                  <div v-for="(item, aIdx) in group.llmResult.ambiguities" :key="aIdx" class="flex items-start gap-2 mb-1.5">
                    <el-tag type="warning" size="small" class="mt-0.5 flex-shrink-0">?</el-tag>
                    <span class="text-sm text-gray-700">{{ item }}</span>
                  </div>
                </el-collapse-item>

                <el-collapse-item
                  v-if="group.llmResult.riskNotes.length > 0"
                  :title="`Risk Notes (${group.llmResult.riskNotes.length})`"
                  name="risks"
                >
                  <div v-for="(item, rIdx) in group.llmResult.riskNotes" :key="rIdx" class="flex items-start gap-2 mb-1.5">
                    <el-tag type="danger" size="small" class="mt-0.5 flex-shrink-0">risk</el-tag>
                    <span class="text-sm text-gray-700">{{ item }}</span>
                  </div>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- Query Controls -->
    <div v-if="canRun" class="mb-2 p-2 bg-gray-50 rounded-lg border flex-shrink-0">
      <div class="text-xs font-medium text-gray-600 mb-2">Formal Conformance Queries (cvc5 + Spec DSL)</div>
      <div class="flex flex-wrap gap-3 mb-2">
        <el-checkbox v-model="querySoundness" :disabled="isRunning">
          <el-tooltip content="Check if circuit allows behavior violating spec (C ⊨ S)" placement="top">
            <span>Soundness</span>
          </el-tooltip>
        </el-checkbox>
        <el-checkbox v-model="queryCompleteness" :disabled="isRunning">
          <el-tooltip content="Check if spec allows behavior circuit cannot produce (S ⊨ C)" placement="top">
            <span>Completeness</span>
          </el-tooltip>
        </el-checkbox>
        <el-checkbox v-model="queryDeterminism" :disabled="isRunning">
          <el-tooltip content="Check if same inputs can produce different outputs" placement="top">
            <span>Determinism</span>
          </el-tooltip>
        </el-checkbox>
        <el-checkbox v-model="queryTotality" :disabled="isRunning">
          <el-tooltip content="Check if every valid input has a witness" placement="top">
            <span>Totality</span>
          </el-tooltip>
        </el-checkbox>
      </div>
      <div class="text-xs text-gray-400">
        Uses O2-optimized constraints with --simplification_substitution for compact R1CS.
        First version: finite field arithmetic (add, mul, const, eq, boolean).
      </div>
    </div>

    <!-- Spec Translation Status -->
    <div v-if="specTranslation" class="mb-2 p-2 rounded-lg border flex-shrink-0"
      :class="specTranslation.parseErrors.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'">
      <div class="text-xs font-medium text-gray-600 mb-1">Spec → SMT2 Translation</div>
      <div class="flex gap-3 text-xs mb-1">
        <span class="text-blue-600">Assumptions: {{ specTranslation.assumptions.length }}</span>
        <span class="text-purple-600">Posts: {{ specTranslation.posts.length }}</span>
        <span class="text-orange-600">Invariants: {{ specTranslation.invariants.length }}</span>
        <span :class="specTranslation.parseErrors.length > 0 ? 'text-red-600' : 'text-green-600'">
          Errors: {{ specTranslation.parseErrors.length }}
        </span>
      </div>
      <div v-if="specTranslation.parseErrors.length > 0" class="text-xs text-yellow-700">
        <div v-for="(err, eIdx) in specTranslation.parseErrors" :key="eIdx">{{ err }}</div>
      </div>
      <el-collapse>
        <el-collapse-item title="Translated SMT2 Clauses" name="smt2-details">
          <div v-if="specTranslation.assumptions.length > 0" class="mb-2">
            <div class="text-xs font-medium text-blue-600 mb-1">Assumptions</div>
            <div v-for="(a, aIdx) in specTranslation.assumptions" :key="aIdx" class="text-xs font-mono bg-white p-1 rounded mb-0.5">
              <span class="text-gray-500">{{ a.signal }} ({{ a.kind }}):</span> {{ a.smt2Lines.join(' ') }}
            </div>
          </div>
          <div v-if="specTranslation.posts.length > 0" class="mb-2">
            <div class="text-xs font-medium text-purple-600 mb-1">Posts (Constraints)</div>
            <div v-for="(p, pIdx) in specTranslation.posts" :key="pIdx"
              class="text-xs font-mono p-1 rounded mb-0.5"
              :class="p.parseable ? 'bg-white' : 'bg-red-50'">
              <el-tag :type="p.parseable ? 'success' : 'danger'" size="small" class="mr-1">
                {{ p.kind }}
              </el-tag>
              {{ p.raw }}
              <div v-if="p.parseable" class="text-gray-500 mt-0.5">{{ p.smt2Lines.join(' ') }}</div>
              <div v-else class="text-red-400 mt-0.5">Not auto-translatable</div>
            </div>
          </div>
          <div v-if="specTranslation.invariants.length > 0">
            <div class="text-xs font-medium text-orange-600 mb-1">Invariants</div>
            <div v-for="(inv, iIdx) in specTranslation.invariants" :key="iIdx"
              class="text-xs font-mono p-1 rounded mb-0.5"
              :class="inv.parseable ? 'bg-white' : 'bg-gray-50'">
              <el-tag :type="inv.parseable ? 'success' : 'info'" size="small" class="mr-1">
                {{ inv.kind }}
              </el-tag>
              {{ inv.raw }}
              <div v-if="inv.parseable" class="text-gray-500 mt-0.5">{{ inv.smt2Lines.join(' ') }}</div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- Results -->
    <div v-if="results" class="flex-1 overflow-auto">
      <!-- Soundness -->
      <div v-if="results.soundness" class="mb-2 p-2 rounded-lg border"
        :class="results.soundness.conformant ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">Soundness (C ⊨ S)</span>
          <el-tag :type="results.soundness.conformant ? 'success' : 'danger'" size="small">
            {{ results.soundness.conformant ? 'CONFORMANT' : 'VIOLATION' }}
          </el-tag>
        </div>
        <div class="text-xs text-gray-500">
          {{ results.soundness.executionTimeMs.toFixed(0) }}ms |
          {{ results.soundness.translatedSpecLines }} spec clauses translated
        </div>
        <div v-if="!results.soundness.conformant && results.soundness.violation" class="mt-1">
          <div class="text-xs text-gray-500 mb-1">Counterexample (circuit violates spec):</div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="bg-white p-1 rounded">
              <div class="font-medium text-gray-600 mb-1">Inputs</div>
              <div v-for="(value, name) in results.soundness.violation.inputValues" :key="String(name)" class="font-mono">
                {{ name }} = {{ value }}
              </div>
            </div>
            <div class="bg-white p-1 rounded">
              <div class="font-medium text-gray-600 mb-1">Outputs</div>
              <div v-for="(value, name) in results.soundness.violation.outputValues" :key="String(name)" class="font-mono">
                {{ name }} = {{ value }}
              </div>
            </div>
          </div>
          <div class="text-xs text-red-500 mt-1 font-mono break-all">{{ results.soundness.violation.violatedSpec }}</div>
        </div>
        <el-collapse>
          <el-collapse-item title="Solver Output" name="snd-output">
            <pre class="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">{{ results.soundness.solverOutput }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- Completeness -->
      <div v-if="results.completeness" class="mb-2 p-2 rounded-lg border"
        :class="results.completeness.complete ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">Completeness (S ⊨ C)</span>
          <el-tag :type="results.completeness.complete ? 'success' : 'danger'" size="small">
            {{ results.completeness.complete ? 'COMPLETE' : 'INCOMPLETE' }}
          </el-tag>
        </div>
        <div class="text-xs text-gray-500">{{ results.completeness.executionTimeMs.toFixed(0) }}ms</div>
        <div v-if="!results.completeness.complete && results.completeness.gap" class="mt-1">
          <div class="text-xs text-gray-500 mb-1">Gap detected:</div>
          <div class="text-xs font-mono bg-white p-1 rounded">
            <div>Spec allows: {{ results.completeness.gap.specAllowsOutput }}</div>
            <div>Circuit cannot produce: {{ results.completeness.gap.circuitCannotProduce }}</div>
          </div>
        </div>
        <el-collapse>
          <el-collapse-item title="Solver Output" name="cmp-output">
            <pre class="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">{{ results.completeness.solverOutput }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- Determinism -->
      <div v-if="results.determinism" class="mb-2 p-2 rounded-lg border"
        :class="results.determinism.deterministic ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">Determinism</span>
          <el-tag :type="results.determinism.deterministic ? 'success' : 'danger'" size="small">
            {{ results.determinism.deterministic ? 'DETERMINISTIC' : 'NON-DETERMINISTIC' }}
          </el-tag>
        </div>
        <div class="text-xs text-gray-500">{{ results.determinism.executionTimeMs.toFixed(0) }}ms</div>
        <div v-if="!results.determinism.deterministic && results.determinism.counterexample" class="mt-1">
          <div class="text-xs text-gray-500 mb-1">Counterexample (same input, different outputs):</div>
          <div class="grid grid-cols-3 gap-2 text-xs">
            <div class="bg-white p-1 rounded">
              <div class="font-medium text-gray-600 mb-1">Input</div>
              <div v-for="(value, name) in results.determinism.counterexample.input" :key="String(name)" class="font-mono">
                {{ name }} = {{ value }}
              </div>
            </div>
            <div class="bg-white p-1 rounded">
              <div class="font-medium text-gray-600 mb-1">Output 1</div>
              <div v-for="(value, name) in results.determinism.counterexample.output1" :key="String(name)" class="font-mono">
                {{ name }} = {{ value }}
              </div>
            </div>
            <div class="bg-white p-1 rounded">
              <div class="font-medium text-gray-600 mb-1">Output 2</div>
              <div v-for="(value, name) in results.determinism.counterexample.output2" :key="String(name)" class="font-mono">
                {{ name }} = {{ value }}
              </div>
            </div>
          </div>
        </div>
        <el-collapse>
          <el-collapse-item title="Solver Output" name="det-output">
            <pre class="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">{{ results.determinism.solverOutput }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- Totality -->
      <div v-if="results.totality" class="mb-2 p-2 rounded-lg border"
        :class="results.totality.total ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">Totality</span>
          <el-tag :type="results.totality.total ? 'success' : 'danger'" size="small">
            {{ results.totality.total ? 'TOTAL' : 'PARTIAL' }}
          </el-tag>
        </div>
        <div class="text-xs text-gray-500">
          {{ results.totality.executionTimeMs.toFixed(0) }}ms |
          {{ results.totality.checkedInputs }} inputs checked
        </div>
        <div v-if="!results.totality.total && results.totality.noWitnessInputs && results.totality.noWitnessInputs.length > 0" class="mt-1">
          <div class="text-xs text-gray-500 mb-1">Inputs with no witness:</div>
          <div v-for="(inputs, iIdx) in results.totality.noWitnessInputs" :key="iIdx" class="text-xs font-mono bg-white p-1 rounded mb-0.5">
            <span v-for="(value, name) in inputs" :key="String(name)">{{ name }}={{ value }} </span>
          </div>
        </div>
        <el-collapse>
          <el-collapse-item title="Solver Output" name="tot-output">
            <pre class="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">{{ results.totality.solverOutput }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!isRunning && confirmedSpecs.length > 0" class="flex-1 flex items-center justify-center">
      <el-empty description="Select queries and click 'Run Conformance' to verify spec against circuit" :image-size="60" />
    </div>
    <div v-else-if="!isRunning" class="flex-1 flex items-center justify-center">
      <el-empty description="Confirm Candidate Spec DSL in Intent Alignment first, then come here" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { CircleCheck, Connection, CircleCheckFilled } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { formalConformance } from '@/apis';
import { ElMessage } from 'element-plus';
import type {
  IntentAlignmentGroup,
  FormalConformanceResponse,
} from '@/types/circuitTypes';

defineEmits<{
  confirm: [];
}>();

const circuitStore = useCircuitStore();

const isRunning = ref(false);
const confirmedSpecs = ref<IntentAlignmentGroup[]>([]);
const expandedSpecGroups = ref<number[]>([]);
const specTranslation = ref<FormalConformanceResponse['specTranslation'] | null>(null);
const results = ref<FormalConformanceResponse['results'] | null>(null);

const querySoundness = ref(true);
const queryCompleteness = ref(true);
const queryDeterminism = ref(true);
const queryTotality = ref(true);

const canRun = computed(() => {
  const { symPath, constraintsJsonPath } = circuitStore.compilationData;
  const { repo, entry } = circuitStore.parseData;
  const hasSpec = confirmedSpecs.value.some(g => g.llmResult?.candidateSpecDSL);
  return !!(symPath && constraintsJsonPath && repo && entry && hasSpec);
});

const hasResults = computed(() => results.value !== null);

watch(() => circuitStore.compilationVersion, () => {
  confirmedSpecs.value = [];
  expandedSpecGroups.value = [];
  specTranslation.value = null;
  results.value = null;
});

function loadConfirmedSpecs() {
  try {
    const intentAlignmentEl = document.querySelector('[data-tab="verification"] .intent-groups-ref');
    if (intentAlignmentEl) {
      const stored = (intentAlignmentEl as any).__groups__;
      if (stored) {
        confirmedSpecs.value = stored;
        return;
      }
    }
  } catch {
    // fallback below
  }

  const mainSpec = circuitStore.selectedTemplate;
  if (mainSpec) {
    const dsl = sessionStorage.getItem(`intent_alignment_spec_${mainSpec.templateName}`);
    if (dsl) {
      try {
        confirmedSpecs.value = JSON.parse(dsl);
      } catch {
        confirmedSpecs.value = [];
      }
    }
  }
}

function getBestSpecDSL(): string {
  for (const group of confirmedSpecs.value) {
    if (group.llmResult?.candidateSpecDSL) {
      return group.llmResult.candidateSpecDSL;
    }
  }
  return '';
}

const handleRunFormalConformance = async () => {
  const { symPath, constraintsJsonPath } = circuitStore.compilationData;
  const repo = circuitStore.parseData.repo;
  const entry = circuitStore.parseData.entry;
  const selectedTemplate = circuitStore.selectedTemplate;
  const selectedTemplatePath = circuitStore.selectedTemplatePath;

  if (!symPath || !constraintsJsonPath || !repo || !entry || !selectedTemplate) {
    ElMessage.error('Missing required data');
    return;
  }

  const specDSL = getBestSpecDSL();
  if (!specDSL) {
    ElMessage.error('No Candidate Spec DSL available. Run Intent Analysis first.');
    return;
  }

  if (!querySoundness.value && !queryCompleteness.value && !queryDeterminism.value && !queryTotality.value) {
    ElMessage.warning('Select at least one query');
    return;
  }

  isRunning.value = true;
  results.value = null;
  specTranslation.value = null;

  try {
    ElMessage.info('Running formal conformance checks...');

    const result = await formalConformance({
      repo,
      entry,
      symPath,
      constraintsJsonPath,
      candidateSpecDSL: specDSL,
      templateName: selectedTemplate.templateName,
      templatePath: selectedTemplatePath,
      queries: {
        soundness: querySoundness.value || undefined,
        completeness: queryCompleteness.value || undefined,
        determinism: queryDeterminism.value || undefined,
        totality: queryTotality.value || undefined,
      },
    });

    if (!result.success) throw new Error(result.error || 'Failed');

    specTranslation.value = result.specTranslation || null;
    results.value = result.results || null;

    const parts: string[] = [];
    if (result.results?.soundness) parts.push(result.results.soundness.conformant ? 'Conformant' : 'Violation');
    if (result.results?.completeness) parts.push(result.results.completeness.complete ? 'Complete' : 'Incomplete');
    if (result.results?.determinism) parts.push(result.results.determinism.deterministic ? 'Deterministic' : 'Non-det');
    if (result.results?.totality) parts.push(result.results.totality.total ? 'Total' : 'Partial');

    ElMessage.success(`Conformance checks complete: ${parts.join(', ')}`);
  } catch (error: any) {
    console.error('[FormalConformance] Error:', error);
    ElMessage.error(error.response?.data?.error || error.message || 'Failed to run conformance check');
  } finally {
    isRunning.value = false;
  }
};

function shortFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts.length > 2 ? parts.slice(-2).join('/') : parts[parts.length - 1];
}

function storeGroups(groups: IntentAlignmentGroup[]) {
  confirmedSpecs.value = groups;
  expandedSpecGroups.value = groups.map((_, i) => i);
  const mainSpec = circuitStore.selectedTemplate;
  if (mainSpec) {
    sessionStorage.setItem(`intent_alignment_spec_${mainSpec.templateName}`, JSON.stringify(groups));
  }
}

onMounted(() => {
  loadConfirmedSpecs();
});

defineExpose({
  storeGroups,
  confirmedSpecs,
});
</script>

<template>
  <div class="verification-results h-full flex flex-col overflow-hidden bg-white border-t border-gray-200">
    <div class="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex-shrink-0">
      <span class="text-xs font-semibold text-gray-600">Verification Results</span>
    </div>

    <div class="flex-1 overflow-auto min-h-0">
      <div v-if="!props.constraintIndices.length" class="h-full flex items-center justify-center px-4">
        <span class="text-xs text-gray-400">Select a slice to run verification checks</span>
      </div>

      <template v-else>
        <div class="divide-y divide-gray-100">
          <SectionBlock
            title="Soundness Check"
            :status="steps.soundness.status"
            :summary="steps.soundness.summary"
            :detail="steps.soundness.detail"
            :expanded="expandedStep === 'soundness'"
            :is-available="nextAvailable() === 'soundness'"
            @click="toggleOrRun('soundness')"
          />
          <SectionBlock
            title="Intent Alignment"
            :status="steps.intent.status"
            :summary="steps.intent.summary"
            :detail="steps.intent.detail"
            :expanded="expandedStep === 'intent'"
            :is-available="nextAvailable() === 'intent'"
            @click="toggleOrRun('intent')"
          />

          <div v-if="expandedStep === 'intent' && steps.intent.status === 'passed'" class="px-3 py-2 space-y-2 border-b border-gray-100">
            <div>
              <div class="text-xs font-medium text-gray-600 mb-1">Explanation</div>
              <div class="text-xs p-2 rounded border border-gray-200 bg-gray-50 text-gray-700 whitespace-pre-wrap leading-relaxed">{{ intentSummary }}</div>
            </div>
            <div v-if="intentAmbiguities.length > 0">
              <div class="text-xs font-medium text-amber-600 mb-1">Ambiguities</div>
              <ul class="text-xs p-2 rounded border border-amber-200 bg-amber-50 text-amber-800 space-y-1">
                <li v-for="(a, i) in intentAmbiguities" :key="i" class="pl-3 relative before:content-['•'] before:absolute before:left-0">{{ a }}</li>
              </ul>
            </div>
            <div v-if="intentRiskNotes.length > 0">
              <div class="text-xs font-medium text-orange-600 mb-1">Risk Notes</div>
              <ul class="text-xs p-2 rounded border border-orange-200 bg-orange-50 text-orange-800 space-y-1">
                <li v-for="(r, i) in intentRiskNotes" :key="i" class="pl-3 relative before:content-['•'] before:absolute before:left-0">{{ r }}</li>
              </ul>
            </div>
          </div>

          <div v-if="editableSpecDSL" class="border-b border-gray-200 px-3 py-2">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-gray-600">Spec DSL <span class="text-gray-400 font-normal">(edit before running Formal Conformance)</span></span>
            </div>
            <textarea
              v-model="editableSpecDSL"
              class="spec-editor"
              rows="6"
              spellcheck="false"
            />
            <div v-if="specTranslation" class="mt-1.5 flex flex-wrap gap-1.5 text-xs text-gray-400">
              <el-tag v-if="parseablePosts > 0" size="small" type="success" effect="plain">
                {{ parseablePosts }} parseable post{{ parseablePosts > 1 ? 's' : '' }}
              </el-tag>
              <el-tag v-if="parseableInvariants > 0" size="small" type="success" effect="plain">
                {{ parseableInvariants }} parseable invariant{{ parseableInvariants > 1 ? 's' : '' }}
              </el-tag>
              <el-tag v-if="specParseErrors > 0" size="small" type="danger" effect="plain">
                {{ specParseErrors }} parse error{{ specParseErrors > 1 ? 's' : '' }}
              </el-tag>
            </div>
          </div>

          <SectionBlock
            title="Formal Conformance"
            :status="steps.formal.status"
            :summary="steps.formal.summary"
            :detail="steps.formal.detail"
            :expanded="expandedStep === 'formal'"
            :is-available="nextAvailable() === 'formal'"
            @click="toggleOrRun('formal')"
          >
            <template v-if="editableSpecDSL && (steps.formal.status === 'passed' || steps.formal.status === 'failed')" #action>
              <el-button
                size="small"
                circle
                :loading="steps.formal.status === 'running'"
                @click.stop="reRunFormalConformance"
              >
                <el-icon><Refresh /></el-icon>
              </el-button>
            </template>
          </SectionBlock>

          <div v-if="steps.formal.status === 'failed' && violationData" class="border-t border-gray-200 px-3 py-2">
            <div class="text-xs font-medium text-red-600 mb-1.5">Violation Details</div>
            <div v-if="violationData.violation?.violatedSpec" class="text-xs text-gray-500 mb-2 font-mono break-all">
              {{ violationData.violation.violatedSpec }}
            </div>
            <div class="space-y-1.5">
              <SignalChipSet
                label="Input signals"
                :signals="violationData.violation?.inputValues ?? {}"
                @click-signal="emitSignalClick"
              />
              <SignalChipSet
                label="Output signals"
                :signals="violationData.violation?.outputValues ?? {}"
                @click-signal="emitSignalClick"
              />
            </div>
            <div class="mt-2">
              <el-button
                size="small"
                :loading="adviceLoading"
                @click="requestAiAdvice"
              >
                Ask AI
              </el-button>
            </div>
            <div v-if="adviceResult" class="mt-2 space-y-2">
              <div class="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 whitespace-pre-wrap leading-relaxed">
                {{ adviceResult.explanation }}
              </div>
              <div v-if="adviceResult.fix.description" class="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 whitespace-pre-wrap leading-relaxed">
                {{ adviceResult.fix.description }}
              </div>
              <div v-if="adviceResult.fix.modifiedCode" class="rounded border border-gray-200 overflow-hidden">
                <div class="text-xs font-medium text-gray-600 px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span>Suggested Fix</span>
                  <span class="text-gray-400 font-normal text-[10px]">{{ sourceFileName }}</span>
                </div>
                <div class="max-h-48 overflow-auto">
                  <table class="w-full text-xs font-mono">
                    <tbody>
                      <tr
                        v-for="(line, idx) in modifiedCodeLines"
                        :key="idx"
                        class="leading-5"
                        :class="isChangedLine(idx) ? 'bg-green-50' : ''"
                      >
                        <td class="text-right text-gray-400 pr-3 pl-2 select-none w-10 align-top sticky left-0 bg-inherit">{{ idx + 1 }}</td>
                        <td class="whitespace-pre px-2 text-gray-700"><span v-if="isChangedLine(idx)" class="text-green-600 mr-1">+</span>{{ line }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue';
import { useCircuitStore } from '@/stores/circuit';
import { soundnessCheck, intentAlignment, formalConformance, aiAdvice } from '@/apis';
import type { SoundnessCheckResponse, IntentAlignmentResponse, FormalConformanceResponse } from '@/types/circuitTypes';
import SectionBlock from './SectionBlock.vue';
import SignalChipSet from './SignalChipSet.vue';
import { Refresh } from '@element-plus/icons-vue';

const props = defineProps<{
  constraintIndices: number[];
  activeTargetSignals: string[];
  sliceId: string | null;
}>();

const emit = defineEmits<{
  signalClick: [signalName: string];
}>();

const circuitStore = useCircuitStore();
const expandedStep = ref<string | null>(null);
const editableSpecDSL = ref('');
const adviceLoading = ref(false);
const intentSummary = ref('');
const intentAmbiguities = ref<string[]>([]);
const intentRiskNotes = ref<string[]>([]);
const sourceCode = ref('');
const sourceFileName = ref('');
const sourceLineRange = ref<[number, number]>([0, 0]);

interface AdviceFix {
  description: string;
  modifiedCode: string;
  changedLines: number[];
}

const adviceResult = ref<{ explanation: string; fix: AdviceFix } | null>(null);

interface StepState {
  status: 'idle' | 'running' | 'passed' | 'failed';
  summary: string;
  detail: string;
}

const steps = reactive({
  soundness: { status: 'idle', summary: '', detail: '' } as StepState,
  intent: { status: 'idle', summary: '', detail: '' } as StepState,
  formal: { status: 'idle', summary: '', detail: '' } as StepState,
});

type ViolationData = NonNullable<FormalConformanceResponse['results']>['soundness'];

const specTranslation = ref<FormalConformanceResponse['specTranslation'] | null>(null);
const violationData = ref<ViolationData | null>(null);

const parseablePosts = computed(() => {
  if (!specTranslation.value) return 0;
  return specTranslation.value.posts.filter(p => p.parseable).length;
});

const parseableInvariants = computed(() => {
  if (!specTranslation.value) return 0;
  return specTranslation.value.invariants.filter(i => i.parseable).length;
});

const specParseErrors = computed(() => {
  if (!specTranslation.value) return 0;
  return specTranslation.value.parseErrors.length;
});

const modifiedCodeLines = computed(() => {
  if (!adviceResult.value?.fix.modifiedCode) return [];
  return adviceResult.value.fix.modifiedCode.split('\n');
});

function isChangedLine(lineIndex: number): boolean {
  if (!adviceResult.value) return false;
  return adviceResult.value.fix.changedLines.includes(lineIndex + 1);
}

const order = ['soundness', 'intent', 'formal'] as const;

function nextAvailable(): string | null {
  for (const key of order) {
    if (steps[key].status !== 'passed') return key;
  }
  return null;
}

function toggleOrRun(key: string) {
  if (expandedStep.value === key) {
    expandedStep.value = null;
    return;
  }
  const step = steps[key as keyof typeof steps];
  if (step.status === 'passed' || step.status === 'failed') {
    expandedStep.value = key;
    return;
  }
  if (nextAvailable() === key) {
    executeStep(key);
  }
}

function reRunFormalConformance() {
  if (steps.formal.status === 'running') return;
  steps.formal.status = 'idle';
  steps.formal.summary = '';
  steps.formal.detail = '';
  violationData.value = null;
  adviceResult.value = null;
  specTranslation.value = null;
  executeStep('formal');
}

function emitSignalClick(signalName: string) {
  emit('signalClick', signalName);
}

function getApiParams() {
  return {
    symPath: circuitStore.compilationData.symPath!,
    constraintsJsonPath: circuitStore.compilationData.constraintsJsonPath!,
    repo: circuitStore.parseData.repo,
    entry: circuitStore.parseData.entry,
    templateName: circuitStore.selectedTemplate?.templateName || '',
    templatePath: circuitStore.selectedTemplatePath,
  };
}

async function executeStep(key: string) {
  const apiParams = getApiParams();
  const step = steps[key as keyof typeof steps];
  step.status = 'running';
  step.summary = '';
  step.detail = '';
  expandedStep.value = null;
  adviceResult.value = null;
  violationData.value = null;
  if (key === 'intent') {
    intentSummary.value = '';
    intentAmbiguities.value = [];
    intentRiskNotes.value = [];
    sourceCode.value = '';
    sourceFileName.value = '';
    sourceLineRange.value = [0, 0];
  }

  const sliceIndices = props.constraintIndices.length > 0 ? props.constraintIndices : undefined;

  try {
    if (key === 'soundness') {
      const response: SoundnessCheckResponse = await soundnessCheck({
        repo: apiParams.repo,
        entry: apiParams.entry,
        symPath: apiParams.symPath,
        constraintsJsonPath: apiParams.constraintsJsonPath,
        constraintIndices: sliceIndices,
        queries: { satisfiability: true, determinism: false },
      });
      const sat = response.results?.satisfiability;
      if (sat) {
        step.status = sat.satisfiable ? 'passed' : 'failed';
        step.summary = sat.satisfiable
          ? `SATISFIABLE — ${sat.executionTimeMs?.toFixed(0) || '?'}ms`
          : `UNSAT (contradiction!)`;
        step.detail = sat.satisfiable
          ? `Constraints are satisfiable — at least one valid witness exists.\nModel: ${JSON.stringify(sat.model, null, 2)}`
          : `Constraints are unsatisfiable — no valid witness exists.`;
      } else {
        step.status = 'failed';
        step.summary = 'No result';
        step.detail = response.error || 'Soundness check returned no result.';
      }
    } else if (key === 'intent') {
      const response: IntentAlignmentResponse = await intentAlignment({
        repo: apiParams.repo,
        entry: apiParams.entry,
        symPath: apiParams.symPath,
        constraintsJsonPath: apiParams.constraintsJsonPath,
        constraintIndices: sliceIndices,
        templatePath: apiParams.templatePath,
        templateName: apiParams.templateName,
        groupingStrategy: 'by-template',
      });
      const groupCount = response.groups?.length || 0;
      if (response.success && groupCount > 0) {
        step.status = 'passed';
        step.summary = `${groupCount} intent group${groupCount > 1 ? 's' : ''} found`;
        step.detail = '';
        const specParts: string[] = [];
        const allAmbiguities: string[] = [];
        const allRiskNotes: string[] = [];
        let combinedSummary = '';
        for (const g of response.groups) {
          if (g.llmResult) {
            combinedSummary += (combinedSummary ? '\n\n' : '') +
              `[${g.templateName} lines ${g.lineRange[0]}–${g.lineRange[1]}]\n${g.llmResult.summary}`;
            if (g.llmResult.candidateSpecDSL) {
              specParts.push(g.llmResult.candidateSpecDSL);
            }
            allAmbiguities.push(...g.llmResult.ambiguities);
            allRiskNotes.push(...g.llmResult.riskNotes);
          }
          if (g.error) combinedSummary += `\n\nError: ${g.error}`;
          if (!sourceCode.value && g.sourceSnippet) {
            sourceCode.value = g.sourceSnippet;
            sourceFileName.value = g.sourceFile || '';
            sourceLineRange.value = g.lineRange || [0, 0];
          }
        }
        intentSummary.value = combinedSummary;
        intentAmbiguities.value = allAmbiguities;
        intentRiskNotes.value = allRiskNotes;
        editableSpecDSL.value = specParts.join('\n');
      } else {
        step.status = 'failed';
        step.summary = response.error || 'No intent groups found';
        step.detail = response.error || 'Intent alignment analysis returned no groups.';
      }
    } else if (key === 'formal') {
      if (!editableSpecDSL.value.trim()) {
        step.status = 'failed';
        step.summary = 'No spec to check';
        step.detail = 'Run Intent Alignment first to generate a spec DSL.';
        return;
      }
      const response: FormalConformanceResponse = await formalConformance({
        repo: apiParams.repo,
        entry: apiParams.entry,
        symPath: apiParams.symPath,
        constraintsJsonPath: apiParams.constraintsJsonPath,
        constraintIndices: sliceIndices,
        candidateSpecDSL: editableSpecDSL.value,
        templateName: apiParams.templateName,
        templatePath: apiParams.templatePath,
        queries: { soundness: true, determinism: false },
      });

      specTranslation.value = response.specTranslation || null;

      const soundness = response.results?.soundness;
      if (soundness) {
        if (soundness.noVerifiableSpec) {
          step.status = 'failed';
          step.summary = 'Spec not verifiable';
          const errs = soundness.parseErrors?.length
            ? `\n\nParse errors:\n${soundness.parseErrors.join('\n')}`
            : '';
          step.detail = `The spec DSL could not be translated into SMT2 constraints.${errs}`;
        } else {
          step.status = soundness.conformant ? 'passed' : 'failed';
          step.summary = soundness.conformant
            ? `Conformant — ${soundness.executionTimeMs?.toFixed(0) || '?'}ms`
            : 'NOT conformant';
          if (soundness.conformant) {
            step.detail = `Circuit satisfies spec.\n${soundness.translatedSpecLines || 0} spec lines translated.`;
          } else {
            step.detail = `Soundness violation detected.`;
            violationData.value = soundness;
          }
        }
      } else {
        step.status = 'failed';
        step.summary = response.error || 'No result';
        step.detail = response.error || 'Formal conformance returned no result.';
      }
    }

  } catch (err: any) {
    step.status = 'failed';
    step.summary = err?.response?.data?.error || err?.message || 'Step failed';
    step.detail = step.summary;
  } finally {
    expandedStep.value = key;
  }
}

async function requestAiAdvice() {
  if (!violationData.value) return;
  adviceLoading.value = true;
  adviceResult.value = null;
  try {
    const response = await aiAdvice({
      repo: circuitStore.parseData.repo,
      entry: circuitStore.parseData.entry,
      templateName: circuitStore.selectedTemplate?.templateName || '',
      sourceCode: sourceCode.value,
      sourceFile: sourceFileName.value,
      lineRange: sourceLineRange.value,
      violation: {
        violatedSpec: violationData.value.violation?.violatedSpec || '',
        inputValues: violationData.value.violation?.inputValues || {},
        outputValues: violationData.value.violation?.outputValues || {},
        solverOutput: violationData.value.solverOutput || '',
      },
      specDSL: editableSpecDSL.value,
    });
    if (response.success) {
      adviceResult.value = {
        explanation: response.explanation || '',
        fix: {
          description: response.fix?.description || '',
          modifiedCode: response.fix?.modifiedCode || '',
          changedLines: response.fix?.changedLines || [],
        },
      };
      if (sourceFileName.value && response.fix?.modifiedCode) {
        circuitStore.highlightFiles([sourceFileName.value]);
      }
    } else {
      adviceResult.value = {
        explanation: response.explanation || 'Failed to get advice.',
        fix: { description: '', modifiedCode: '', changedLines: [] },
      };
    }
  } catch (err: any) {
    adviceResult.value = {
      explanation: `Failed to get AI advice: ${err?.message || 'Unknown error'}`,
      fix: { description: '', modifiedCode: '', changedLines: [] },
    };
  } finally {
    adviceLoading.value = false;
  }
}

watch(
  () => props.sliceId,
  () => {
    steps.soundness = { status: 'idle', summary: '', detail: '' };
    steps.intent = { status: 'idle', summary: '', detail: '' };
    steps.formal = { status: 'idle', summary: '', detail: '' };
    editableSpecDSL.value = '';
    specTranslation.value = null;
    violationData.value = null;
    adviceResult.value = null;
    intentSummary.value = '';
    intentAmbiguities.value = [];
    intentRiskNotes.value = [];
    sourceCode.value = '';
    sourceFileName.value = '';
    sourceLineRange.value = [0, 0];
    expandedStep.value = null;
  }
);
</script>

<style scoped>
.spec-editor {
  width: 100%;
  font-family: ui-monospace, 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  padding: 6px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  resize: vertical;
  min-height: 60px;
  background: #fafafa;
  color: #374151;
}

.spec-editor:focus {
  outline: none;
  border-color: #93c5fd;
  background: white;
}
</style>

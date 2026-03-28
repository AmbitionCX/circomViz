<template>
  <div class="h-full flex flex-col min-h-0 overflow-auto">
    <div class="mb-2 flex-shrink-0 flex flex-row-reverse items-center gap-2">
      <el-button
        type="success"
        size="small"
        @click="$emit('confirm')"
        :disabled="groups.length === 0"
      >
        <el-icon class="mr-1"><CircleCheck /></el-icon>
        Confirm
      </el-button>

      <el-button
        type="primary"
        size="small"
        @click="handleRunIntentAlignment"
        :loading="isRunning"
        :disabled="!canRun"
      >
        <el-icon class="mr-1"><ChatDotRound /></el-icon>
        Intent Analysis
      </el-button>

      <el-button
        type="warning"
        size="small"
        @click="handleResolveConstraints"
        :loading="isResolvingConstraints"
        :disabled="!canRun"
      >
        <el-icon class="mr-1"><Document /></el-icon>
        Constraints
      </el-button>
    </div>

    <div v-if="resolvedConstraints.length > 0" class="mb-3 flex-shrink-0">
      <div class="text-xs font-medium text-gray-600 mb-1 flex items-center justify-between">
        <span>Constraints ({{ resolvedConstraints.length }} total, {{ resolvedConstraintSignalCount }} signals)</span>
        <el-button text size="small" @click="resolvedConstraints = []" class="text-gray-400">Clear</el-button>
      </div>
      <div class="max-h-48 overflow-auto border rounded-lg">
        <div
          v-for="(c, cIdx) in resolvedConstraints"
          :key="cIdx"
          class="text-xs font-mono px-2 py-1 border-b last:border-b-0 hover:bg-gray-50 break-all text-gray-700"
        >
          <span class="text-gray-400 mr-2 select-none">{{ cIdx + 1 }}.</span>{{ c.formula }}
        </div>
      </div>
    </div>

    <div v-if="groups.length > 0" class="flex-1 overflow-auto">
      <div class="text-xs text-gray-500 mb-2">
        {{ groups.length }} template{{ groups.length > 1 ? 's' : '' }} analyzed
      </div>

      <el-collapse v-model="expandedGroups">
        <el-collapse-item
          v-for="(group, index) in groups"
          :key="group.groupId"
          :name="index"
        >
          <template #title>
            <div class="flex items-center gap-2 flex-1 pr-2">
              <el-tag
                :type="group.llmResult ? 'success' : group.error ? 'danger' : 'info'"
                size="small"
              >
                {{ group.templateName }}
              </el-tag>
              <span class="text-xs text-gray-500 truncate">
                {{ shortFileName(group.sourceFile) }}:{{ group.lineRange[0] }}-{{ group.lineRange[1] }}
              </span>
              <span class="text-xs text-gray-400">
                ({{ group.normalizedContext.totalConstraints }} constraints)
              </span>
            </div>
          </template>

          <div class="pl-1">
            <!-- Template Signature & Caller -->
            <div class="mb-3 p-2 bg-gray-50 rounded-lg border">
              <div class="text-xs font-mono text-gray-700">{{ group.normalizedContext.templateSignature }}</div>
              <div v-if="group.normalizedContext.callerInfo" class="text-xs text-gray-500 mt-1">
                {{ group.normalizedContext.callerInfo }}
              </div>
            </div>

            <!-- Interface Summary -->
            <div class="mb-3">
              <div class="text-xs font-medium text-gray-600 mb-1">Interface Summary</div>
              <div class="grid grid-cols-2 gap-2">
                <div class="p-2 bg-blue-50 rounded-lg border border-blue-100">
                  <div class="text-xs font-medium text-blue-600 mb-1">
                    Public ({{ group.normalizedContext.interfaceSummary.publicSignals.length }})
                  </div>
                  <div
                    v-for="s in group.normalizedContext.interfaceSummary.publicSignals.slice(0, 10)"
                    :key="s"
                    class="text-xs text-gray-700 font-mono"
                  >{{ s }}</div>
                  <div v-if="group.normalizedContext.interfaceSummary.publicSignals.length > 10" class="text-xs text-gray-400">
                    +{{ group.normalizedContext.interfaceSummary.publicSignals.length - 10 }} more
                  </div>
                </div>
                <div class="p-2 bg-red-50 rounded-lg border border-red-100">
                  <div class="text-xs font-medium text-red-600 mb-1">
                    Private ({{ group.normalizedContext.interfaceSummary.privateSignals.length }})
                  </div>
                  <div
                    v-for="s in group.normalizedContext.interfaceSummary.privateSignals.slice(0, 10)"
                    :key="s"
                    class="text-xs text-gray-700 font-mono"
                  >{{ s }}</div>
                  <div v-if="group.normalizedContext.interfaceSummary.privateSignals.length > 10" class="text-xs text-gray-400">
                    +{{ group.normalizedContext.interfaceSummary.privateSignals.length - 10 }} more
                  </div>
                </div>
              </div>
              <div v-if="group.normalizedContext.interfaceSummary.likelyBooleanFlags.length > 0" class="mt-1">
                <el-tag v-for="f in group.normalizedContext.interfaceSummary.likelyBooleanFlags" :key="f" size="small" type="info" class="mr-1 mb-1">
                  {{ f }}
                </el-tag>
                <span class="text-xs text-gray-400 ml-1">= boolean flags</span>
              </div>
              <div v-if="group.normalizedContext.interfaceSummary.likelyCommitments.length > 0" class="mt-1">
                <el-tag v-for="c in group.normalizedContext.interfaceSummary.likelyCommitments" :key="c" size="small" type="warning" class="mr-1 mb-1">
                  {{ c }}
                </el-tag>
                <span class="text-xs text-gray-400 ml-1">= likely commitments/nullifiers</span>
              </div>
              <div v-if="group.normalizedContext.interfaceSummary.likelyHashes.length > 0" class="mt-1">
                <el-tag v-for="h in group.normalizedContext.interfaceSummary.likelyHashes" :key="h" size="small" type="success" class="mr-1 mb-1">
                  {{ h }}
                </el-tag>
                <span class="text-xs text-gray-400 ml-1">= likely hash/digest</span>
              </div>
            </div>

            <!-- Subcomponent Clusters -->
            <div v-if="group.normalizedContext.subcomponentClusters.length > 0" class="mb-3">
              <div class="text-xs font-medium text-gray-600 mb-1">Subcomponent Clusters (from .sym)</div>
              <div class="flex flex-wrap gap-1">
                <el-tag
                  v-for="cluster in group.normalizedContext.subcomponentClusters"
                  :key="cluster.prefix"
                  size="small"
                  class="mr-1 mb-1"
                >
                  {{ cluster.prefix.split('.').slice(-1)[0] || cluster.prefix }}
                  <span class="text-gray-400 ml-1">({{ cluster.signals.length }}s)</span>
                </el-tag>
              </div>
            </div>

            <!-- Invariant Summary -->
            <div class="mb-3">
              <div class="text-xs font-medium text-gray-600 mb-1">Normalized Invariants</div>
              <pre class="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap">{{ group.normalizedContext.invariantSummary }}</pre>
            </div>

            <!-- Representative Invariants -->
            <div v-if="group.normalizedContext.representativeInvariants.length > 0" class="mb-3">
              <div class="text-xs font-medium text-gray-600 mb-1">Representative Patterns</div>
              <div
                v-for="(inv, iIdx) in group.normalizedContext.representativeInvariants"
                :key="iIdx"
                class="text-xs font-mono p-1.5 rounded mb-1"
                :class="{
                  'bg-green-50': inv.kind === 'boolean',
                  'bg-yellow-50': inv.kind === 'selector_gate',
                  'bg-blue-50': inv.kind === 'multiplication',
                  'bg-purple-50': inv.kind === 'linear_equality',
                  'bg-gray-50': !['boolean', 'selector_gate', 'multiplication', 'linear_equality'].includes(inv.kind),
                }"
              >
                <el-tag size="small" class="mr-1" :type="kindTagType(inv.kind)">{{ inv.kind }}</el-tag>
                {{ inv.description }}
              </div>
            </div>

            <!-- Source Snippet -->
            <div class="mb-3">
              <div class="text-xs font-medium text-gray-600 mb-1">Source Code</div>
              <pre class="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-auto max-h-40">{{ group.sourceSnippet }}</pre>
            </div>

            <!-- Comments -->
            <div v-if="group.metadata.comments.length > 0" class="mb-3">
              <div class="text-xs font-medium text-gray-600 mb-1">Comments</div>
              <div
                v-for="(comment, cIdx) in group.metadata.comments"
                :key="cIdx"
                class="text-xs text-gray-500 italic bg-gray-50 p-1 rounded mb-0.5"
              >
                {{ comment }}
              </div>
            </div>

            <!-- Error -->
            <div v-if="group.error" class="mb-2 p-2 bg-red-50 rounded-lg border border-red-200">
              <div class="text-xs text-red-600">LLM Analysis Error: {{ group.error }}</div>
            </div>

            <!-- LLM Results -->
            <div v-if="group.llmResult" class="border-t pt-2">
              <div class="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                <el-icon><ChatDotRound /></el-icon>
                LLM Analysis
              </div>

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
                  :title="`Ambiguities (${group.llmResult.ambiguities.length})`"
                  :name="group.llmResult.ambiguities.length > 0 ? 'ambiguities' : undefined"
                >
                  <div v-if="group.llmResult.ambiguities.length > 0">
                    <div
                      v-for="(item, aIdx) in group.llmResult.ambiguities"
                      :key="aIdx"
                      class="flex items-start gap-2 mb-1.5"
                    >
                      <el-tag type="warning" size="small" class="mt-0.5 flex-shrink-0">?</el-tag>
                      <span class="text-sm text-gray-700">{{ item }}</span>
                    </div>
                  </div>
                  <div v-else class="text-xs text-gray-400">No ambiguities detected</div>
                </el-collapse-item>

                <el-collapse-item
                  :title="`Risk Notes (${group.llmResult.riskNotes.length})`"
                  :name="group.llmResult.riskNotes.length > 0 ? 'risks' : undefined"
                >
                  <div v-if="group.llmResult.riskNotes.length > 0">
                    <div
                      v-for="(item, rIdx) in group.llmResult.riskNotes"
                      :key="rIdx"
                      class="flex items-start gap-2 mb-1.5"
                    >
                      <el-tag type="danger" size="small" class="mt-0.5 flex-shrink-0">risk</el-tag>
                      <span class="text-sm text-gray-700">{{ item }}</span>
                    </div>
                  </div>
                  <div v-else class="text-xs text-gray-400">No risks detected</div>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <div v-else-if="!isRunning" class="flex-1 flex items-center justify-center">
      <el-empty description="Click 'Intent Analysis' to analyze with LLM" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { CircleCheck, ChatDotRound, Document } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { intentAlignment, resolveConstraints } from '@/apis';
import { ElMessage } from 'element-plus';
import type { IntentAlignmentGroup, ResolvedConstraint, InvariantKind } from '@/types/circuitTypes';

defineEmits<{
  confirm: [];
}>();

const circuitStore = useCircuitStore();

const isRunning = ref(false);
const isResolvingConstraints = ref(false);
const groups = ref<IntentAlignmentGroup[]>([]);
const expandedGroups = ref<number[]>([]);
const resolvedConstraints = ref<ResolvedConstraint[]>([]);
const resolvedConstraintSignalCount = ref(0);

const canRun = computed(() => {
  const { symPath, constraintsJsonPath } = circuitStore.compilationData;
  const { repo, entry } = circuitStore.parseData;
  return !!(symPath && constraintsJsonPath && repo && entry);
});

watch(() => circuitStore.compilationVersion, () => {
  groups.value = [];
  expandedGroups.value = [];
  resolvedConstraints.value = [];
  resolvedConstraintSignalCount.value = 0;
});

const handleResolveConstraints = async () => {
  const { symPath, constraintsJsonPath } = circuitStore.compilationData;
  if (!symPath || !constraintsJsonPath) {
    ElMessage.error('Missing required files');
    return;
  }
  isResolvingConstraints.value = true;
  resolvedConstraints.value = [];
  try {
    const result = await resolveConstraints({ symPath, constraintsJsonPath });
    if (!result.success) throw new Error(result.error || 'Failed');
    resolvedConstraints.value = result.constraints;
    resolvedConstraintSignalCount.value = result.signalCount;
    ElMessage.success(`Loaded ${result.constraints.length} constraints (${result.signalCount} signals)`);
  } catch (error: any) {
    console.error('[IntentAlignment] Resolve constraints error:', error);
    ElMessage.error(error.response?.data?.error || error.message || 'Failed to resolve constraints');
  } finally {
    isResolvingConstraints.value = false;
  }
};

const handleRunIntentAlignment = async () => {
  const { symPath, constraintsJsonPath } = circuitStore.compilationData;
  const repo = circuitStore.parseData.repo;
  const entry = circuitStore.parseData.entry;
  const selectedTemplate = circuitStore.selectedTemplate;
  const selectedTemplatePath = circuitStore.selectedTemplatePath;

  if (!symPath || !constraintsJsonPath || !repo || !entry || !selectedTemplate) {
    ElMessage.error('Missing required data');
    return;
  }

  isRunning.value = true;
  groups.value = [];

  try {
    console.log('[IntentAlignment] Starting request', {
      repo, entry, symPath, constraintsJsonPath,
      templateName: selectedTemplate.templateName,
      templatePath: selectedTemplatePath,
    });

    ElMessage.info('Running intent alignment analysis...');

    const result = await intentAlignment({
      repo, entry, symPath, constraintsJsonPath,
      templatePath: selectedTemplatePath,
      templateName: selectedTemplate.templateName,
      groupingStrategy: 'by-template',
    });

    console.log('[IntentAlignment] Response:', result.success ? `${result.groups?.length} groups` : `error: ${result.error}`);

    if (!result.success) throw new Error(result.error || 'Failed');

    groups.value = result.groups;
    expandedGroups.value = result.groups.map((_, i) => i);

    const successCount = result.groups.filter(g => g.llmResult).length;
    const errorCount = result.groups.filter(g => g.error).length;
    console.log('[IntentAlignment] Groups:', result.groups.map(g => ({
      template: g.templateName,
      invariants: g.normalizedContext.totalConstraints,
      hasLLM: !!g.llmResult,
      error: g.error,
    })));
    ElMessage.success(
      `Done: ${successCount}/${result.groups.length} groups` + (errorCount > 0 ? ` (${errorCount} errors)` : '')
    );
  } catch (error: any) {
    console.error('[IntentAlignment] Error:', error);
    ElMessage.error(error.response?.data?.error || error.message || 'Failed');
  } finally {
    isRunning.value = false;
  }
};

function shortFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts.length > 2 ? parts.slice(-2).join('/') : parts[parts.length - 1];
}

function kindTagType(kind: InvariantKind): 'success' | 'warning' | 'info' | 'danger' {
  switch (kind) {
    case 'boolean': return 'success';
    case 'selector_gate': return 'warning';
    case 'range_check': return 'danger';
    case 'multiplication': return 'info';
    default: return 'info';
  }
}

defineExpose({
  groups,
  isRunning,
  resolvedConstraints,
});
</script>

<template>
  <div>
    <div
      class="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none transition-colors"
      :class="containerClass"
      @click="$emit('click')"
    >
      <div class="flex-shrink-0">
        <el-icon v-if="status === 'passed'" class="text-green-500" :size="14"><CircleCheckFilled /></el-icon>
        <el-icon v-else-if="status === 'failed'" class="text-red-500" :size="14"><CircleCloseFilled /></el-icon>
        <el-icon v-else-if="status === 'running'" class="is-loading text-blue-500" :size="14"><Loading /></el-icon>
        <div v-else class="step-dot" :class="{ 'step-dot-ready': isAvailable }" />
      </div>
      <span class="text-xs font-medium" :class="titleClass">{{ title }}</span>
      <span v-if="summary" class="text-xs truncate" :class="summaryClass">{{ summary }}</span>
      <slot name="action" />
      <el-icon v-if="status === 'passed' || status === 'failed'" class="text-gray-400 flex-shrink-0 transition-transform ml-auto" :size="12">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </el-icon>
    </div>
    <div v-if="expanded && detail" class="px-3 pb-2">
      <div
        class="text-xs p-2 rounded border overflow-auto max-h-36 whitespace-pre-wrap font-mono leading-relaxed"
        :class="detailClass"
      >{{ detail }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Loading, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue';

const props = defineProps<{
  title: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  summary: string;
  detail: string;
  expanded?: boolean;
  isAvailable?: boolean;
}>();

defineEmits<{ click: [] }>();

const containerClass = computed(() => {
  if (props.status === 'passed') return 'section-passed';
  if (props.status === 'failed') return 'section-failed';
  if (props.status === 'running') return 'section-running';
  if (props.isAvailable) return 'section-ready hover:bg-blue-50';
  return 'section-idle';
});

const titleClass = computed(() => {
  if (props.status === 'failed') return 'text-red-700';
  if (props.status === 'idle' && !props.isAvailable) return 'text-gray-400';
  return 'text-gray-700';
});

const summaryClass = computed(() => {
  if (props.status === 'passed') return 'text-green-600';
  if (props.status === 'failed') return 'text-red-500';
  return 'text-gray-500';
});

const detailClass = computed(() => {
  return props.status === 'passed'
    ? 'border-green-200 bg-green-50 text-green-800'
    : 'border-red-200 bg-red-50 text-red-800';
});
</script>

<style scoped>
.step-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #d1d5db;
}
.step-dot-ready {
  border-color: #93c5fd;
}
.section-passed { background: #f0fdf4; }
.section-failed { background: #fef2f2; }
.section-running { background: #eff6ff; }
.section-ready { background: white; }
.section-idle { background: #fafafa; }
</style>

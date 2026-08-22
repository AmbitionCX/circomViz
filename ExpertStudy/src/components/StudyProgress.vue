<template>
  <div class="study-progress">
    <div class="progress-meta">
      <span>{{ section }}</span>
      <span>{{ current }} / {{ total }}</span>
    </div>
    <el-progress
      :percentage="percentage"
      :show-text="false"
      :stroke-width="6"
      color="#4fd1c5"
    />
    <div class="progress-label">{{ label }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  current: number
  total: number
  section: string
  label: string
}>()

const percentage = computed(() => Math.round((props.current / props.total) * 100))
</script>

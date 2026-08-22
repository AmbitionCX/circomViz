<template>
  <div class="task-timer" :class="{ warning: remainingSeconds <= 120, overtime: remainingSeconds <= 0 }">
    <div>
      <span class="timer-label">{{ remainingSeconds > 0 ? '剩余时间' : '已超时' }}</span>
      <strong>{{ formattedTime }}</strong>
    </div>
    <el-progress
      type="circle"
      :percentage="percentage"
      :width="58"
      :stroke-width="5"
      :show-text="false"
      :color="progressColor"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { TASK_TIME_LIMIT_SECONDS } from '@/config/study'

const props = defineProps<{ startedAt?: string }>()
const now = ref(Date.now())
const interval = window.setInterval(() => {
  now.value = Date.now()
}, 1000)

onBeforeUnmount(() => window.clearInterval(interval))

const elapsedSeconds = computed(() => {
  if (!props.startedAt) return 0
  return Math.max(0, Math.floor((now.value - new Date(props.startedAt).getTime()) / 1000))
})

const remainingSeconds = computed(() => TASK_TIME_LIMIT_SECONDS - elapsedSeconds.value)
const percentage = computed(() =>
  Math.max(0, Math.min(100, Math.round((remainingSeconds.value / TASK_TIME_LIMIT_SECONDS) * 100))),
)
const progressColor = computed(() => {
  if (remainingSeconds.value <= 0) return '#e45757'
  if (remainingSeconds.value <= 120) return '#e7a23d'
  return '#35b6a4'
})
const formattedTime = computed(() => {
  const absolute = Math.abs(remainingSeconds.value)
  const minutes = String(Math.floor(absolute / 60)).padStart(2, '0')
  const seconds = String(absolute % 60).padStart(2, '0')
  return `${remainingSeconds.value < 0 ? '+' : ''}${minutes}:${seconds}`
})
</script>

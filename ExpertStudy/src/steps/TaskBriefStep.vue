<template>
  <div class="content-step task-brief-step">
    <div class="task-heading-row">
      <div>
        <span class="slide-kicker">FORMAL TASK {{ task.order }} OF 4</span>
        <h1>{{ stimulus.publicCaseId }}</h1>
      </div>
      <div class="condition-pill" :class="task.condition">
        <span>{{ task.condition === 'circomvis' ? 'CV' : 'BL' }}</span>
        <div>
          <small>CONDITION</small>
          <strong>{{ task.condition === 'circomvis' ? 'CircomVis' : 'Baseline' }}</strong>
        </div>
      </div>
    </div>

    <TaskIntentCard :stimulus="stimulus" />

    <div class="task-prompt">
      <span>YOUR TASK</span>
      <p>{{ STANDARD_TASK_PROMPT }}</p>
    </div>

    <div class="task-start-note">
      <el-icon><Timer /></el-icon>
      <div><strong>点击“开始任务”后启动 10 分钟计时。</strong><p>{{ stimulus.materialsNote }}</p></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Timer } from '@element-plus/icons-vue'
import TaskIntentCard from '@/components/TaskIntentCard.vue'
import { STANDARD_TASK_PROMPT } from '@/config/study'
import { taskStimuli } from '@/config/tasks'
import type { TaskResponse } from '@/types/study'

const props = defineProps<{ task: TaskResponse }>()
const stimulus = computed(() => taskStimuli[props.task.taskId][props.task.example])
</script>

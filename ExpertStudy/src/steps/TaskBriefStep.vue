<template>
  <div class="content-step task-brief-step">
    <div class="task-heading-row">
      <div>
        <span class="slide-kicker">{{ t("task.formal", { order: task.order }) }}</span>
        <h1>{{ stimulus.publicCaseId }}</h1>
        <small class="task-label-small">{{ taskLabel }}</small>
      </div>
      <div class="condition-pill" :class="task.condition">
        <span>{{ task.condition === "circomvis" ? "CV" : "BL" }}</span>
        <div>
          <small>{{ t("task.condition") }}</small>
          <strong>{{ task.condition === "circomvis" ? "CircomVis" : "Baseline" }}</strong>
        </div>
      </div>
    </div>

    <TaskIntentCard :stimulus="stimulus" />

    <div class="task-prompt">
      <span>{{ t("task.promptLabel") }}</span>
      <p>{{ t("task.promptIntro") }}</p>
      <p class="task-time-limit">{{ t("task.timeLimit") }}</p>
      <p>{{ t("task.reportIntro") }}</p>
      <ul>
        <li>{{ t("task.reportJudgment") }}</li>
        <li>{{ t("task.reportMismatch") }}</li>
        <li>{{ t("task.reportEvidence") }}</li>
      </ul>
      <p>{{ t("task.noMismatch") }}</p>
      <div class="think-aloud-prompt">
        <strong>{{ t("task.thinkAloudLabel") }}</strong>
        <p>{{ t("task.thinkAloud") }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import TaskIntentCard from "@/components/TaskIntentCard.vue"
import { useLocale } from "@/composables/useLocale"
import { taskStimuli } from "@/config/tasks"
import type { TaskResponse } from "@/types/study"

const props = defineProps<{ task: TaskResponse }>()
const { t } = useLocale()
const stimulus = computed(() => taskStimuli[props.task.taskId][props.task.example])
const taskLabel = computed(() => {
  const exampleIndex = props.task.example === "A" ? 1 : 2
  const taskNumber = props.task.taskId.replace("T", "Task")
  return `${taskNumber}-Example${exampleIndex}`
})
</script>

<style scoped>
.task-label-small {
  display: inline-block;
  margin-top: 0.125rem;
  font-size: 0.9rem;
  color: var(--el-text-color-secondary);
}
</style>

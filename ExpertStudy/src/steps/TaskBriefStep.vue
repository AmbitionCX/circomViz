<template>
  <div class="content-step task-brief-step">
    <div class="task-heading-row">
      <div>
        <span class="slide-kicker">{{ t("task.formal", { order: task.order }) }}</span>
        <h1>{{ stimulus.publicCaseId }}</h1>
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
      <p>{{ t("task.prompt") }}</p>
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
</script>

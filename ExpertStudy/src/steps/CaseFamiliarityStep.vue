<template>
  <div class="content-step case-familiarity-step">
    <h1>{{ t("case.title") }}</h1>
    <p class="step-intro wide">{{ t("case.intro") }}</p>

    <div class="case-source-list">
      <article v-for="task in tasks" :key="task.taskId" class="case-source-item">
        <div class="case-source-identity">
          <span class="case-source-order">{{ String(task.order).padStart(2, "0") }}</span>
          <div>
            <small>{{ task.publicCaseId }}（{{ taskLabel(task) }}）</small>
            <h2>{{ stimulusFor(task).sourceProject }}</h2>
          </div>
        </div>

        <el-radio-group v-model="task.priorFamiliarity" class="case-familiarity-options">
          <el-radio value="unfamiliar">{{ t("case.unfamiliar") }}</el-radio>
          <el-radio value="project-familiar">{{ t("case.projectFamiliar") }}</el-radio>
          <el-radio value="vulnerability-familiar">{{ t("case.vulnerabilityFamiliar") }}</el-radio>
        </el-radio-group>
      </article>
    </div>

    <el-alert
      v-if="hasVulnerabilityFamiliarity"
      :title="t(`case.warning`)"
      type="warning"
      show-icon
      :closable="false"
      class="case-familiarity-alert"
    />

  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useLocale } from "@/composables/useLocale"
import { taskStimuli } from "@/config/tasks"
import type { TaskResponse } from "@/types/study"

const props = defineProps<{ tasks: TaskResponse[] }>()
const { t } = useLocale()

const hasVulnerabilityFamiliarity = computed(() =>
  props.tasks.some((task) => task.priorFamiliarity === "vulnerability-familiar"),
)

function stimulusFor(task: TaskResponse) {
  return taskStimuli[task.taskId][task.example]
}

function taskLabel(task: TaskResponse) {
  const exampleIndex = task.example === "A" ? 1 : 2
  const taskNumber = task.taskId.replace("T", "Task")
  return `${taskNumber}-Example${exampleIndex}`
}
</script>

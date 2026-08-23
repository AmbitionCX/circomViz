<template>
  <div class="content-step form-step task-response-step">
    <div class="task-heading-row sticky-heading">
      <div>
        <span class="slide-kicker">{{ t("response.kicker", { order: task.order }) }}</span>
        <h1>{{ t("response.title", { caseId: task.publicCaseId }) }}</h1>
      </div>
    </div>
    <p class="step-intro">{{ t("response.intro") }}</p>

    <el-form label-position="top" class="response-form">
      <div class="rating-grid">
        <el-form-item :label="t(`response.confidence`)" required>
          <LikertScale
            v-model="task.confidence"
            :max="7"
            :low-label="t(`response.notConfident`)"
            :high-label="t(`response.completelyConfident`)"
            compact
          />
        </el-form-item>
        <el-form-item :label="t(`response.mentalDemand`)" required>
          <LikertScale
            v-model="task.mentalDemand"
            :max="7"
            :low-label="t(`response.notDemanding`)"
            :high-label="t(`response.extremelyDemanding`)"
            compact
          />
        </el-form-item>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import LikertScale from "@/components/LikertScale.vue"
import { useLocale } from "@/composables/useLocale"
import type { TaskResponse } from "@/types/study"

const { t } = useLocale()

defineProps<{ task: TaskResponse }>()
</script>

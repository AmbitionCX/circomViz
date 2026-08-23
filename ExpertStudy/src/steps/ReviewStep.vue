<template>
  <div class="content-step review-step">
    <span class="slide-kicker">{{ t("review.kicker") }}</span>
    <h1>{{ t("review.title") }}</h1>
    <p class="step-intro">{{ t("review.intro") }}</p>

    <div class="review-summary">
      <div class="summary-stat"><span>{{ t("review.expert") }}</span><strong>{{ session.expertId }}</strong></div>
      <div class="summary-stat"><span>{{ t("review.tasks") }}</span><strong>{{ submittedTasks }} / 4</strong></div>
      <div class="summary-stat"><span>{{ t("review.sus") }}</span><strong>{{ susScore ?? "—" }}</strong></div>
      <div class="summary-stat"><span>{{ t("review.version") }}</span><strong>{{ session.studyVersion }}</strong></div>
    </div>

    <div class="export-panel">
      <div class="export-icon">MD</div>
      <div class="export-copy">
        <h3>{{ t("review.record") }}</h3>
        <p>{{ t("review.recordText") }}</p>
      </div>
      <el-button type="primary" size="large" @click="download">
        <el-icon><Download /></el-icon>
        {{ t("review.download") }}
      </el-button>
    </div>

    <el-checkbox :model-value="confirmed" class="export-confirm" @update:model-value="updateConfirmed">
      {{ t("review.confirm") }}
    </el-checkbox>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { Download } from "@element-plus/icons-vue"
import { useLocale } from "@/composables/useLocale"
import { calculateSusScore } from "@/utils/susScore"
import type { StudySession } from "@/types/study"

const props = defineProps<{
  session: StudySession
  confirmed: boolean
}>()

const emit = defineEmits<{
  download: []
  "update:confirmed": [value: boolean]
}>()
const { t } = useLocale()

const submittedTasks = computed(() => props.session.tasks.filter((task) => task.submittedAt).length)
const susScore = computed(() => calculateSusScore(props.session.susResponses))

function download() {
  emit("download")
}

function updateConfirmed(value: string | number | boolean | undefined) {
  emit("update:confirmed", Boolean(value))
}
</script>

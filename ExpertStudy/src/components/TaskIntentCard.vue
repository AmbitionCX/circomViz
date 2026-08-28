<template>
  <div class="intent-card">
    <div class="intent-section">
      <span class="intent-index">01</span>
      <div>
        <h3>{{ t("task.materials") }}</h3>
        <p>{{ t("task.materialsIntro") }}</p>
      </div>
    </div>
    <div class="intent-section">
      <span class="intent-index">02</span>
      <div>
        <h3>{{ t("task.intentGuide") }}</h3>
        <p>{{ t("task.intentGuideText") }}</p>
      </div>
    </div>
    <div class="intent-section">
      <span class="intent-index">03</span>
      <div>
        <h3>{{ t("task.alignment") }}</h3>
        <p>{{ t("task.alignmentText") }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from "@/composables/useLocale"
import type { TaskStimulus } from "@/types/study"

const { t } = useLocale()

defineProps<{ stimulus: TaskStimulus }>()
</script>

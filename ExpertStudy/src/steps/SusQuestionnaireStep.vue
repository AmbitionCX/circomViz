<template>
  <div class="content-step questionnaire-step">
    <span class="slide-kicker">{{ t("sus.kicker") }}</span>
    <h1>{{ t("sus.title") }}</h1>
    <p class="step-intro">{{ t("sus.intro") }}</p>

    <div class="scale-legend">
      <span>1 · {{ t("scale.stronglyDisagree") }}</span>
      <span>2 · {{ t("scale.disagree") }}</span>
      <span>3 · {{ t("scale.neutral") }}</span>
      <span>4 · {{ t("scale.agree") }}</span>
      <span>5 · {{ t("scale.stronglyAgree") }}</span>
    </div>

    <div v-for="(question, index) in questions" :key="question" class="survey-row">
      <div class="survey-question"><span>{{ String(index + 1).padStart(2, "0") }}</span>{{ question }}</div>
      <el-radio-group v-model="responses[index]" size="small">
        <el-radio-button v-for="value in 5" :key="value" :value="value">{{ value }}</el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useLocale } from "@/composables/useLocale"
import { susQuestions, susQuestionsZh } from "@/config/questionnaires"

const { locale, t } = useLocale()
const questions = computed(() => locale.value === "zh" ? susQuestionsZh : susQuestions)

defineProps<{ responses: number[] }>()
</script>

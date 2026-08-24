<template>
  <div class="content-step questionnaire-step">
    <p class="step-intro questionnaire-intro questionnaire-intro--standalone">{{ t("contribution.intro") }}</p>

    <div class="scale-legend">
      <span>1 · {{ t("scale.stronglyDisagree") }}</span>
      <span>2 · {{ t("scale.disagree") }}</span>
      <span>3 · {{ t("scale.somewhatDisagree") }}</span>
      <span>4 · {{ t("scale.neutral") }}</span>
      <span>5 · {{ t("scale.somewhatAgree") }}</span>
      <span>6 · {{ t("scale.agree") }}</span>
      <span>7 · {{ t("scale.stronglyAgree") }}</span>
    </div>

    <div v-for="(question, index) in questions" :key="question" class="contribution-row">
      <div class="survey-question"><span>{{ String(index + 1).padStart(2, "0") }}</span>{{ question }}</div>
      <el-radio-group v-model="ratings[index]" size="small">
        <el-radio-button v-for="value in 7" :key="value" :value="value">{{ value }}</el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useLocale } from "@/composables/useLocale"
import { contributionQuestions, contributionQuestionsZh } from "@/config/questionnaires"

const { locale, t } = useLocale()
const questions = computed(() => locale.value === "zh" ? contributionQuestionsZh : contributionQuestions)

defineProps<{ ratings: number[] }>()
</script>

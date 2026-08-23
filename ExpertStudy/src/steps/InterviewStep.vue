<template>
  <div class="content-step interview-step">
    <span class="slide-kicker">{{ t("interview.kicker") }}</span>
    <h1>{{ t("interview.title") }}</h1>

    <ul class="interview-list">
      <li v-for="(question, index) in questions" :key="question" class="interview-list-item">
        <span class="interview-number">{{ String(index + 1).padStart(2, "0") }}</span>
        <span class="interview-question">{{ question }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useLocale } from "@/composables/useLocale"
import { interviewQuestions, interviewQuestionsZh } from "@/config/questionnaires"

const { locale, t } = useLocale()
const questions = computed(() => locale.value === "zh" ? interviewQuestionsZh : interviewQuestions)
</script>

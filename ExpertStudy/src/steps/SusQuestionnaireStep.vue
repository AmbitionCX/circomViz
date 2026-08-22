<template>
  <div class="content-step questionnaire-step">
    <span class="slide-kicker">SYSTEM USABILITY SCALE</span>
    <h1>CircomVis 整体可用性</h1>
    <p class="step-intro">请根据使用 CircomVis 完成任务的整体体验回答。每道题均为必填。</p>

    <div class="scale-legend">
      <span>1 · Strongly disagree</span>
      <span>2 · Disagree</span>
      <span>3 · Neutral</span>
      <span>4 · Agree</span>
      <span>5 · Strongly agree</span>
    </div>

    <div v-for="(question, index) in susQuestions" :key="question" class="survey-row">
      <div class="survey-question"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ question }}</div>
      <el-radio-group v-model="responses[index]" size="small">
        <el-radio-button v-for="value in 5" :key="value" :value="value">{{ value }}</el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { susQuestions } from '@/config/questionnaires'

defineProps<{ responses: number[] }>()
</script>

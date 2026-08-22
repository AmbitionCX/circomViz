<template>
  <div class="content-step questionnaire-step">
    <span class="slide-kicker">DESIGN CONTRIBUTIONS</span>
    <h1>视觉调试功能反馈</h1>
    <p class="step-intro">以下是本研究专用的 7 点量表，不属于标准化可用性量表。</p>

    <div v-for="(question, index) in contributionQuestions" :key="question" class="contribution-row">
      <div class="survey-question"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ question }}</div>
      <LikertScale
        v-model="ratings[index]"
        :max="7"
        low-label="Strongly disagree"
        high-label="Strongly agree"
        compact
      />
    </div>

    <el-form-item label="其他整体反馈（可选）" class="feedback-field">
      <el-input v-model="overallFeedback" type="textarea" :rows="3" placeholder="哪些设计最有帮助？哪些地方需要改进？" />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import LikertScale from '@/components/LikertScale.vue'
import { contributionQuestions } from '@/config/questionnaires'

defineProps<{ ratings: number[] }>()
const overallFeedback = defineModel<string>('overallFeedback', { required: true })
</script>

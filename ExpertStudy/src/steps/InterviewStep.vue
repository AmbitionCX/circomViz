<template>
  <div class="content-step interview-step">
    <span class="slide-kicker">SEMI-STRUCTURED INTERVIEW</span>
    <h1>访谈提纲与记录</h1>
    <p class="step-intro">预计 15–20 分钟。以下输入框供研究人员记录要点；完整内容以经同意的录音转录为准。</p>

    <el-collapse v-model="activeNames">
      <el-collapse-item
        v-for="(question, index) in interviewQuestions"
        :key="question"
        :name="index"
      >
        <template #title>
          <span class="interview-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="interview-question">{{ question }}</span>
        </template>
        <el-input
          v-model="notes[index]"
          type="textarea"
          :rows="3"
          placeholder="研究人员记录（可选）"
        />
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { interviewQuestions } from '@/config/questionnaires'

defineProps<{ notes: string[] }>()
const activeNames = ref<number[]>([0])
</script>

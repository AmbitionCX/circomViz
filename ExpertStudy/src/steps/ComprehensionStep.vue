<template>
  <div class="content-step form-step">
    <span class="slide-kicker">COMPREHENSION CHECK</span>
    <h1>开始正式实验前的理解检查</h1>
    <p class="step-intro">请回答以下两个问题。全部正确后才能继续；错误答案可以重新选择。</p>

    <div class="question-card">
      <span>QUESTION 01</span>
      <h3>Which view represents source-level computation?</h3>
      <el-radio-group v-model="result.sourceViewAnswer" class="vertical-options">
        <el-radio value="source-semantics">Source Semantics Graph</el-radio>
        <el-radio value="constraint-enforcement">Constraint Enforcement View</el-radio>
        <el-radio value="compiler-output">Compiler output panel</el-radio>
      </el-radio-group>
    </div>

    <div class="question-card">
      <span>QUESTION 02</span>
      <h3>How can you trace a source node to its generated constraint?</h3>
      <el-radio-group v-model="result.provenanceAnswer" class="vertical-options">
        <el-radio value="hierarchy-only">Only by navigating the template hierarchy</el-radio>
        <el-radio value="provenance-links">Use the coordinated provenance links between the source and constraint views</el-radio>
        <el-radio value="rerun-compiler">Only by rerunning the compiler</el-radio>
      </el-radio-group>
    </div>

    <p v-if="result.attempts" class="attempt-note">已提交 {{ result.attempts }} 次检查。</p>
  </div>
</template>

<script setup lang="ts">
import type { ComprehensionResult } from '@/types/study'

defineProps<{ result: ComprehensionResult }>()
</script>

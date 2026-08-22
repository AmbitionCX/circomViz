<template>
  <div class="content-step centered-step practice-step">
    <span class="slide-kicker">HANDS-ON PRACTICE</span>
    <h1>动手练习</h1>
    <p class="step-intro">练习不计时、不计分。研究人员可以回答界面操作问题，但不会提供调试策略。</p>
    <div class="practice-prompt">
      <span>PRACTICE TASK</span>
      <blockquote>
        Select the component that contributes to the final output and trace one source-level operation to its generated constraint.
      </blockquote>
    </div>
    <div class="practice-checklist">
      <span><el-icon><CircleCheck /></el-icon> 选择相关 component</span>
      <span><el-icon><CircleCheck /></el-icon> 找到 source-level operation</span>
      <span><el-icon><CircleCheck /></el-icon> 追踪到 generated constraint</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CircleCheck } from '@element-plus/icons-vue'
</script>

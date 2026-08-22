<template>
  <div class="content-step">
    <span class="slide-kicker">SYSTEM TRAINING</span>
    <h1>CircomVis 界面培训</h1>
    <p class="step-intro">请跟随研究人员完成约 5 分钟的外部培训视频。本页面不嵌入视频或正式实验案例。</p>
    <div class="training-list">
      <div v-for="(item, index) in items" :key="item" class="training-item">
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
        <p>{{ item }}</p>
      </div>
    </div>
    <div class="researcher-cue">
      <el-icon><VideoPlay /></el-icon>
      <div><strong>研究人员提示</strong><p>现在播放标准化培训材料。不要演示正式任务中的四类 bug。</p></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { VideoPlay } from '@element-plus/icons-vue'

const items = [
  'Template hierarchy 与 component selection',
  'Source Semantics Graph 与 Constraint Enforcement View',
  'Source–constraint provenance tracing',
  'Partial compilation、scope comparison 与 property checking',
  '如何形成并提交最终诊断',
]
</script>

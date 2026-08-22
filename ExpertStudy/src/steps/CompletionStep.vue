<template>
  <div class="hero-step completion-step">
    <div class="completion-check"><el-icon><Check /></el-icon></div>
    <span class="slide-kicker">SESSION COMPLETE</span>
    <h1>感谢你的参与</h1>
    <p class="hero-lead">你的专业经验和诊断过程将帮助我们理解视觉工具如何支持 Circom debugging workflow。</p>
    <div class="completion-actions">
      <el-button size="large" @click="$emit('download')">
        <el-icon><Download /></el-icon>
        再次下载结果
      </el-button>
      <el-button type="danger" plain size="large" @click="$emit('clear')">
        清除本机数据并结束
      </el-button>
    </div>
    <p class="completion-warning">关闭页面前，请由研究人员确认结果文件已经安全保存。</p>
  </div>
</template>

<script setup lang="ts">
import { Check, Download } from '@element-plus/icons-vue'

defineEmits<{
  download: []
  clear: []
}>()
</script>

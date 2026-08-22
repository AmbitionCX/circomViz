<template>
  <div class="content-step form-step">
    <span class="slide-kicker">PARTICIPANT BACKGROUND</span>
    <h1>专业背景</h1>
    <p class="step-intro">我们只收集与实验分析相关的背景信息，不需要填写姓名或联系方式。</p>

    <el-form label-position="top" class="two-column-form">
      <el-form-item label="Circom 使用经验" required>
        <el-input v-model="background.circomYears" placeholder="例如：2 年；约 6 个月" />
      </el-form-item>
      <el-form-item label="对 R1CS 的熟悉程度" required>
        <LikertScale
          v-model="background.r1csFamiliarity"
          :max="7"
          low-label="完全不熟悉"
          high-label="非常熟悉"
          compact
        />
      </el-form-item>
      <el-form-item label="是否开发过生产级 circuit？" required>
        <el-radio-group v-model="background.productionCircuit">
          <el-radio value="yes">是</el-radio>
          <el-radio value="no">否</el-radio>
          <el-radio value="prefer-not">不愿回答</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="是否参与过 ZK security audit？" required>
        <el-radio-group v-model="background.securityAudit">
          <el-radio value="yes">是</el-radio>
          <el-radio value="no">否</el-radio>
          <el-radio value="prefer-not">不愿回答</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="常用调试工具与工作流" required class="form-span-two">
        <el-input
          v-model="background.debuggingTools"
          type="textarea"
          :rows="3"
          placeholder="请简要描述平时如何定位和验证 Circom circuit 问题"
        />
      </el-form-item>
      <el-form-item label="是否见过候选实验案例中的公开漏洞？" required class="form-span-two">
        <el-input
          v-model="background.knownCases"
          type="textarea"
          :rows="2"
          placeholder="没有则填写“没有”；如有，请说明项目或漏洞名称并通知研究人员"
        />
      </el-form-item>
      <el-form-item label="其他说明（可选）" class="form-span-two">
        <el-input v-model="background.notes" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import LikertScale from '@/components/LikertScale.vue'
import type { ParticipantBackground } from '@/types/study'

defineProps<{ background: ParticipantBackground }>()
</script>

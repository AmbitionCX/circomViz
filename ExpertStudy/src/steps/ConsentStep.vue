<template>
  <div class="content-step consent-step">
    <span class="slide-kicker">INFORMED CONSENT</span>
    <h1>知情同意与数据使用说明</h1>
    <p class="step-intro">请在继续之前阅读以下说明。如有任何疑问，请先向研究人员提出。</p>

    <div class="consent-grid">
      <div class="consent-item">
        <el-icon><DocumentChecked /></el-icon>
        <div><strong>研究目的</strong><p>收集专家在 Circom 调试任务中的回答、时间和使用体验，用于学术研究与论文分析。</p></div>
      </div>
      <div class="consent-item">
        <el-icon><User /></el-icon>
        <div><strong>隐私保护</strong><p>研究结果使用匿名专家编号。公开报告不会将回答与您的真实身份关联。</p></div>
      </div>
      <div class="consent-item">
        <el-icon><SwitchButton /></el-icon>
        <div><strong>自愿参与</strong><p>参与完全自愿。您可以拒绝回答或随时退出，不会因此受到不利影响。</p></div>
      </div>
      <div class="consent-item">
        <el-icon><FirstAidKit /></el-icon>
        <div><strong>可能风险</strong><p>本研究风险不高于日常软件使用，但连续调试任务可能造成短暂疲劳或挫败感。</p></div>
      </div>
    </div>

    <el-alert
      title="正式实验前，请由研究团队用通过伦理审查的 consent 文本替换本页草案，并补充研究负责人和联系方式。"
      type="warning"
      :closable="false"
      show-icon
    />

    <div class="consent-checks">
      <el-checkbox v-model="consent.screenRecordingAccepted">
        我同意研究过程中进行屏幕录制，用于分析调试过程。
      </el-checkbox>
      <el-checkbox v-model="consent.audioRecordingAccepted">
        我同意研究过程中进行录音，用于分析 think-aloud 和访谈内容。
      </el-checkbox>
      <el-checkbox v-model="consent.accepted" class="primary-consent">
        我已阅读并理解上述信息，自愿参加本研究。
      </el-checkbox>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DocumentChecked, FirstAidKit, SwitchButton, User } from '@element-plus/icons-vue'
import type { ConsentResponse } from '@/types/study'

defineProps<{ consent: ConsentResponse }>()
</script>

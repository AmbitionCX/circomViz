<template>
  <div class="content-step review-step">
    <span class="slide-kicker">REVIEW & EXPORT</span>
    <h1>检查并保存实验结果</h1>
    <p class="step-intro">正式任务回答已经锁定。请检查完成情况并将结果保存到研究数据目录。</p>

    <div class="review-summary">
      <div class="summary-stat"><span>Expert</span><strong>{{ session.expertId }}</strong></div>
      <div class="summary-stat"><span>Tasks submitted</span><strong>{{ submittedTasks }} / 4</strong></div>
      <div class="summary-stat"><span>SUS score</span><strong>{{ susScore ?? '—' }}</strong></div>
      <div class="summary-stat"><span>Study version</span><strong>{{ session.studyVersion }}</strong></div>
    </div>

    <div class="export-panel">
      <div class="export-icon">MD</div>
      <div class="export-copy">
        <h3>Markdown research record</h3>
        <p>包含 consent 版本、专家背景、任务分配与计时、全部回答、问卷分数和访谈记录。</p>
      </div>
      <el-button type="primary" size="large" @click="$emit('download')">
        <el-icon><Download /></el-icon>
        下载 Markdown
      </el-button>
    </div>

    <el-checkbox :model-value="confirmed" class="export-confirm" @update:model-value="updateConfirmed">
      研究人员已确认 Markdown 文件成功下载并保存到安全位置。
    </el-checkbox>
    <el-alert
      title="完成后仍可在下一页再次下载。只有确认保存成功后，才应清除此浏览器中的本地数据。"
      type="info"
      :closable="false"
      show-icon
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Download } from '@element-plus/icons-vue'
import { calculateSusScore } from '@/utils/susScore'
import type { StudySession } from '@/types/study'

const props = defineProps<{
  session: StudySession
  confirmed: boolean
}>()

const emit = defineEmits<{
  download: []
  'update:confirmed': [value: boolean]
}>()

const submittedTasks = computed(() => props.session.tasks.filter((task) => task.submittedAt).length)
const susScore = computed(() => calculateSusScore(props.session.susResponses))

function updateConfirmed(value: string | number | boolean | undefined) {
  emit('update:confirmed', Boolean(value))
}
</script>

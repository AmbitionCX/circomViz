<template>
  <div class="setup-step">
    <div class="setup-copy">
      <span class="slide-kicker">RESEARCHER SETUP</span>
      <h1>准备一次新的专家实验</h1>
      <p>
        选择匿名专家编号后，系统会自动载入对应的任务顺序、案例版本和实验条件。该页面不会计入参与者进度。
      </p>
      <div class="privacy-callout">
        <el-icon><Lock /></el-icon>
        <span>本应用不连接服务器。所有填写内容仅保存在当前浏览器，并在结束时导出为 Markdown。</span>
      </div>
    </div>

    <el-form label-position="top" class="setup-form" @submit.prevent>
      <el-form-item label="Expert ID" required>
        <el-select v-model="expertId" size="large" placeholder="请选择 E1–E8" style="width: 100%">
          <el-option v-for="id in expertIds" :key="id" :label="id" :value="id" />
        </el-select>
      </el-form-item>
      <el-form-item label="研究人员备注（参与者不可见）">
        <el-input
          v-model="researcherNote"
          type="textarea"
          :rows="3"
          placeholder="可填写 session、设备或案例替换说明"
        />
      </el-form-item>
      <el-alert
        title="开始前，请确认正式任务文案已在 src/config/tasks.ts 中配置。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-button
        class="setup-submit"
        type="primary"
        size="large"
        :disabled="!expertId"
        @click="start"
      >
        创建实验 Session
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight, Lock } from '@element-plus/icons-vue'
import { expertIds, type ExpertId } from '@/types/study'

const props = defineProps<{ initialExpertId?: ExpertId }>()
const emit = defineEmits<{
  start: [expertId: ExpertId, researcherNote: string]
}>()

const expertId = ref<ExpertId | ''>(props.initialExpertId ?? '')
const researcherNote = ref('')

function start() {
  if (expertId.value) emit('start', expertId.value, researcherNote.value.trim())
}
</script>

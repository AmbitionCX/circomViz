<template>
  <div class="content-step form-step task-response-step">
    <div class="task-heading-row sticky-heading">
      <div>
        <span class="slide-kicker">TASK {{ task.order }} RESPONSE</span>
        <h1>提交诊断 · {{ task.publicCaseId }}</h1>
      </div>
      <TaskTimer :started-at="task.startedAt" />
    </div>
    <p class="step-intro">请基于当前实验条件中获得的证据完成诊断。除“可行修复”外均为必填项。</p>

    <el-form label-position="top" class="response-form">
      <div class="response-grid">
        <el-form-item label="缺陷所在的 component / template" required>
          <el-input v-model="task.suspectedComponent" placeholder="请尽可能具体地标明位置" />
        </el-form-item>
        <el-form-item label="具体 source statement 或 constraint" required>
          <el-input v-model="task.sourceOrConstraint" placeholder="文件、行号、节点或约束标识" />
        </el-form-item>
      </div>
      <el-form-item label="Root-cause 解释" required>
        <el-input v-model="task.rootCause" type="textarea" :rows="3" placeholder="解释缺陷是什么以及为什么发生" />
      </el-form-item>
      <el-form-item label="违反的 intended property" required>
        <el-input v-model="task.violatedProperty" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="Supporting source- or constraint-level evidence" required>
        <el-input v-model="task.supportingEvidence" type="textarea" :rows="3" placeholder="说明证据及其与诊断的关系" />
      </el-form-item>
      <el-form-item label="可行修复（可选）">
        <el-input v-model="task.possibleRepair" type="textarea" :rows="2" />
      </el-form-item>

      <div class="rating-grid">
        <el-form-item label="Diagnosis confidence" required>
          <LikertScale
            v-model="task.confidence"
            :max="7"
            low-label="1 · Not confident"
            high-label="7 · Completely confident"
            compact
          />
        </el-form-item>
        <el-form-item label="Mental demand" required>
          <LikertScale
            v-model="task.mentalDemand"
            :max="7"
            low-label="1 · Not demanding"
            high-label="7 · Extremely demanding"
            compact
          />
        </el-form-item>
      </div>

      <el-form-item label="用一句话说明最主要的诊断证据" required>
        <el-input v-model="task.primaryEvidence" maxlength="300" show-word-limit />
      </el-form-item>
      <el-checkbox v-model="task.timedOut">研究人员标记：该任务已超时</el-checkbox>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import LikertScale from '@/components/LikertScale.vue'
import TaskTimer from '@/components/TaskTimer.vue'
import type { TaskResponse } from '@/types/study'

defineProps<{ task: TaskResponse }>()
</script>

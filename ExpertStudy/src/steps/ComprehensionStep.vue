<template>
  <div class="content-step form-step">
    <span class="slide-kicker">{{ t("comprehension.kicker") }}</span>
    <h1>{{ t("comprehension.title") }}</h1>
    <p class="step-intro">{{ t("comprehension.intro") }}</p>

    <div class="question-card">
      <span>{{ t("comprehension.question") }} 01</span>
      <h3>{{ t("comprehension.q1") }}</h3>
      <el-radio-group v-model="result.sourceViewAnswer" class="vertical-options">
        <el-radio value="source-semantics">{{ t("comprehension.q1a") }}</el-radio>
        <el-radio value="constraint-enforcement">{{ t("comprehension.q1b") }}</el-radio>
        <el-radio value="compiler-output">{{ t("comprehension.q1c") }}</el-radio>
      </el-radio-group>
    </div>

    <div class="question-card">
      <span>{{ t("comprehension.question") }} 02</span>
      <h3>{{ t("comprehension.q2") }}</h3>
      <el-radio-group v-model="result.provenanceAnswer" class="vertical-options">
        <el-radio value="hierarchy-only">{{ t("comprehension.q2a") }}</el-radio>
        <el-radio value="provenance-links">{{ t("comprehension.q2b") }}</el-radio>
        <el-radio value="rerun-compiler">{{ t("comprehension.q2c") }}</el-radio>
      </el-radio-group>
    </div>

    <p v-if="result.attempts" class="attempt-note">
      {{ t("comprehension.attempts", { count: result.attempts }) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from "@/composables/useLocale"
import type { ComprehensionResult } from "@/types/study"

const { t } = useLocale()

defineProps<{ result: ComprehensionResult }>()
</script>

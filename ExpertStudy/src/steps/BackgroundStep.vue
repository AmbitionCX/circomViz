<template>
  <div class="content-step form-step">
    <span class="slide-kicker">{{ t("background.kicker") }}</span>
    <h1>{{ t("background.title") }}</h1>
    <p class="step-intro">{{ t("background.intro") }}</p>

    <el-form label-position="top" class="two-column-form">
      <el-form-item :label="t(`background.circomExperience`)" required>
        <el-input v-model="background.circomYears" :placeholder="t(`background.experiencePlaceholder`)" />
      </el-form-item>
      <el-form-item :label="t(`background.r1cs`)" required>
        <LikertScale
          v-model="background.r1csFamiliarity"
          :max="7"
          :low-label="t(`background.notFamiliar`)"
          :high-label="t(`background.veryFamiliar`)"
          compact
        />
      </el-form-item>
      <el-form-item :label="t(`background.production`)" required>
        <el-radio-group v-model="background.productionCircuit">
          <el-radio value="yes">{{ t("background.yes") }}</el-radio>
          <el-radio value="no">{{ t("background.no") }}</el-radio>
          <el-radio value="prefer-not">{{ t("background.preferNot") }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t(`background.audit`)" required>
        <el-radio-group v-model="background.securityAudit">
          <el-radio value="yes">{{ t("background.yes") }}</el-radio>
          <el-radio value="no">{{ t("background.no") }}</el-radio>
          <el-radio value="prefer-not">{{ t("background.preferNot") }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t(`background.tools`)" required class="form-span-two">
        <el-input
          v-model="background.debuggingTools"
          type="textarea"
          :rows="3"
          :placeholder="t(`background.toolsPlaceholder`)"
        />
      </el-form-item>
      <el-form-item :label="t(`background.notes`)" class="form-span-two">
        <el-input
          v-model="background.notes"
          type="textarea"
          :rows="2"
          :placeholder="t(`background.notesPlaceholder`)"
        />
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import LikertScale from "@/components/LikertScale.vue"
import { useLocale } from "@/composables/useLocale"
import type { ParticipantBackground } from "@/types/study"

const { t } = useLocale()

defineProps<{ background: ParticipantBackground }>()
</script>

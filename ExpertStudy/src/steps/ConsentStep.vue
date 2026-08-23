<template>
  <div class="content-step consent-step">
    <span class="slide-kicker">{{ t("consent.kicker") }}</span>
    <h1>{{ t("consent.title") }}</h1>
    <p class="step-intro">{{ t("consent.intro") }}</p>

    <div class="consent-grid">
      <div class="consent-item">
        <el-icon><DocumentChecked /></el-icon>
        <div><strong>{{ t("consent.purposeTitle") }}</strong><p>{{ t("consent.purposeText") }}</p></div>
      </div>
      <div class="consent-item">
        <el-icon><User /></el-icon>
        <div><strong>{{ t("consent.privacyTitle") }}</strong><p>{{ t("consent.privacyText") }}</p></div>
      </div>
      <div class="consent-item">
        <el-icon><SwitchButton /></el-icon>
        <div><strong>{{ t("consent.voluntaryTitle") }}</strong><p>{{ t("consent.voluntaryText") }}</p></div>
      </div>
      <div class="consent-item">
        <el-icon><FirstAidKit /></el-icon>
        <div><strong>{{ t("consent.riskTitle") }}</strong><p>{{ t("consent.riskText") }}</p></div>
      </div>
    </div>

    <div class="consent-checks">
      <el-checkbox v-model="consent.screenRecordingAccepted">{{ t("consent.screen") }}</el-checkbox>
      <el-checkbox v-model="consent.audioRecordingAccepted">{{ t("consent.audio") }}</el-checkbox>
      <el-checkbox v-model="consent.accepted" class="primary-consent">{{ t("consent.accept") }}</el-checkbox>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DocumentChecked, FirstAidKit, SwitchButton, User } from "@element-plus/icons-vue"
import { useLocale } from "@/composables/useLocale"
import type { ConsentResponse } from "@/types/study"

const { t } = useLocale()

defineProps<{ consent: ConsentResponse }>()
</script>

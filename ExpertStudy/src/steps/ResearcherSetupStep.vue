<template>
  <div class="setup-step">
    <div class="setup-copy">
      <span class="slide-kicker">{{ t("setup.kicker") }}</span>
      <h1>{{ t("setup.title") }}</h1>

      <div class="privacy-callout">
        <el-icon><Lock /></el-icon>
        <span>{{ t("setup.privacy") }}</span>
      </div>
    </div>

    <el-form label-position="top" class="setup-form" @submit.prevent>
      <el-form-item :label="t(`setup.expertId`)" required>
        <el-select v-model="expertId" size="large" :placeholder="t(`setup.selectExpert`)" style="width: 100%">
          <el-option v-for="id in expertIds" :key="id" :label="id" :value="id" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t(`setup.note`)" >
        <el-input
          v-model="researcherNote"
          type="textarea"
          :rows="3"
          :placeholder="t(`setup.notePlaceholder`)"
        />
      </el-form-item>

      <el-button
        class="setup-submit"
        type="primary"
        size="large"
        :disabled="!expertId"
        @click="start"
      >
        {{ t("setup.start") }}
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { ArrowRight, Lock } from "@element-plus/icons-vue"
import { useLocale } from "@/composables/useLocale"
import { expertIds, type ExpertId } from "@/types/study"

const props = defineProps<{ initialExpertId?: ExpertId }>()
const emit = defineEmits<{
  start: [expertId: ExpertId, researcherNote: string]
}>()
const { t } = useLocale()

const expertId = ref<ExpertId | "">(props.initialExpertId ?? "")
const researcherNote = ref("")

function start() {
  if (expertId.value) emit("start", expertId.value, researcherNote.value.trim())
}
</script>

<template>
  <div class="hero-step completion-step">
    <div class="completion-check"><el-icon><Check /></el-icon></div>
    <span class="slide-kicker">{{ t("completion.kicker") }}</span>
    <h1>{{ t("completion.title") }}</h1>
    <p class="hero-lead">{{ t("completion.lead") }}</p>
    <div class="completion-actions">
      <el-button size="large" @click="download">
        <el-icon><Download /></el-icon>
        {{ t("completion.download") }}
      </el-button>
      <el-button type="danger" plain size="large" @click="clear">
        {{ t("completion.clear") }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check, Download } from "@element-plus/icons-vue"
import { useLocale } from "@/composables/useLocale"

const { t } = useLocale()

const emit = defineEmits<{
  download: []
  clear: []
}>()

function download() {
  emit("download")
}

function clear() {
  emit("clear")
}
</script>

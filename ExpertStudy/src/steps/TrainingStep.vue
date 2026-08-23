<template>
  <div class="content-step">
    <span class="slide-kicker">{{ t("training.kicker") }}</span>
    <h1>{{ t("training.title") }}</h1>
    <p class="step-intro">{{ t("training.intro") }}</p>
    <div class="training-list">
      <div v-for="(item, index) in items" :key="item" class="training-item">
        <span>{{ String(index + 1).padStart(2, "0") }}</span>
        <p>{{ item }}</p>
      </div>
    </div>
    <div class="researcher-cue">
      <el-icon><VideoPlay /></el-icon>
      <div><strong>{{ t("training.hint") }}</strong><p>{{ t("training.hintText") }}</p></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { VideoPlay } from "@element-plus/icons-vue"
import { useLocale } from "@/composables/useLocale"

const { t } = useLocale()
const items = computed(() => [
  t("training.item1"),
  t("training.item2"),
  t("training.item3"),
  t("training.item4"),
  t("training.item5"),
])
</script>

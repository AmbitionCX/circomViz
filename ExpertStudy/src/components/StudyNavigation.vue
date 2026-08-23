<template>
  <nav class="study-navigation" :aria-label="t('nav.label')">
    <el-button
      v-if="showBack"
      class="navigation-arrow navigation-arrow--back"
      size="large"
      circle
      plain
      :aria-label="t(`nav.back`)"
      :title="t(`nav.back`)"
      @click="back"
    >
      <el-icon><ArrowLeft /></el-icon>
    </el-button>
    <el-button
      v-if="showNext"
      class="navigation-arrow navigation-arrow--next"
      type="primary"
      size="large"
      circle
      :disabled="nextDisabled"
      :aria-label="nextLabel"
      :title="nextLabel"
      @click="next"
    >
      <el-icon><ArrowRight /></el-icon>
    </el-button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue"
import { useLocale } from "@/composables/useLocale"

const props = withDefaults(
  defineProps<{
    showBack?: boolean
    showNext?: boolean
    nextDisabled?: boolean
    nextLabel?: string
  }>(),
  {
    showBack: true,
    showNext: true,
    nextDisabled: false,
  },
)

const emit = defineEmits<{
  back: []
  next: []
}>()
const { t } = useLocale()
const nextLabel = computed(() => props.nextLabel ?? t("nav.next"))

function back() {
  emit("back")
}

function next() {
  emit("next")
}
</script>

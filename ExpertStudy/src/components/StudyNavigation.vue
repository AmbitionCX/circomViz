<template>
  <footer class="study-navigation">
    <el-button v-if="showBack" size="large" plain @click="$emit('back')">
      上一步
    </el-button>
    <span v-else />
    <span class="autosave-note">答案会自动保存在本机</span>
    <el-button
      v-if="showNext"
      type="primary"
      size="large"
      :disabled="nextDisabled"
      @click="$emit('next')"
    >
      {{ nextLabel }}
      <el-icon class="el-icon--right"><ArrowRight /></el-icon>
    </el-button>
  </footer>
</template>

<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue'

withDefaults(
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
    nextLabel: '下一步',
  },
)

defineEmits<{
  back: []
  next: []
}>()
</script>

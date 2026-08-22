<template>
  <div class="likert-scale" :class="{ compact }">
    <div class="likert-edge-label">{{ lowLabel }}</div>
    <el-radio-group :model-value="modelValue" @update:model-value="updateValue">
      <el-radio-button v-for="value in max" :key="value" :value="value">
        {{ value }}
      </el-radio-button>
    </el-radio-group>
    <div class="likert-edge-label right">{{ highLabel }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: number
    max: number
    lowLabel: string
    highLabel: string
    compact?: boolean
  }>(),
  { compact: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

function updateValue(value: string | number | boolean | undefined) {
  emit('update:modelValue', Number(value))
}
</script>

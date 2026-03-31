<template>
  <div>
    <div class="text-xs text-gray-500 mb-1">{{ label }}</div>
    <div class="flex flex-wrap gap-1">
      <button
        v-for="(value, name) in signals"
        :key="name"
        class="signal-chip"
        @click="$emit('clickSignal', name)"
      >
        {{ name }}<span class="text-gray-400 ml-0.5">={{ value }}</span>
      </button>
      <span v-if="Object.keys(signals).length === 0" class="text-xs text-gray-400">(none)</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  signals: Record<string, string>;
}>();

defineEmits<{
  clickSignal: [signalName: string];
}>();
</script>

<style scoped>
.signal-chip {
  display: inline-flex;
  align-items: center;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  padding: 1px 6px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 3px;
  color: #92400e;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.4;
}
.signal-chip:hover {
  background: #fde68a;
  border-color: #f59e0b;
}
</style>

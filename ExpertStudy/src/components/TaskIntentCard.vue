<template>
  <div class="intent-card">
    <div class="intent-section">
      <span class="intent-index">01</span>
      <div>
        <h3>功能说明</h3>
        <p>{{ stimulus.functionDescription }}</p>
      </div>
    </div>
    <div class="intent-section">
      <span class="intent-index">02</span>
      <div>
        <h3>输入与输出</h3>
        <p>{{ stimulus.inputOutputSemantics }}</p>
      </div>
    </div>
    <div class="intent-section">
      <span class="intent-index">03</span>
      <div>
        <h3>应满足的关键性质</h3>
        <ul>
          <li v-for="property in stimulus.intendedProperties" :key="property">{{ property }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskStimulus } from '@/types/study'

defineProps<{ stimulus: TaskStimulus }>()
</script>

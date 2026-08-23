<template>
  <div class="intent-card">
    <div class="intent-section">
      <span class="intent-index">01</span>
      <div>
        <h3>{{ t("task.function") }}</h3>
        <p>{{ pick(stimulus.functionDescription, stimulus.functionDescriptionEn) }}</p>
      </div>
    </div>
    <div class="intent-section">
      <span class="intent-index">02</span>
      <div>
        <h3>{{ t("task.io") }}</h3>
        <p>{{ pick(stimulus.inputOutputSemantics, stimulus.inputOutputSemanticsEn) }}</p>
      </div>
    </div>
    <div class="intent-section">
      <span class="intent-index">03</span>
      <div>
        <h3>{{ t("task.properties") }}</h3>
        <ul>
          <li v-for="property in pick(stimulus.intendedProperties, stimulus.intendedPropertiesEn)" :key="property">
            {{ property }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from "@/composables/useLocale"
import type { TaskStimulus } from "@/types/study"

const { t, pick } = useLocale()

defineProps<{ stimulus: TaskStimulus }>()
</script>

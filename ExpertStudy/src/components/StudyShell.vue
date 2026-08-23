<template>
  <div class="study-app">
    <div class="language-switcher" :aria-label="t('language.label')">
      <el-segmented v-model="locale" :options="languageOptions" size="small" />
    </div>
    <main class="study-main">
      <StudyProgress
        v-if="progress"
        :current="progress.current"
        :total="progress.total"
        :section="progress.section"
        :label="progress.label"
      />
      <section class="slide-card" :class="{ 'setup-card': !progress }">
        <slot />
      </section>
    </main>

    <slot name="navigation" />
  </div>
</template>

<script setup lang="ts">
import StudyProgress from './StudyProgress.vue'
import { languageOptions, useLocale } from '@/composables/useLocale'

const { locale, t } = useLocale()

defineProps<{
  progress?: {
    current: number
    total: number
    section: string
    label: string
  }
}>()
</script>

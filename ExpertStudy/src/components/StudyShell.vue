<template>
  <div class="study-app">
    <header class="app-header">
      <div class="brand-lockup">
        <div class="brand-mark">CV</div>
        <div>
          <div class="eyebrow">EXPERT STUDY</div>
          <div class="brand-title">CircomVis</div>
        </div>
      </div>
      <div v-if="expertId" class="participant-badge">
        <span>Participant</span>
        <strong>{{ expertId }}</strong>
      </div>
    </header>

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
import type { ExpertId } from '@/types/study'

defineProps<{
  expertId?: ExpertId
  progress?: {
    current: number
    total: number
    section: string
    label: string
  }
}>()
</script>

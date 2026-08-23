<template>
  <div class="hero-step break-step">
    <span class="slide-kicker">{{ t("break.kicker") }}</span>
    <div class="break-number">05:00</div>
    <h1>{{ t("break.title") }}</h1>
    <p class="hero-lead">{{ t("break.lead") }}</p>
    <div class="break-reminders">
      <span>{{ t("break.reminder1") }}</span><i />
      <span>{{ t("break.reminder2") }}</span><i />
      <span>{{ t("break.reminder3") }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from "@/composables/useLocale"

const { t } = useLocale()
</script>

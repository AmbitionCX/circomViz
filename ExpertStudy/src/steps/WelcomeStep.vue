<template>
  <div class="hero-step">
    <div class="hero-orbit orbit-one" />
    <div class="hero-orbit orbit-two" />
    <span class="slide-kicker">{{ t("welcome.kicker") }}</span>
    <h1>{{ t("welcome.titleLine1") }}<br />{{ t("welcome.titleLine2") }}</h1>
    <p class="hero-lead">{{ t("welcome.lead") }}</p>
    <div class="feature-row">
      <div class="feature-chip">
        <span>01</span>
        <strong>{{ t("welcome.feature1Title") }}</strong>
        <p>{{ t("welcome.feature1Text") }}</p>
      </div>
      <div class="feature-chip">
        <span>02</span>
        <strong>{{ t("welcome.feature2Title") }}</strong>
        <p>{{ t("welcome.feature2Text") }}</p>
      </div>
      <div class="feature-chip">
        <span>03</span>
        <strong>{{ t("welcome.feature3Title") }}</strong>
        <p>{{ t("welcome.feature3Text") }}</p>
      </div>
    </div>
    <div class="duration-note">{{ t("welcome.duration") }}</div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from "@/composables/useLocale"

const { t } = useLocale()
</script>

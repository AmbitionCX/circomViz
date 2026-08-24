<template>
  <div class="content-step interview-step interview-step--concealed">
    <div class="interview-placeholder">{{ t("interview.title") }}</div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from "@/composables/useLocale"

const { t } = useLocale()
</script>

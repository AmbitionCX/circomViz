<template>
  <div class="content-step centered-step practice-step">
    <span class="slide-kicker">{{ t("practice.kicker") }}</span>
    <h1>{{ t("practice.title") }}</h1>
    <p class="step-intro">{{ t("practice.intro") }}</p>
    <div class="practice-example">
      <ul>
        <li v-for="example in examples" :key="example.name">
          <code>{{ example.name }}: {{ example.description }}</code>
        </li>
      </ul>
    </div>
    <div class="practice-checklist">
      <span><el-icon><CircleCheck /></el-icon> {{ t("practice.check1") }}</span>
      <span><el-icon><CircleCheck /></el-icon> {{ t("practice.check2") }}</span>
      <span><el-icon><CircleCheck /></el-icon> {{ t("practice.check3") }}</span>
      <span><el-icon><CircleCheck /></el-icon> {{ t("practice.check4") }}</span>
    </div>
    <p class="practice-note">{{ t("practice.note") }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { CircleCheck } from "@element-plus/icons-vue"
import { useLocale } from "@/composables/useLocale"

const { t } = useLocale()
const examples = computed(() => [
  { name: "DonationMatch", description: t("practice.example1") },
  { name: "GoldDiscount", description: t("practice.example2") },
  { name: "LoyaltyReward", description: t("practice.example3") },
  { name: "MerkleRoot2", description: t("practice.example4") },
  { name: "Payroll", description: t("practice.example5") },
  { name: "TwoFactorLogin", description: t("practice.example6") },
  { name: "WithdrawalLimit", description: t("practice.example7") },
])
</script>

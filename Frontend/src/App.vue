<template>
  <el-container class="h-screen">
    <el-header class="bg-indigo-900">
      <h1 class="text-base text-white font-bold p-2">Visual Assistance System for Circom Programming</h1>
    </el-header>
    <el-main class="bg-gray-100 pt-2">
      <el-row class="h-full w-full">
        <el-col :span="8" class="h-full">
          <!-- A: Circom Code Input Area -->
          <div class="h-3/4 w-full bg-white p-4 mb-2 rounded-lg shadow-custom shadow-exposed-bottom">
            <CircomCode />
          </div>
          <!-- C: Signal Selection -->
          <div class="h-1/4 w-full bg-white p-4 mb-2 rounded-lg shadow-custom shadow-exposed-bottom">
            <SignalSelection class="h-full w-full" />
          </div>
        </el-col>
        <el-col :span="16" class="h-full pl-2">
          <!-- B: Circuit View -->
          <div class="h-1/2 w-full bg-white p-4 mb-2 rounded-lg shadow-custom shadow-exposed-bottom">
            <CircuitView />
          </div>
          <!-- D: Restriction View -->
          <div class="h-1/2 w-full bg-white p-4 mb-2 rounded-lg shadow-custom shadow-exposed-bottom">
            <RestrictionView />
          </div>
        </el-col>
      </el-row>
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import CircomCode from './components/CircomCode.vue';
import CircuitView from './components/CircuitView.vue';
import SignalSelection from './components/SignalSelection.vue';
import RestrictionView from './components/RestrictionView.vue';
</script>

<style scoped>
.el-header {
  --el-header-height: fit-content;
}

.shadow-custom {
  box-shadow: 0 4px 8px -2px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.shadow-exposed-bottom {
  position: relative;
}

.shadow-exposed-bottom::after {
  content: "";
  position: absolute;
  bottom: -10px;
  left: 0;
  width: 100%;
  height: 10px;
  box-shadow: 0 4px 8px -2px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
}
</style>

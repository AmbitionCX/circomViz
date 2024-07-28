<template>
  <el-container class="h-screen">
    <el-header class="bg-gray-800 text-white p-4">
      <h1 class="text-2xl">Circom Visual Programming System</h1>
    </el-header>
    <el-main class="p-4 bg-gray-100">
      <el-row :gutter="20" class="h-full">
        <el-col :span="6" class="h-full">
          <!-- A: Circom Code Input Area -->
          <div class="h-full bg-white p-4 rounded-lg shadow-md">
            <CircomCode />
          </div>
        </el-col>
        <el-col :span="18" class="h-full">
          <!-- B: Circuit View -->
          <div class="h-1/2 p-4 mb-4">
            <div class="h-full w-full bg-white rounded-lg shadow-custom shadow-exposed-bottom">
              <CircuitView class="h-full w-full p-4" />
            </div>
          </div>
          <!-- C & D: Signal Selection and Restriction View -->
          <div class="h-1/2 grid grid-cols-2 gap-4">
            <div class="bg-white p-4 rounded-lg shadow-custom">
              <SignalSelection class="h-full w-full" />
            </div>
            <div class="bg-white p-4 rounded-lg shadow-custom shadow-exposed-bottom">
              <RestrictionView class="h-full w-full" />
            </div>
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
  /* Adjust the value to expose more or less of the bottom shadow */
  left: 0;
  width: 100%;
  height: 10px;
  /* Match this to the offset in the bottom property */
  box-shadow: 0 4px 8px -2px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
}
</style>

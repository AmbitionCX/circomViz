<template>
  <div class="content-step centered-step">
    <span class="slide-kicker">STANDARDIZED ENVIRONMENTS</span>
    <h1>两种实验条件</h1>
    <p class="step-intro wide">四个正式任务将使用两种实验环境。两种条件拥有相同的源码、编译器设置、任务说明和时间限制。</p>
    <div class="condition-grid">
      <div class="condition-card baseline">
        <span class="condition-code">BL</span>
        <h2>Baseline</h2>
        <p>使用研究人员提供的标准代码编辑器、Circom source、compiler output、<code>--inspect</code>、<code>.sym</code> 与 R1CS 信息。</p>
      </div>
      <div class="condition-card circomvis">
        <span class="condition-code">CV</span>
        <h2>CircomVis</h2>
        <p>使用完整的视觉调试系统，包括层级导航、协调视图、provenance、scope comparison、partial compilation 与 property checking。</p>
      </div>
    </div>
    <el-alert
      title="每个任务只能使用页面指定的实验条件。研究人员只回答界面操作问题，不提供调试策略。"
      type="info"
      :closable="false"
      show-icon
    />
  </div>
</template>

<template>
  <div class="signal-selection-container h-full flex flex-col overflow-hidden">
    <div class="flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-2">
        <h2 class="view-title text-base font-bold text-gray-800">Signal View</h2>
        <el-tooltip content="View all signals organized by source file and template" placement="top">
          <el-icon class="text-gray-400 cursor-help">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>

      </div>
      <div class="flex items-center justify-end text-xs text-gray-500">
        <div class="flex items-center mr-2">
          <el-icon class="text-blue-500"><CircleCheck /></el-icon>
          <span>Input</span>
        </div>
        <div class="flex items-center mr-2">
          <el-icon class="text-green-500"><CircleCheckFilled /></el-icon>
          <span>Output</span>
        </div>
        <div class="flex items-center mr-2">
          <el-icon class="text-gray-500"><RemoveFilled /></el-icon>
          <span>Intermediate</span>
        </div>
      </div>
    </div>
    
    <div class="flex-1 overflow-auto min-h-0 mt-2">
      <el-empty v-if="!isParsed" description="No circuit loaded" :image-size="80" />
      
      <el-tree
        v-else-if="signalFileTree.length > 0"
        :data="signalFileTree"
        :props="treeProps"
        default-expand-all
        :expand-on-click-node="false"
        node-key="id"
        class="signal-tree"
        @click.stop
      >
        <template #default="{ data }">
          <!-- File node -->
          <div
            v-if="data.type === 'file'"
            :class="['tree-node-content file-node', { 'file-node-highlighted': isFileHighlighted(data.sourceFile) }]"
            @dblclick.stop="handleNodeDblClick(data)"
          >
            <el-icon class="mr-1 text-gray-400"><Document /></el-icon>
            <span class="file-name">{{ data.name }}</span>
            <el-tag v-if="extractNodeModulesPackage(data.sourceFile)" size="small" type="info" class="ml-2">
              {{ extractNodeModulesPackage(data.sourceFile) }}
            </el-tag>
          </div>
          <!-- Template node -->
          <div v-else-if="data.type === 'template'" class="tree-node-content template-node" @dblclick.stop="handleNodeDblClick(data)">
            <el-icon class="mr-1 text-indigo-500"><Box /></el-icon>
            <span class="signal-name" :style="templateColorStyle(data.templateName)">{{ data.templateName }}</span>
            <el-tag size="small" type="info" class="ml-2">{{ data.signalCount }}</el-tag>
          </div>
          <!-- Signal node -->
          <div v-else class="tree-node-content" @dblclick.stop="handleNodeDblClick(data)">
            <el-icon v-if="data.kind === 'input'" class="mr-1 text-blue-500">
              <CircleCheck />
            </el-icon>
            <el-icon v-else-if="data.kind === 'output'" class="mr-1 text-green-500">
              <CircleCheckFilled />
            </el-icon>
            <el-icon v-else class="mr-1 text-gray-500">
              <RemoveFilled />
            </el-icon>
            <span class="signal-name">{{ data.name }}</span>
            <el-tag v-if="data.isArray" size="small" type="info" class="ml-2">Array</el-tag>
          </div>
        </template>
      </el-tree>
      
      <el-empty v-else description="No signals found" :image-size="80" />
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="70%"
      top="5vh"
      destroy-on-close
      @opened="scrollToHighlight"
    >
      <pre class="file-content-viewer hljs"><table class="w-full"><tbody><tr v-for="(line, idx) in displayLines" :key="idx"><td class="line-num">{{ idx + 1 }}</td><td class="line-content" v-html="line"></td></tr></tbody></table></pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { CircleCheck, CircleCheckFilled, RemoveFilled, QuestionFilled, Document, Box } from '@element-plus/icons-vue';
import { useCircuitStore } from '@/stores/circuit';
import { getFileContent } from '@/apis';
import { ElMessage } from 'element-plus';
import { hexToRgba } from '@/composables/colors';
import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import 'highlight.js/styles/github-dark.css';

hljs.registerLanguage('c', c);
import type { SignalInfo, TemplateInfo } from '@/types/circuitTypes';

const circuitStore = useCircuitStore();

function templateColorStyle(templateName: string) {
  const color = circuitStore.getTemplateColor(templateName);
  return {
    backgroundColor: hexToRgba(color, 0.15),
    color: color,
    borderRadius: '4px',
    padding: '1px 6px',
    fontWeight: '600' as const,
  };
}

const treeProps = {
  children: 'children',
  label: 'name'
};

const dialogVisible = ref(false);
const dialogTitle = ref('');
const fileContent = ref('');
const highlightKeyword = ref('');
const highlightedContent = computed(() => {
  if (!fileContent.value) return '';
  const highlighted = hljs.highlight(fileContent.value, { language: 'c' }).value;
  if (!highlightKeyword.value) return highlighted;

  const keyword = highlightKeyword.value;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})(?![^<]*>)`, 'g');
  return highlighted.replace(regex, '<mark class="highlight-name">$1</mark>');
});

const displayLines = computed(() => {
  const html = highlightedContent.value;
  if (!html) return [];
  return html.split('\n');
});

const isParsed = computed(() => circuitStore.isParsed);

const signalFileTree = computed(() => {
  if (!isParsed.value || !circuitStore.parseData.tree) return [];
  return buildSignalFileTree(circuitStore.parseData.tree, circuitStore.filteredSignals);
});


async function handleNodeDblClick(data: any) {
  let sourceFile = '';
  if (data.type === 'file') {
    sourceFile = data.sourceFile;
    highlightKeyword.value = '';
  } else if (data.type === 'template') {
    sourceFile = data.sourceFile;
    highlightKeyword.value = data.templateName;
  } else {
    sourceFile = data.sourceFile;
    highlightKeyword.value = data.name;
  }

  if (!sourceFile) return;

  dialogTitle.value = sourceFile.split('/').pop() || sourceFile;
  fileContent.value = 'Loading...';
  dialogVisible.value = true;

  try {
    const result = await getFileContent({ filePath: sourceFile });
    if (!result.success || !result.content) {
      throw new Error(result.error || 'Failed to load file');
    }
    dialogTitle.value = result.fileName || sourceFile.split('/').pop() || sourceFile;
    fileContent.value = result.content;
    await nextTick();
    scrollToHighlight();
  } catch (error: any) {
    fileContent.value = '';
    ElMessage.error(error.response?.data?.error || error.message || 'Failed to load file');
    dialogVisible.value = false;
  }
}

function scrollToHighlight() {
  const mark = document.querySelector('.file-content-viewer .highlight-name');
  if (mark) {
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

const highlightedFilePaths = ref<Set<string>>(new Set());

function isFileHighlighted(sourceFile: string | undefined): boolean {
  if (!sourceFile) return false;
  return highlightedFilePaths.value.has(sourceFile);
}

watch(
  () => circuitStore.fileHighlight?.version,
  () => {
    const hl = circuitStore.fileHighlight;
    if (!hl || hl.filePaths.length === 0) return;
    highlightedFilePaths.value = new Set(hl.filePaths);
    nextTick(() => {
      const el = document.querySelector('.file-node-highlighted');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
);

function extractBaseName(filePath: string | undefined): string {
  if (!filePath) return 'unknown';
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'unknown';
}

function extractNodeModulesPackage(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  const match = filePath.match(/\/node_modules\/([^/]+)/);
  return match ? match[1] : undefined;
}

function buildSignalFileTree(rootTemplate: TemplateInfo, signals: SignalInfo[]): any[] {
  const signalSet = new Set(signals.map(s => s.name));

  const seen = new Map<string, { template: TemplateInfo }>();

  function walkTemplate(template: TemplateInfo) {
    const srcFile = template.sourceFile || 'unknown';
    const tName = template.templateName;
    const key = `${srcFile}::${tName}`;

    if (!seen.has(key)) {
      seen.set(key, { template });
    }

    for (const comp of template.components) {
      if (comp.template) {
        walkTemplate(comp.template);
      }
    }
  }

  walkTemplate(rootTemplate);

  const files = new Map<string, { name: string; sourceFile: string; children: any[] }>();

  for (const [, { template }] of seen) {
    const srcFile = template.sourceFile || 'unknown';
    const baseName = extractBaseName(srcFile);

    if (!files.has(srcFile)) {
      files.set(srcFile, { name: baseName, sourceFile: srcFile, children: [] });
    }

    const tplSignals = template.signals.filter(s => signalSet.has(s.name));
    if (tplSignals.length === 0) continue;

    const inputCount = tplSignals.filter(s => s.kind === 'input').length;
    const outputCount = tplSignals.filter(s => s.kind === 'output').length;
    const interCount = tplSignals.filter(s => s.kind === 'intermediate').length;

    const stats: string[] = [];
    if (inputCount > 0) stats.push(`${inputCount} in`);
    if (outputCount > 0) stats.push(`${outputCount} out`);
    if (interCount > 0) stats.push(`${interCount} int`);

    files.get(srcFile)!.children.push({
      id: `${srcFile}::${template.templateName}`,
      type: 'template',
      name: template.templateName,
      templateName: template.templateName,
      sourceFile: srcFile,
      signalCount: tplSignals.length,
      stats,
      children: tplSignals.map(s => ({
        id: `${srcFile}::${template.templateName}::${s.name}`,
        name: s.name,
        kind: s.kind,
        isArray: s.isArray,
        signal: s,
        sourceFile: srcFile,
      }))
    });
  }

  const result: any[] = [];
  for (const [, fileData] of files) {
    if (fileData.children.length === 0) continue;
    fileData.children.sort((a, b) => a.templateName.localeCompare(b.templateName));
    result.push({
      id: `file::${fileData.sourceFile}`,
      type: 'file',
      name: fileData.name,
      sourceFile: fileData.sourceFile,
      children: fileData.children,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
</script>

<style scoped>
.view-title {
  padding: 2px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.view-title:hover {
  border-color: #409eff;
  color: #409eff;
}

.signal-selection-container {
  background: white;
  border-radius: 8px;
}

.signal-tree :deep(.el-tree-node__content) {
  height: 32px;
  padding: 2px 8px;
}

.tree-node-content {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
  min-width: 0;
}

.tree-node-content:hover {
  background-color: #f5f5f5;
}

.file-node .file-name {
  font-size: 13px;
  color: #666;
  font-weight: 600;
}

.file-node {
  cursor: pointer;
}

.file-node-highlighted {
  background-color: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 4px;
  animation: highlight-pulse 2s ease-in-out 1;
}

@keyframes highlight-pulse {
  0% { background-color: rgba(59, 130, 246, 0.3); }
  100% { background-color: rgba(59, 130, 246, 0.12); }
}

.file-node-highlighted .file-name {
  color: #2563eb;
  font-weight: 700;
}

.template-node {
  cursor: pointer;
}

.tree-node-content:not(.file-node) {
  cursor: pointer;
}

.signal-name {
  font-size: 11px;
  color: #333;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-content-viewer {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 16px;
  border-radius: 8px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  max-height: 75vh;
  overflow: auto;
  white-space: pre;
  tab-size: 4;
  margin: 0;
}

.file-content-viewer table {
  border-collapse: collapse;
}

.line-num {
  text-align: right;
  padding-right: 16px;
  padding-left: 8px;
  color: #6e7681;
  user-select: none;
  white-space: nowrap;
  width: 1%;
  vertical-align: top;
}

.line-content {
  white-space: pre;
}

.highlight-name {
  background: rgba(234, 179, 8, 0.35);
  border-radius: 2px;
  padding: 0 2px;
  box-shadow: 0 0 0 1px #eab308;
}
</style>

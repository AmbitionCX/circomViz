<template>
  <div class="editor-container" id="monaco-editor" ref="editorContainer"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as monaco from 'monaco-editor';
import { useCircuitStore } from '@/stores/circuit';

const editorContainer = ref<HTMLElement | null>(document.getElementById('monaco-editor'));
const circuitStore = useCircuitStore();

let editor: any;

onMounted(() => {
  monaco.languages.register({ id: 'circom' });

  monaco.languages.setMonarchTokensProvider('circom', {
    keywords: [
      'signal', 'input', 'output', 'public', 'template', 'component', 'parallel', 'custom', 'var', 'function',
      'return', 'if', 'else', 'for', 'while', 'do', 'log', 'assert', 'include', 'pragma'
    ],
    typeKeywords: ['input', 'output', 'public'],
    operators: [
      '!', '~', '-', '||', '&&', '==', '!=', '<', '>', '<=', '>=', '|', '&', '<<', '>>', '+', '-', '*', '/', '\\', '%', '**', '^', '=', '<--', '<=='
    ],
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{14}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    tokenizer: {
      root: [
        [/\w+/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/[{}()\[\]]/, '@brackets'],
        [/[;.]/, 'delimiter'],
        [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/\d+/, 'number'],
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
        [/'[^\\']'/, 'string'],
        [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
        { include: '@whitespace' },
        [/@\s*[a-zA-Z_\$][\w\$]*/, 'annotation'],
      ],
      comment: [
        [/[^\/*]+/, 'comment'],
        [/\/\*/, 'comment', '@push'],
        ['\\*/', 'comment', '@pop'],
        [/[\/*]/, 'comment'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],
      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
      ],
    }
  });

  if (editorContainer.value) {
    editor = monaco.editor.create(editorContainer.value, {
      value: circuitStore.code,
      language: 'circom',
      theme: 'vs',
      automaticLayout: true,
    });
  }

  editor.onDidChangeModelContent(() => {
    circuitStore.setCode(editor.getValue());
  });
});

onBeforeUnmount(() => {
  if (editor) {
    editor.dispose();
  }
});

watch(() => circuitStore.code, (newValue) => {
  if (editor && editor.getValue() !== newValue) {
    editor.setValue(newValue);
  }
});
</script>

<style scoped>
.editor-container {
  height: 100%;
  width: 100%;
}
</style>

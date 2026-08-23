import type { ExampleId, TaskId, TaskStimulus } from '@/types/study'

// Only participant-visible information belongs here. Ground truth, bug categories,
// vulnerable locations, and scoring rubrics must remain outside the shipped app.
export const taskStimuli: Record<TaskId, Record<ExampleId, TaskStimulus>> = {
  T1: {
    A: {
      publicCaseId: 'Case 01',
      sourceProject: 'zkopru-network/zkopru',
      title: 'Circuit diagnosis task',
      functionDescription: '请根据主持人提供的 Case 01 材料理解该电路的预期功能。',
      functionDescriptionEn: 'Use the materials provided by the researcher to understand the intended behavior of Case 01.',
      inputOutputSemantics: '输入、输出及其语义以现场提供的标准化 intent card 为准。',
      inputOutputSemanticsEn: 'Use the standardized intent card provided during the session for the inputs, outputs, and their semantics.',
      intendedProperties: ['实现及其生成的约束应与 intent card 中陈述的关键性质一致。'],
      intendedPropertiesEn: [
        'The implementation and generated constraints must satisfy the key properties stated in the intent card.',
      ],
      materialsNote: '使用研究人员指定的实验环境和 Case 01 材料。',
    },
    B: {
      publicCaseId: 'Case 02',
      sourceProject: 'pantherfoundation/panther-core',
      title: 'Circuit diagnosis task',
      functionDescription: '请根据主持人提供的 Case 02 材料理解该电路的预期功能。',
      functionDescriptionEn: 'Use the materials provided by the researcher to understand the intended behavior of Case 02.',
      inputOutputSemantics: '输入、输出及其语义以现场提供的标准化 intent card 为准。',
      inputOutputSemanticsEn: 'Use the standardized intent card provided during the session for the inputs, outputs, and their semantics.',
      intendedProperties: ['实现及其生成的约束应与 intent card 中陈述的关键性质一致。'],
      intendedPropertiesEn: [
        'The implementation and generated constraints must satisfy the key properties stated in the intent card.',
      ],
      materialsNote: '使用研究人员指定的实验环境和 Case 02 材料。',
    },
  },
  T2: {
    A: {
      publicCaseId: 'Case 03',
      sourceProject: 'succinctlabs/telepathy-circuits',
      title: 'Circuit diagnosis task',
      functionDescription: '请根据主持人提供的 Case 03 材料理解该电路的预期功能。',
      functionDescriptionEn: 'Use the materials provided by the researcher to understand the intended behavior of Case 03.',
      inputOutputSemantics: '输入、输出及其语义以现场提供的标准化 intent card 为准。',
      inputOutputSemanticsEn: 'Use the standardized intent card provided during the session for the inputs, outputs, and their semantics.',
      intendedProperties: ['实现及其生成的约束应与 intent card 中陈述的关键性质一致。'],
      intendedPropertiesEn: [
        'The implementation and generated constraints must satisfy the key properties stated in the intent card.',
      ],
      materialsNote: '使用研究人员指定的实验环境和 Case 03 材料。',
    },
    B: {
      publicCaseId: 'Case 04',
      sourceProject: 'siv-org/verifiable-private-overrides',
      title: 'Circuit diagnosis task',
      functionDescription: '请根据主持人提供的 Case 04 材料理解该电路的预期功能。',
      functionDescriptionEn: 'Use the materials provided by the researcher to understand the intended behavior of Case 04.',
      inputOutputSemantics: '输入、输出及其语义以现场提供的标准化 intent card 为准。',
      inputOutputSemanticsEn: 'Use the standardized intent card provided during the session for the inputs, outputs, and their semantics.',
      intendedProperties: ['实现及其生成的约束应与 intent card 中陈述的关键性质一致。'],
      intendedPropertiesEn: [
        'The implementation and generated constraints must satisfy the key properties stated in the intent card.',
      ],
      materialsNote: '使用研究人员指定的实验环境和 Case 04 材料。',
    },
  },
  T3: {
    A: {
      publicCaseId: 'Case 05',
      sourceProject: 'selfxyz/self',
      title: 'Circuit diagnosis task',
      functionDescription: '请根据主持人提供的 Case 05 材料理解该电路的预期功能。',
      functionDescriptionEn: 'Use the materials provided by the researcher to understand the intended behavior of Case 05.',
      inputOutputSemantics: '输入、输出及其语义以现场提供的标准化 intent card 为准。',
      inputOutputSemanticsEn: 'Use the standardized intent card provided during the session for the inputs, outputs, and their semantics.',
      intendedProperties: ['实现及其生成的约束应与 intent card 中陈述的关键性质一致。'],
      intendedPropertiesEn: [
        'The implementation and generated constraints must satisfy the key properties stated in the intent card.',
      ],
      materialsNote: '使用研究人员指定的实验环境和 Case 05 材料。',
    },
    B: {
      publicCaseId: 'Case 06',
      sourceProject: 'pantherfoundation/panther-core',
      title: 'Circuit diagnosis task',
      functionDescription: '请根据主持人提供的 Case 06 材料理解该电路的预期功能。',
      functionDescriptionEn: 'Use the materials provided by the researcher to understand the intended behavior of Case 06.',
      inputOutputSemantics: '输入、输出及其语义以现场提供的标准化 intent card 为准。',
      inputOutputSemanticsEn: 'Use the standardized intent card provided during the session for the inputs, outputs, and their semantics.',
      intendedProperties: ['实现及其生成的约束应与 intent card 中陈述的关键性质一致。'],
      intendedPropertiesEn: [
        'The implementation and generated constraints must satisfy the key properties stated in the intent card.',
      ],
      materialsNote: '使用研究人员指定的实验环境和 Case 06 材料。',
    },
  },
  T4: {
    A: {
      publicCaseId: 'Case 07',
      sourceProject: 'selfxyz/self',
      title: 'Circuit diagnosis task',
      functionDescription: '请根据主持人提供的 Case 07 材料理解该电路的预期功能。',
      functionDescriptionEn: 'Use the materials provided by the researcher to understand the intended behavior of Case 07.',
      inputOutputSemantics: '输入、输出及其语义以现场提供的标准化 intent card 为准。',
      inputOutputSemanticsEn: 'Use the standardized intent card provided during the session for the inputs, outputs, and their semantics.',
      intendedProperties: ['实现及其生成的约束应与 intent card 中陈述的关键性质一致。'],
      intendedPropertiesEn: [
        'The implementation and generated constraints must satisfy the key properties stated in the intent card.',
      ],
      materialsNote: '使用研究人员指定的实验环境和 Case 07 材料。',
    },
    B: {
      publicCaseId: 'Case 08',
      sourceProject: 'rarimo/passport-zk-circuits',
      title: 'Circuit diagnosis task',
      functionDescription: '请根据主持人提供的 Case 08 材料理解该电路的预期功能。',
      functionDescriptionEn: 'Use the materials provided by the researcher to understand the intended behavior of Case 08.',
      inputOutputSemantics: '输入、输出及其语义以现场提供的标准化 intent card 为准。',
      inputOutputSemanticsEn: 'Use the standardized intent card provided during the session for the inputs, outputs, and their semantics.',
      intendedProperties: ['实现及其生成的约束应与 intent card 中陈述的关键性质一致。'],
      intendedPropertiesEn: [
        'The implementation and generated constraints must satisfy the key properties stated in the intent card.',
      ],
      materialsNote: '使用研究人员指定的实验环境和 Case 08 材料。',
    },
  },
}

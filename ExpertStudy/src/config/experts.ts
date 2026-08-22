import type { ExpertId, ExpertPlan } from '@/types/study'

export const expertPlans: Record<ExpertId, ExpertPlan> = {
  E1: {
    taskOrder: ['T1', 'T2', 'T3', 'T4'],
    assignments: {
      T1: { example: 'A', condition: 'baseline' },
      T2: { example: 'A', condition: 'circomvis' },
      T3: { example: 'B', condition: 'baseline' },
      T4: { example: 'B', condition: 'circomvis' },
    },
  },
  E2: {
    taskOrder: ['T1', 'T2', 'T3', 'T4'],
    assignments: {
      T1: { example: 'B', condition: 'circomvis' },
      T2: { example: 'B', condition: 'baseline' },
      T3: { example: 'A', condition: 'circomvis' },
      T4: { example: 'A', condition: 'baseline' },
    },
  },
  E3: {
    taskOrder: ['T2', 'T3', 'T4', 'T1'],
    assignments: {
      T1: { example: 'A', condition: 'circomvis' },
      T2: { example: 'A', condition: 'baseline' },
      T3: { example: 'B', condition: 'circomvis' },
      T4: { example: 'B', condition: 'baseline' },
    },
  },
  E4: {
    taskOrder: ['T2', 'T3', 'T4', 'T1'],
    assignments: {
      T1: { example: 'B', condition: 'baseline' },
      T2: { example: 'B', condition: 'circomvis' },
      T3: { example: 'A', condition: 'baseline' },
      T4: { example: 'A', condition: 'circomvis' },
    },
  },
  E5: {
    taskOrder: ['T3', 'T4', 'T1', 'T2'],
    assignments: {
      T1: { example: 'A', condition: 'baseline' },
      T2: { example: 'B', condition: 'circomvis' },
      T3: { example: 'A', condition: 'circomvis' },
      T4: { example: 'B', condition: 'baseline' },
    },
  },
  E6: {
    taskOrder: ['T3', 'T4', 'T1', 'T2'],
    assignments: {
      T1: { example: 'B', condition: 'circomvis' },
      T2: { example: 'A', condition: 'baseline' },
      T3: { example: 'B', condition: 'baseline' },
      T4: { example: 'A', condition: 'circomvis' },
    },
  },
  E7: {
    taskOrder: ['T4', 'T1', 'T2', 'T3'],
    assignments: {
      T1: { example: 'A', condition: 'circomvis' },
      T2: { example: 'B', condition: 'baseline' },
      T3: { example: 'B', condition: 'circomvis' },
      T4: { example: 'A', condition: 'baseline' },
    },
  },
  E8: {
    taskOrder: ['T4', 'T1', 'T2', 'T3'],
    assignments: {
      T1: { example: 'B', condition: 'baseline' },
      T2: { example: 'A', condition: 'circomvis' },
      T3: { example: 'A', condition: 'baseline' },
      T4: { example: 'B', condition: 'circomvis' },
    },
  },
}

import type { StudyStep } from '@/types/study'

export function buildStudyFlow(): StudyStep[] {
  const steps: StudyStep[] = [
    { id: 'welcome', kind: 'welcome', section: 'Introduction', shortLabel: '欢迎' },
    { id: 'consent', kind: 'consent', section: 'Introduction', shortLabel: '知情同意' },
    { id: 'background', kind: 'background', section: 'Background', shortLabel: '背景信息' },
    { id: 'training', kind: 'training', section: 'Training', shortLabel: '系统培训' },
    { id: 'practice', kind: 'practice', section: 'Training', shortLabel: '操作熟悉' },
    { id: 'comprehension', kind: 'comprehension', section: 'Training', shortLabel: '理解检查' },
    {
      id: 'case-familiarity',
      kind: 'case-familiarity',
      section: 'Training',
      shortLabel: '案例来源确认',
    },
  ]

  for (let taskIndex = 0; taskIndex < 4; taskIndex += 1) {
    steps.push(
      {
        id: `task-${taskIndex + 1}-brief`,
        kind: 'task-brief',
        section: 'Tasks',
        shortLabel: `任务 ${taskIndex + 1}`,
        taskIndex,
      },
      {
        id: `task-${taskIndex + 1}-response`,
        kind: 'task-response',
        section: 'Tasks',
        shortLabel: `任务 ${taskIndex + 1} 提交`,
        taskIndex,
      },
    )

    if (taskIndex === 1) {
      steps.push({ id: 'break', kind: 'break', section: 'Tasks', shortLabel: '休息' })
    }
  }

  steps.push(
    { id: 'sus', kind: 'sus', section: 'Questionnaires', shortLabel: 'SUS' },
    {
      id: 'contribution',
      kind: 'contribution',
      section: 'Questionnaires',
      shortLabel: '设计反馈',
    },
    { id: 'interview', kind: 'interview', section: 'Interview', shortLabel: '访谈' },
    { id: 'review', kind: 'review', section: 'Completion', shortLabel: '检查与导出' },
    { id: 'completion', kind: 'completion', section: 'Completion', shortLabel: '完成' },
  )

  return steps
}

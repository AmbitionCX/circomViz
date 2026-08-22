import { contributionQuestions, interviewQuestions, susQuestions } from '@/config/questionnaires'
import { calculateSusScore } from '@/utils/susScore'
import type { StudySession, TaskResponse } from '@/types/study'

function textBlock(value: string): string {
  return value.trim() || '_Not provided_'
}

function yesNoPrefer(value: string): string {
  const labels: Record<string, string> = {
    yes: 'Yes',
    no: 'No',
    'prefer-not': 'Prefer not to answer',
  }
  return labels[value] ?? 'Not provided'
}

function conditionLabel(value: string): string {
  return value === 'circomvis' ? 'CircomVis' : 'Baseline'
}

function taskMarkdown(task: TaskResponse): string {
  return `## Task ${task.order}: ${task.publicCaseId}

- Internal assignment: ${task.taskId}-${task.example}
- Condition: ${conditionLabel(task.condition)}
- Started at: ${task.startedAt ?? 'Not recorded'}
- Submitted at: ${task.submittedAt ?? 'Not recorded'}
- Duration: ${task.durationSeconds ?? 'Not recorded'} seconds
- Timeout: ${task.timedOut ? 'Yes' : 'No'}

### Suspected component / template

${textBlock(task.suspectedComponent)}

### Source statement or constraint

${textBlock(task.sourceOrConstraint)}

### Root-cause explanation

${textBlock(task.rootCause)}

### Violated intended property

${textBlock(task.violatedProperty)}

### Supporting evidence

${textBlock(task.supportingEvidence)}

### Possible repair

${textBlock(task.possibleRepair)}

### Post-task ratings

- Diagnosis confidence (1–7): ${task.confidence || 'Not provided'}
- Mental demand (1–7): ${task.mentalDemand || 'Not provided'}
- Primary evidence: ${textBlock(task.primaryEvidence)}
`
}

export function createMarkdown(session: StudySession): string {
  const susScore = calculateSusScore(session.susResponses)
  const susLines = susQuestions
    .map((question, index) => `${index + 1}. ${question}\n   - Response: ${session.susResponses[index] ?? 'Not provided'}`)
    .join('\n')
  const contributionLines = contributionQuestions
    .map(
      (question, index) =>
        `${index + 1}. ${question}\n   - Response: ${session.contributionRatings[index] ?? 'Not provided'}`,
    )
    .join('\n')
  const interviewLines = interviewQuestions
    .map(
      (question, index) =>
        `### ${index + 1}. ${question}\n\n${textBlock(session.interviewNotes[index] ?? '')}`,
    )
    .join('\n\n')

  return `# CircomVis Expert Study Response

## Session metadata

- Expert ID: ${session.expertId}
- Study version: ${session.studyVersion}
- Schema version: ${session.schemaVersion}
- Started at: ${session.startedAt}
- Completed at: ${session.completedAt ?? 'Not completed'}
- Browser timezone: ${session.timezone}
- Researcher note: ${textBlock(session.researcherNote)}

## Consent

- Consent version: ${session.consent.consentVersion}
- Participation accepted: ${session.consent.accepted ? 'Yes' : 'No'}
- Screen recording accepted: ${session.consent.screenRecordingAccepted ? 'Yes' : 'No'}
- Audio recording accepted: ${session.consent.audioRecordingAccepted ? 'Yes' : 'No'}
- Accepted at: ${session.consent.acceptedAt ?? 'Not accepted'}

## Participant background

- Circom experience: ${textBlock(session.background.circomYears)}
- Production circuit experience: ${yesNoPrefer(session.background.productionCircuit)}
- ZK security audit experience: ${yesNoPrefer(session.background.securityAudit)}
- R1CS familiarity (1–7): ${session.background.r1csFamiliarity}

### Debugging tools and workflow

${textBlock(session.background.debuggingTools)}

### Prior familiarity with candidate cases

${textBlock(session.background.knownCases)}

### Additional background notes

${textBlock(session.background.notes)}

## Comprehension check

- Attempts: ${session.comprehension.attempts}
- Passed at: ${session.comprehension.passedAt ?? 'Not passed'}
- Source-level view answer: ${textBlock(session.comprehension.sourceViewAnswer)}
- Provenance answer: ${textBlock(session.comprehension.provenanceAnswer)}

${session.tasks.map(taskMarkdown).join('\n')}
## System Usability Scale

${susLines}

- Calculated SUS score: ${susScore ?? 'Incomplete'} / 100

## Contribution-specific questionnaire

${contributionLines}

### Overall feedback

${textBlock(session.overallFeedback)}

## Semi-structured interview notes

${interviewLines}
`
}

function localTimestamp(date: Date): string {
  const part = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}`
}

export function downloadMarkdown(session: StudySession): void {
  const blob = new Blob([createMarkdown(session)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `circomvis-expert-study-${session.expertId}-${localTimestamp(new Date())}.md`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

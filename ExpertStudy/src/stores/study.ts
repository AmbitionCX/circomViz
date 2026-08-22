import { defineStore } from 'pinia'
import { CONSENT_VERSION, STUDY_VERSION, TASK_TIME_LIMIT_SECONDS } from '@/config/study'
import { expertPlans } from '@/config/experts'
import { taskStimuli } from '@/config/tasks'
import type { ExpertId, StudySession, TaskResponse } from '@/types/study'
import type { PersistedStudyState } from '@/utils/persistence'

function emptyTask(
  order: number,
  taskId: TaskResponse['taskId'],
  assignment: { example: TaskResponse['example']; condition: TaskResponse['condition'] },
): TaskResponse {
  return {
    order,
    taskId,
    example: assignment.example,
    condition: assignment.condition,
    publicCaseId: taskStimuli[taskId][assignment.example].publicCaseId,
    timedOut: false,
    suspectedComponent: '',
    sourceOrConstraint: '',
    rootCause: '',
    violatedProperty: '',
    supportingEvidence: '',
    possibleRepair: '',
    confidence: 0,
    mentalDemand: 0,
    primaryEvidence: '',
  }
}

function newSession(expertId: ExpertId, researcherNote: string): StudySession {
  const plan = expertPlans[expertId]
  return {
    schemaVersion: 1,
    studyVersion: STUDY_VERSION,
    expertId,
    researcherNote,
    startedAt: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
    consent: {
      consentVersion: CONSENT_VERSION,
      accepted: false,
      screenRecordingAccepted: false,
      audioRecordingAccepted: false,
    },
    background: {
      circomYears: '',
      productionCircuit: '',
      securityAudit: '',
      r1csFamiliarity: 0,
      debuggingTools: '',
      knownCases: '',
      notes: '',
    },
    comprehension: {
      sourceViewAnswer: '',
      provenanceAnswer: '',
      attempts: 0,
    },
    tasks: plan.taskOrder.map((taskId, index) =>
      emptyTask(index + 1, taskId, plan.assignments[taskId]),
    ),
    susResponses: Array.from({ length: 10 }, () => 0),
    contributionRatings: Array.from({ length: 7 }, () => 0),
    overallFeedback: '',
    interviewNotes: Array.from({ length: 10 }, () => ''),
  }
}

export const useStudyStore = defineStore('expert-study', {
  state: () => ({
    session: null as StudySession | null,
    currentStepIndex: 0,
  }),
  actions: {
    startSession(expertId: ExpertId, researcherNote: string) {
      this.session = newSession(expertId, researcherNote)
      this.currentStepIndex = 0
    },
    restore(state: PersistedStudyState) {
      this.session = state.session
      this.currentStepIndex = state.currentStepIndex
    },
    moveNext() {
      this.currentStepIndex += 1
    },
    movePrevious() {
      this.currentStepIndex = Math.max(0, this.currentStepIndex - 1)
    },
    acceptConsent() {
      if (!this.session) return
      this.session.consent.acceptedAt = new Date().toISOString()
    },
    recordComprehensionAttempt(passed: boolean) {
      if (!this.session) return
      this.session.comprehension.attempts += 1
      if (passed) this.session.comprehension.passedAt = new Date().toISOString()
    },
    startTask(taskIndex: number) {
      const task = this.session?.tasks[taskIndex]
      if (task && !task.startedAt) task.startedAt = new Date().toISOString()
    },
    submitTask(taskIndex: number) {
      const task = this.session?.tasks[taskIndex]
      if (!task || task.submittedAt) return
      const submittedAt = new Date()
      task.submittedAt = submittedAt.toISOString()
      if (task.startedAt) {
        task.durationSeconds = Math.max(
          0,
          Math.round((submittedAt.getTime() - new Date(task.startedAt).getTime()) / 1000),
        )
        task.timedOut = task.timedOut || task.durationSeconds >= TASK_TIME_LIMIT_SECONDS
      }
    },
    completeSession() {
      if (this.session && !this.session.completedAt) {
        this.session.completedAt = new Date().toISOString()
      }
    },
  },
})

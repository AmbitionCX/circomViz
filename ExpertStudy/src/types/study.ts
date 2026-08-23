export const expertIds = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'] as const
export type ExpertId = (typeof expertIds)[number]

export const taskIds = ['T1', 'T2', 'T3', 'T4'] as const
export type TaskId = (typeof taskIds)[number]
export type ExampleId = 'A' | 'B'
export type StudyCondition = 'baseline' | 'circomvis'
export type YesNoPrefer = 'yes' | 'no' | 'prefer-not'
export type CaseFamiliarity =
  | 'unfamiliar'
  | 'project-familiar'
  | 'vulnerability-familiar'

export interface TaskAssignment {
  example: ExampleId
  condition: StudyCondition
}

export interface ExpertPlan {
  taskOrder: TaskId[]
  assignments: Record<TaskId, TaskAssignment>
}

export interface TaskStimulus {
  publicCaseId: string
  sourceProject: string
  title: string
  functionDescription: string
  functionDescriptionEn: string
  inputOutputSemantics: string
  inputOutputSemanticsEn: string
  intendedProperties: string[]
  intendedPropertiesEn: string[]
  materialsNote: string
}

export interface ConsentResponse {
  consentVersion: string
  accepted: boolean
  screenRecordingAccepted: boolean
  audioRecordingAccepted: boolean
  acceptedAt?: string
}

export interface ParticipantBackground {
  circomYears: string
  productionCircuit: YesNoPrefer | ''
  securityAudit: YesNoPrefer | ''
  r1csFamiliarity: number
  debuggingTools: string
  knownCases: string
  notes: string
}

export interface ComprehensionResult {
  sourceViewAnswer: string
  provenanceAnswer: string
  attempts: number
  passedAt?: string
}

export interface TaskResponse {
  order: number
  taskId: TaskId
  example: ExampleId
  condition: StudyCondition
  publicCaseId: string
  priorFamiliarity: CaseFamiliarity | ''
  startedAt?: string
  submittedAt?: string
  durationSeconds?: number
  timedOut: boolean
  suspectedComponent: string
  sourceOrConstraint: string
  rootCause: string
  violatedProperty: string
  supportingEvidence: string
  possibleRepair: string
  confidence: number
  mentalDemand: number
  primaryEvidence: string
}

export interface StudySession {
  schemaVersion: 1
  studyVersion: string
  expertId: ExpertId
  researcherNote: string
  startedAt: string
  completedAt?: string
  timezone: string
  consent: ConsentResponse
  background: ParticipantBackground
  comprehension: ComprehensionResult
  tasks: TaskResponse[]
  susResponses: number[]
  contributionRatings: number[]
  overallFeedback: string
  interviewNotes: string[]
}

export type StepKind =
  | 'welcome'
  | 'consent'
  | 'background'
  | 'case-familiarity'
  | 'training'
  | 'practice'
  | 'comprehension'
  | 'task-brief'
  | 'task-response'
  | 'break'
  | 'sus'
  | 'contribution'
  | 'interview'
  | 'review'
  | 'completion'

export interface StudyStep {
  id: string
  kind: StepKind
  section: string
  shortLabel: string
  taskIndex?: number
}

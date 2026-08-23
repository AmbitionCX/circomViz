import { STORAGE_KEY } from '@/config/study'
import type { StudySession } from '@/types/study'

const CURRENT_FLOW_VERSION = 4
const REMOVED_ENVIRONMENT_STEP_INDEX = 3

export interface PersistedStudyState {
  flowVersion?: number
  currentStepIndex: number
  session: StudySession
}

function normalizeSession(session: StudySession): StudySession {
  session.tasks.forEach((task) => {
    if (!task.priorFamiliarity) task.priorFamiliarity = ''
  })
  return session
}

function migrateStepIndex(flowVersion: number, currentStepIndex: number): number {
  let migratedIndex = currentStepIndex

  if (flowVersion < 2 && migratedIndex > REMOVED_ENVIRONMENT_STEP_INDEX) {
    migratedIndex -= 1
  }
  if (flowVersion < 3 && migratedIndex >= REMOVED_ENVIRONMENT_STEP_INDEX) {
    migratedIndex += 1
  }

  if (flowVersion < 4) {
    if (migratedIndex >= 4 && migratedIndex <= 6) migratedIndex -= 1
  }

  return migratedIndex
}

export function saveStudyState(state: PersistedStudyState): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...state, flowVersion: CURRENT_FLOW_VERSION }),
  )
}

export function loadStudyState(): PersistedStudyState | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as PersistedStudyState
    if (parsed.session?.schemaVersion !== 1 || !Number.isInteger(parsed.currentStepIndex)) {
      return null
    }
    const flowVersion = parsed.flowVersion ?? 1
    const currentStepIndex = migrateStepIndex(flowVersion, parsed.currentStepIndex)
    const session = normalizeSession(parsed.session)

    return { ...parsed, session, currentStepIndex, flowVersion: CURRENT_FLOW_VERSION }
  } catch {
    return null
  }
}

export function clearStudyState(): void {
  localStorage.removeItem(STORAGE_KEY)
}

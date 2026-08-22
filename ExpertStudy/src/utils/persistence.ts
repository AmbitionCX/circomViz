import { STORAGE_KEY } from '@/config/study'
import type { StudySession } from '@/types/study'

export interface PersistedStudyState {
  currentStepIndex: number
  session: StudySession
}

export function saveStudyState(state: PersistedStudyState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function loadStudyState(): PersistedStudyState | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as PersistedStudyState
    if (parsed.session?.schemaVersion !== 1 || !Number.isInteger(parsed.currentStepIndex)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearStudyState(): void {
  localStorage.removeItem(STORAGE_KEY)
}

<template>
  <StudyShell :progress="progress">
    <ResearcherSetupStep
      v-if="!store.session"
      :initial-expert-id="queryExpertId"
      @start="startSession"
    />

    <template v-else-if="currentStep">
      <WelcomeStep v-if="currentStep.kind === 'welcome'" />
      <ConsentStep
        v-else-if="currentStep.kind === 'consent'"
        :consent="store.session.consent"
      />
      <BackgroundStep
        v-else-if="currentStep.kind === 'background'"
        :background="store.session.background"
      />
      <CaseFamiliarityStep
        v-else-if="currentStep.kind === 'case-familiarity'"
        :tasks="store.session.tasks"
      />
      <TrainingStep v-else-if="currentStep.kind === 'training'" />
      <PracticeStep v-else-if="currentStep.kind === 'practice'" />
      <ComprehensionStep
        v-else-if="currentStep.kind === 'comprehension'"
        :result="store.session.comprehension"
      />
      <TaskBriefStep
        v-else-if="currentStep.kind === 'task-brief' && currentTask"
        :task="currentTask"
      />
      <TaskResponseStep
        v-else-if="currentStep.kind === 'task-response' && currentTask"
        :task="currentTask"
      />
      <BreakStep v-else-if="currentStep.kind === 'break'" />
      <SusQuestionnaireStep
        v-else-if="currentStep.kind === 'sus'"
        :responses="store.session.susResponses"
      />
      <ContributionQuestionnaireStep
        v-else-if="currentStep.kind === 'contribution'"
        :ratings="store.session.contributionRatings"
        v-model:overall-feedback="store.session.overallFeedback"
      />
      <InterviewStep
        v-else-if="currentStep.kind === 'interview'"
        :notes="store.session.interviewNotes"
      />
      <ReviewStep
        v-else-if="currentStep.kind === 'review'"
        :session="store.session"
        v-model:confirmed="exportConfirmed"
        @download="downloadResult"
      />
      <CompletionStep
        v-else-if="currentStep.kind === 'completion'"
        @download="downloadResult"
        @clear="clearSession"
      />
    </template>

    <template v-if="store.session && currentStep?.kind !== 'completion'" #navigation>
      <StudyNavigation
        :show-back="canGoBack"
        :next-disabled="!canContinue"
        :next-label="nextLabel"
        @back="store.movePrevious()"
        @next="handleNext"
      />
    </template>
  </StudyShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StudyShell from '@/components/StudyShell.vue'
import StudyNavigation from '@/components/StudyNavigation.vue'
import ResearcherSetupStep from '@/steps/ResearcherSetupStep.vue'
import WelcomeStep from '@/steps/WelcomeStep.vue'
import ConsentStep from '@/steps/ConsentStep.vue'
import BackgroundStep from '@/steps/BackgroundStep.vue'
import CaseFamiliarityStep from '@/steps/CaseFamiliarityStep.vue'
import TrainingStep from '@/steps/TrainingStep.vue'
import PracticeStep from '@/steps/PracticeStep.vue'
import ComprehensionStep from '@/steps/ComprehensionStep.vue'
import TaskBriefStep from '@/steps/TaskBriefStep.vue'
import TaskResponseStep from '@/steps/TaskResponseStep.vue'
import BreakStep from '@/steps/BreakStep.vue'
import SusQuestionnaireStep from '@/steps/SusQuestionnaireStep.vue'
import ContributionQuestionnaireStep from '@/steps/ContributionQuestionnaireStep.vue'
import InterviewStep from '@/steps/InterviewStep.vue'
import ReviewStep from '@/steps/ReviewStep.vue'
import CompletionStep from '@/steps/CompletionStep.vue'
import { useStudyStore } from '@/stores/study'
import { buildStudyFlow } from '@/utils/buildStudyFlow'
import { clearStudyState, loadStudyState, saveStudyState } from '@/utils/persistence'
import { downloadMarkdown } from '@/utils/markdownExport'
import { useLocale } from '@/composables/useLocale'
import { expertIds, type ExpertId, type TaskResponse } from '@/types/study'

const store = useStudyStore()
const { t } = useLocale()
const steps = buildStudyFlow()
const exportConfirmed = ref(false)

const queryExpertId = computed<ExpertId | undefined>(() => {
  const value = new URLSearchParams(window.location.search).get('expert')
  return expertIds.find((id) => id === value)
})

const currentStep = computed(() => steps[store.currentStepIndex])
const currentTask = computed<TaskResponse | undefined>(() => {
  const taskIndex = currentStep.value?.taskIndex
  return taskIndex === undefined ? undefined : store.session?.tasks[taskIndex]
})
function localizedSection(section: string): string {
  switch (section) {
    case "Introduction": return t("progress.introduction")
    case "Background": return t("progress.background")
    case "Training": return t("progress.training")
    case "Tasks": return t("progress.tasks")
    case "Questionnaires": return t("progress.questionnaires")
    case "Interview": return t("progress.interview")
    case "Completion": return t("progress.completion")
    default: return section
  }
}

function localizedStepLabel(): string {
  const step = currentStep.value
  if (!step) return ""
  const order = (step.taskIndex ?? 0) + 1
  switch (step.kind) {
    case "welcome": return t("progress.welcome")
    case "consent": return t("progress.consent")
    case "background": return t("progress.backgroundInfo")
    case "case-familiarity": return t("progress.caseFamiliarity")
    case "training": return t("progress.systemTraining")
    case "practice": return t("progress.practice")
    case "comprehension": return t("progress.comprehension")
    case "task-brief": return t("progress.task", { order })
    case "task-response": return t("progress.taskResponse", { order })
    case "break": return t("progress.break")
    case "sus": return t("progress.experienceQuestionnaire")
    case "contribution": return t("progress.experienceQuestionnaire")
    case "interview": return t("interview.title")
    case "review": return t("progress.review")
    case "completion": return t("progress.complete")
    default: return step.shortLabel
  }
}

const progress = computed(() => {
  if (!store.session || !currentStep.value) return undefined
  return {
    current: store.currentStepIndex + 1,
    total: steps.length,
    section: localizedSection(currentStep.value.section),
    label: localizedStepLabel(),
  }
})

const canGoBack = computed(() => {
  if (!currentStep.value || store.currentStepIndex === 0) return false
  const preTaskKinds = [
    'welcome',
    'consent',
    'background',
    'case-familiarity',
    'environment',
    'training',
    'practice',
    'comprehension',
  ]
  const postTaskKinds = ['contribution', 'interview', 'review']
  return preTaskKinds.includes(currentStep.value.kind) || postTaskKinds.includes(currentStep.value.kind)
})

function hasText(value: string): boolean {
  return value.trim().length > 0
}

function isTaskComplete(task?: TaskResponse): boolean {
  if (!task) return false
  return task.confidence > 0 && task.mentalDemand > 0
}

const canContinue = computed(() => {
  const session = store.session
  const kind = currentStep.value?.kind
  if (!session || !kind) return false

  if (kind === 'consent') return session.consent.accepted
  if (kind === 'background') {
    const background = session.background
    return (
      hasText(background.circomYears) &&
      Boolean(background.productionCircuit) &&
      Boolean(background.securityAudit) &&
      background.r1csFamiliarity > 0 &&
      hasText(background.debuggingTools)
    )
  }
  if (kind === 'case-familiarity') {
    return session.tasks.every((task) => Boolean(task.priorFamiliarity))
  }
  if (kind === 'comprehension') {
    return Boolean(
      session.comprehension.sourceViewAnswer && session.comprehension.provenanceAnswer,
    )
  }
  if (kind === 'task-response') return isTaskComplete(currentTask.value)
  if (kind === 'sus') return session.susResponses.every((value) => value >= 1 && value <= 5)
  if (kind === 'contribution') {
    return session.contributionRatings.every((value) => value >= 1 && value <= 7)
  }
  if (kind === 'review') return exportConfirmed.value
  return true
})

const nextLabel = computed(() => {
  switch (currentStep.value?.kind) {
    case 'consent':
      return t('app.consentNext')
    case 'case-familiarity':
      return t('app.caseNext')
    case 'comprehension':
      return t('app.checkNext')
    case 'task-brief':
      return t('app.startTask')
    case 'task-response':
      return t('app.submitTask')
    case 'break':
      return t('app.continueStudy')
    case 'review':
      return t('app.finishStudy')
    default:
      return t('nav.next')
  }
})

function startSession(expertId: ExpertId, researcherNote: string) {
  store.startSession(expertId, researcherNote)
  ElMessage.success(t("app.orderLoaded", { expertId }))
}

function handleNext() {
  const session = store.session
  const step = currentStep.value
  if (!session || !step || !canContinue.value) return

  if (step.kind === 'consent') {
    store.acceptConsent()
  }

  if (step.kind === 'comprehension') {
    const passed =
      session.comprehension.sourceViewAnswer === 'source-semantics' &&
      session.comprehension.provenanceAnswer === 'provenance-links'
    store.recordComprehensionAttempt(passed)
    if (!passed) {
      ElMessage.warning(t("app.checkFailed"))
      return
    }
    ElMessage.success(t("app.checkPassed"))
  }

  if (step.kind === 'task-brief' && step.taskIndex !== undefined) {
    store.startTask(step.taskIndex)
  }

  if (step.kind === 'task-response' && step.taskIndex !== undefined) {
    store.submitTask(step.taskIndex)
    ElMessage.success(t("app.taskSubmitted"))
  }

  if (step.kind === 'review') {
    store.completeSession()
  }

  store.moveNext()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function downloadResult() {
  if (!store.session) return
  store.completeSession()
  downloadMarkdown(store.session)
  ElMessage.success(t("app.markdownGenerated"))
}

async function clearSession() {
  try {
    await ElMessageBox.confirm(
      t("app.clearMessage"),
      t("app.clearTitle"),
      {
        type: 'warning',
        confirmButtonText: t("app.confirmClear"),
        cancelButtonText: t("app.cancel"),
      },
    )
    clearStudyState()
    store.$reset()
    exportConfirmed.value = false
    ElMessage.success(t("app.dataCleared"))
  } catch {
    // The participant or researcher cancelled the destructive action.
  }
}

function warnBeforeClose(event: BeforeUnloadEvent) {
  if (!store.session || store.session.completedAt) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  const persisted = loadStudyState()
  if (persisted) {
    store.restore(persisted)
    ElMessage.info(t("app.restored"))
  }
  window.addEventListener('beforeunload', warnBeforeClose)
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeClose))

watch(
  () => ({ session: store.session, currentStepIndex: store.currentStepIndex }),
  (state) => {
    if (state.session) saveStudyState({ session: state.session, currentStepIndex: state.currentStepIndex })
  },
  { deep: true },
)
</script>

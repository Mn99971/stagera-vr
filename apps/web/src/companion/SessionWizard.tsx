import { useState } from 'react'
import { extractTopics, getDefaultVenueForPracticeType } from '../ai/topicExtractor'
import { extractCvHighlights } from '../lib/documentParser'
import { translations } from '../lib/i18n'
import type {
  AppLanguage,
  AudienceBehaviour,
  InterruptionLevel,
  InterviewDetails,
  PracticeType,
  SessionSetup,
  Topic,
  UploadedMaterialFile,
  UserProfile,
  VenueType,
} from '../types/stagera'
import { ConfirmTopicsScreen } from './ConfirmTopicsScreen'
import { GoalsInterviewerScreen } from './GoalsInterviewerScreen'
import { InterviewDetailsScreen } from './InterviewDetailsScreen'
import { LanguageToggle } from './LanguageToggle'
import { MaterialUploadScreen } from './MaterialUploadScreen'
import { PracticeTypeScreen } from './PracticeTypeScreen'
import { SessionReviewScreen, type EditableWizardStep } from './SessionReviewScreen'
import { VenueAudienceScreen } from './VenueAudienceScreen'

interface SessionWizardProps {
  language: AppLanguage
  profile: UserProfile
  onLanguageChange: (lang: AppLanguage) => void
  onCancel: () => void
  onCompleteSetup: (setup: SessionSetup, launchImmediately: boolean) => Promise<void>
}

type WizardStep = 1 | 2 | 3 | 4 | 5

const TOTAL_WIZARD_STEPS = 5

function deriveDefaultSessionTitle(
  practiceType: PracticeType,
  files: UploadedMaterialFile[],
  interviewDetails: InterviewDetails,
  language: AppLanguage,
): string {
  if (practiceType === 'interview') {
    const job = interviewDetails.jobTitle.trim()
    if (job) {
      return language === 'fr' ? `Entretien : ${job}` : `${job} Interview`
    }
    return language === 'fr' ? 'Entretien de pratique' : 'Mock Interview'
  }

  if (files.length > 0) {
    const base = files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
    if (base) return base
  }

  const label = translations[language].home.practiceTypes[practiceType]
  return language === 'fr' ? `Session ${label}` : `${label} Session`
}

export function SessionWizard({
  language,
  profile,
  onLanguageChange,
  onCancel,
  onCompleteSetup,
}: SessionWizardProps) {
  const t = translations[language].wizard
  const [step, setStep] = useState<WizardStep>(1)
  const [practiceType, setPracticeType] = useState<PracticeType | null>(null)
  const [files, setFiles] = useState<UploadedMaterialFile[]>([])
  const [outlineText, setOutlineText] = useState('')
  const [interviewDetails, setInterviewDetails] = useState<InterviewDetails>({
    jobTitle: '',
    jobDescription: '',
    projectSummary: '',
    cvFile: null,
  })
  const [topics, setTopics] = useState<Topic[]>([])
  const [includedTopicIds, setIncludedTopicIds] = useState<string[]>([])
  const [sessionTitle, setSessionTitle] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)

  // Step 4 state (S1.8 / S1.8b)
  const [venue, setVenue] = useState<VenueType>('lecture_hall')
  const [audienceBehaviour, setAudienceBehaviour] = useState<AudienceBehaviour>('supportive')
  const [interruptionLevel, setInterruptionLevel] = useState<InterruptionLevel>('low')
  const [followUps, setFollowUps] = useState(true)
  const [questionsAtEnd, setQuestionsAtEnd] = useState(true)
  const [unexpectedQuestions, setUnexpectedQuestions] = useState(false)
  const [goals, setGoals] = useState<string[]>(['explain_contribution', 'handle_followups'])
  const [coachedMode, setCoachedMode] = useState(false)

  // Step 5 state (S1.9)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(15)
  const [oneMinWarning, setOneMinWarning] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const handleSelectPracticeType = (nextType: PracticeType) => {
    if (nextType !== practiceType) {
      setSessionTitle('')
      setVenue(getDefaultVenueForPracticeType(nextType))
      if (nextType === 'interview') {
        setAudienceBehaviour('attentive')
        setInterruptionLevel('medium')
        setFollowUps(true)
        setQuestionsAtEnd(false)
        setUnexpectedQuestions(false)
        setTimeLimitMinutes(15)
      } else if (nextType === 'pitch') {
        setAudienceBehaviour('challenging')
        setInterruptionLevel('medium')
        setFollowUps(true)
        setQuestionsAtEnd(true)
        setUnexpectedQuestions(true)
        setTimeLimitMinutes(10)
      } else if (nextType === 'panel') {
        setAudienceBehaviour('attentive')
        setInterruptionLevel('medium')
        setFollowUps(true)
        setQuestionsAtEnd(true)
        setUnexpectedQuestions(true)
        setTimeLimitMinutes(15)
      } else {
        setAudienceBehaviour('supportive')
        setInterruptionLevel('low')
        setFollowUps(true)
        setQuestionsAtEnd(true)
        setUnexpectedQuestions(false)
        setTimeLimitMinutes(15)
      }
    }
    setPracticeType(nextType)
  }

  const handleBack = () => {
    if (step === 1) {
      onCancel()
    } else {
      setStep((prev) => (prev - 1) as WizardStep)
    }
  }

  const handleTopicsChange = (nextTopics: Topic[]) => {
    setTopics(nextTopics)
    setIncludedTopicIds((prev) => {
      const prevSet = new Set(prev)
      const existingIds = new Set(topics.map((item) => item.id))
      const nextIncluded = nextTopics
        .filter((item) => prevSet.has(item.id) || !existingIds.has(item.id))
        .map((item) => item.id)
      return nextIncluded.length > 0 ? nextIncluded : nextTopics.map((item) => item.id)
    })
  }

  const runExtraction = async (overrideSkip = false) => {
    if (!practiceType) return
    setIsExtracting(true)
    try {
      const extracted = await extractTopics({
        practiceType,
        language,
        files: overrideSkip ? [] : files,
        outlineText: overrideSkip ? '' : outlineText,
        interviewDetails,
      })
      setTopics(extracted)
      setIncludedTopicIds(extracted.map((item) => item.id))
      if (!sessionTitle.trim()) {
        setSessionTitle(
          deriveDefaultSessionTitle(
            practiceType,
            overrideSkip ? [] : files,
            interviewDetails,
            language,
          ),
        )
      }
      setStep(3)
    } finally {
      setIsExtracting(false)
    }
  }

  const handleToggleTopicIncluded = (topicId: string) => {
    setIncludedTopicIds((prev) => {
      if (prev.includes(topicId)) {
        if (prev.length <= 1) return prev
        return prev.filter((id) => id !== topicId)
      }
      return [...prev, topicId]
    })
  }

  const buildSetup = (): SessionSetup => {
    const type: PracticeType = practiceType ?? 'presentation'
    const isInterview = type === 'interview'

    const cleanedTopics = topics
      .map((item) => ({ ...item, title: item.title.trim() }))
      .filter((item) => item.title.length > 0)
      .filter((item) => isInterview || includedTopicIds.includes(item.id))

    const fallbackTitle = deriveDefaultSessionTitle(type, files, interviewDetails, language)

    const cvText = interviewDetails.cvFile?.extractedText?.trim().slice(0, 5500) || undefined
    const hasInterviewData =
      isInterview ||
      venue === 'interview_room' ||
      venue === 'panel_room' ||
      Boolean(
        interviewDetails.jobTitle.trim() ||
          interviewDetails.jobDescription.trim() ||
          interviewDetails.projectSummary.trim() ||
          interviewDetails.cvFile,
      )

    const interviewContext = hasInterviewData
      ? {
          jobTitle: interviewDetails.jobTitle.trim() || undefined,
          jobDescription: interviewDetails.jobDescription.trim().slice(0, 2500) || undefined,
          projectSummary: interviewDetails.projectSummary.trim().slice(0, 2000) || undefined,
          cvFileName: interviewDetails.cvFile?.name || undefined,
          cvText,
          cvHighlights: cvText ? extractCvHighlights(cvText) : undefined,
        }
      : undefined

    return {
      id: `setup-${Date.now().toString(36)}`,
      title: sessionTitle.trim() || fallbackTitle,
      practiceType: type,
      venue,
      audienceBehaviour,
      interruptionLevel,
      followUps,
      questionsAtEnd: isInterview ? false : questionsAtEnd,
      unexpectedQuestions: isInterview ? false : unexpectedQuestions,
      timeLimitMinutes,
      oneMinWarning,
      coachedMode: isInterview ? coachedMode : false,
      goals: isInterview
        ? goals
        : profile.practiceGoals.length > 0
          ? profile.practiceGoals
          : ['steady_pace'],
      topics: cleanedTopics,
      interviewContext,
    }
  }

  const handleFinalize = async (launchImmediately: boolean) => {
    setIsSaving(true)
    try {
      await onCompleteSetup(buildSetup(), launchImmediately)
    } finally {
      setIsSaving(false)
    }
  }

  const stepLabel = t.stepOfTotal
    .replace('{step}', String(step))
    .replace('{total}', String(TOTAL_WIZARD_STEPS))

  return (
    <section className="companion-screen" aria-label={stepLabel}>
      <div className="screen-header">
        <button id="wizard-back-btn" type="button" className="back-btn" onClick={handleBack}>
          <span aria-hidden="true">←</span>
          <span>{t.back}</span>
        </button>
        <LanguageToggle language={language} onChange={onLanguageChange} idPrefix="wizard-lang" />
      </div>

      <div className="wizard-progress" aria-label={stepLabel}>
        <div className="wizard-progress-meta">
          <span className="step-kicker">{stepLabel}</span>
          {practiceType && (
            <span className="wizard-type-pill">
              {translations[language].home.practiceTypes[practiceType]}
            </span>
          )}
        </div>
        <div
          className="wizard-step-bars"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={TOTAL_WIZARD_STEPS}
        >
          {Array.from({ length: TOTAL_WIZARD_STEPS }, (_, idx) => {
            const num = idx + 1
            const state = num < step ? 'done' : num === step ? 'active' : 'upcoming'
            return <span key={num} className={`wizard-step-bar ${state}`} />
          })}
        </div>
      </div>

      {step === 1 && (
        <PracticeTypeScreen
          language={language}
          selected={practiceType}
          onSelect={handleSelectPracticeType}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && practiceType && practiceType !== 'interview' && (
        <MaterialUploadScreen
          language={language}
          files={files}
          outlineText={outlineText}
          isExtracting={isExtracting}
          onFilesChange={setFiles}
          onOutlineChange={setOutlineText}
          onContinue={() => void runExtraction(false)}
          onSkip={() => void runExtraction(true)}
        />
      )}

      {step === 2 && practiceType === 'interview' && (
        <InterviewDetailsScreen
          language={language}
          details={interviewDetails}
          isExtracting={isExtracting}
          onChange={setInterviewDetails}
          onContinue={() => void runExtraction(false)}
        />
      )}

      {step === 3 && practiceType && (
        <ConfirmTopicsScreen
          language={language}
          practiceType={practiceType}
          sessionTitle={sessionTitle}
          topics={topics}
          isExtracting={isExtracting}
          onSessionTitleChange={setSessionTitle}
          onTopicsChange={handleTopicsChange}
          onReextract={() => void runExtraction(false)}
          onContinue={() => setStep(4)}
        />
      )}

      {step === 4 && practiceType && practiceType !== 'interview' && (
        <VenueAudienceScreen
          language={language}
          practiceType={practiceType}
          venue={venue}
          audienceBehaviour={audienceBehaviour}
          interruptionLevel={interruptionLevel}
          followUps={followUps}
          questionsAtEnd={questionsAtEnd}
          unexpectedQuestions={unexpectedQuestions}
          onVenueChange={setVenue}
          onBehaviourChange={setAudienceBehaviour}
          onInterruptionChange={setInterruptionLevel}
          onToggleFollowUps={() => setFollowUps((prev) => !prev)}
          onToggleQuestionsAtEnd={() => setQuestionsAtEnd((prev) => !prev)}
          onToggleUnexpectedQuestions={() => setUnexpectedQuestions((prev) => !prev)}
          onContinue={() => setStep(5)}
        />
      )}

      {step === 4 && practiceType === 'interview' && (
        <GoalsInterviewerScreen
          language={language}
          goals={goals}
          venue={venue === 'panel_room' ? 'panel_room' : 'interview_room'}
          interviewerStyle={audienceBehaviour === 'distracted' ? 'attentive' : audienceBehaviour}
          interruptionLevel={interruptionLevel}
          followUps={followUps}
          coachedMode={coachedMode}
          onGoalsChange={setGoals}
          onVenueChange={setVenue}
          onStyleChange={setAudienceBehaviour}
          onInterruptionChange={setInterruptionLevel}
          onToggleFollowUps={() => setFollowUps((prev) => !prev)}
          onToggleCoachedMode={() => setCoachedMode((prev) => !prev)}
          onContinue={() => setStep(5)}
        />
      )}

      {step === 5 && practiceType && (
        <SessionReviewScreen
          language={language}
          practiceType={practiceType}
          files={files}
          outlineText={outlineText}
          jobTitle={interviewDetails.jobTitle}
          topics={topics}
          includedTopicIds={includedTopicIds}
          venue={venue}
          audienceBehaviour={audienceBehaviour}
          interruptionLevel={interruptionLevel}
          goals={goals}
          coachedMode={coachedMode}
          timeLimitMinutes={timeLimitMinutes}
          oneMinWarning={oneMinWarning}
          isSaving={isSaving}
          onToggleTopicIncluded={handleToggleTopicIncluded}
          onTimeLimitChange={setTimeLimitMinutes}
          onToggleOneMinWarning={() => setOneMinWarning((prev) => !prev)}
          onJumpToStep={(target: EditableWizardStep) => setStep(target)}
          onSendToHeadset={() => void handleFinalize(true)}
          onSaveForLater={() => void handleFinalize(false)}
        />
      )}
    </section>
  )
}

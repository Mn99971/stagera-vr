import { useState } from 'react'
import { extractTopics, getDefaultVenueForPracticeType } from '../ai/topicExtractor'
import { translations } from '../lib/i18n'
import type {
  AppLanguage,
  InterviewDetails,
  PracticeType,
  SessionSetup,
  Topic,
  UploadedMaterialFile,
  UserProfile,
} from '../types/stagera'
import { ConfirmTopicsScreen } from './ConfirmTopicsScreen'
import { InterviewDetailsScreen } from './InterviewDetailsScreen'
import { LanguageToggle } from './LanguageToggle'
import { MaterialUploadScreen } from './MaterialUploadScreen'
import { PracticeTypeScreen } from './PracticeTypeScreen'

interface SessionWizardProps {
  language: AppLanguage
  profile: UserProfile
  onLanguageChange: (lang: AppLanguage) => void
  onCancel: () => void
  onCompleteSetup: (setup: SessionSetup, launchImmediately: boolean) => void
}

type WizardStep = 1 | 2 | 3

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
  const [sessionTitle, setSessionTitle] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)

  const handleBack = () => {
    if (step === 1) {
      onCancel()
    } else if (step === 2) {
      setStep(1)
    } else {
      setStep(2)
    }
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

  const buildSetup = (): SessionSetup => {
    const type: PracticeType = practiceType ?? 'presentation'
    const cleanedTopics = topics
      .map((item) => ({ ...item, title: item.title.trim() }))
      .filter((item) => item.title.length > 0)

    const fallbackTitle = deriveDefaultSessionTitle(type, files, interviewDetails, language)

    return {
      id: `setup-${Date.now().toString(36)}`,
      title: sessionTitle.trim() || fallbackTitle,
      practiceType: type,
      venue: getDefaultVenueForPracticeType(type),
      audienceBehaviour: type === 'interview' ? 'attentive' : 'supportive',
      interruptionLevel: type === 'interview' ? 'medium' : 'low',
      followUps: true,
      questionsAtEnd: type !== 'interview',
      unexpectedQuestions: type === 'pitch' || type === 'panel',
      timeLimitMinutes: type === 'pitch' ? 5 : type === 'interview' ? 15 : 10,
      oneMinWarning: true,
      coachedMode: true,
      goals: profile.practiceGoals.length > 0 ? profile.practiceGoals : ['steady_pace'],
      topics: cleanedTopics,
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
        <div className="wizard-step-bars" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL_WIZARD_STEPS}>
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
          onSelect={(nextType) => {
            if (nextType !== practiceType) {
              setSessionTitle('')
            }
            setPracticeType(nextType)
          }}
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
          onTopicsChange={setTopics}
          onReextract={() => void runExtraction(false)}
          onSaveAndLaunch={() => onCompleteSetup(buildSetup(), true)}
          onSaveOnly={() => onCompleteSetup(buildSetup(), false)}
        />
      )}
    </section>
  )
}

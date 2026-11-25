import { useEffect, useState } from 'react'
import { CompanionFlow } from './companion/CompanionFlow'
import { Step3ReportFlow } from './companion/Step3ReportFlow'
import { getStoredLanguage, setStoredLanguage } from './lib/auth'
import { translations } from './lib/i18n'
import {
  deleteAllRecordings,
  deleteSessionRecord,
  fetchAllSessions,
  renameSessionRecord,
  SAMPLE_SESSION_RECORDS,
} from './lib/sessionStore'
import type { AppLanguage, SessionRecord, SessionSetup } from './types/stagera'
import { VRPreFlight } from './vr/VRPreFlight'
import { VRStage } from './vr/VRStage'

const DEFAULT_HEADSET_SETUP: SessionSetup = {
  id: 'headset-quick-lobby',
  title: 'Stagera VR Live Session',
  practiceType: 'presentation',
  venue: 'auditorium',
  audienceBehaviour: 'attentive',
  interruptionLevel: 'low',
  followUps: true,
  questionsAtEnd: true,
  unexpectedQuestions: false,
  timeLimitMinutes: 5,
  oneMinWarning: true,
  coachedMode: false,
  goals: ['steady_pace', 'keep_eye_contact'],
  topics: [
    { id: 't1', title: 'Opening Hook & Vision', brief: false },
    { id: 't2', title: 'Core Problem & Opportunity', brief: false },
    { id: 't3', title: 'Product Demo & Key Metrics', brief: false },
    { id: 't4', title: 'Audience Q&A & Closing', brief: false },
  ],
}

function hasVRHeadsetUA(): boolean {
  if (typeof navigator === 'undefined') return false
  return /OculusBrowser|Quest/i.test(navigator.userAgent)
}

export function App() {
  const [isHeadset, setIsHeadset] = useState<boolean>(() => hasVRHeadsetUA())
  const [forceWeb2D, setForceWeb2D] = useState(false)
  const [step, setStep] = useState<'setup' | 'vr' | 'report'>('setup')
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [activeSetup, setActiveSetup] = useState<SessionSetup | null>(null)
  const [activePairingCode, setActivePairingCode] = useState<string | null>(null)
  const [allSessions, setAllSessions] = useState<SessionRecord[]>(SAMPLE_SESSION_RECORDS)
  const [selectedReport, setSelectedReport] = useState<SessionRecord | null>(null)
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [language, setLanguage] = useState<AppLanguage>(() => getStoredLanguage())

  // Detect any WebXR immersive-vr capable headset asynchronously (instant UA hint already prevents 2D flash on Quest)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.xr?.isSessionSupported) return
    let active = true
    void navigator.xr
      .isSessionSupported('immersive-vr')
      .then((supported) => {
        if (active && supported) {
          setIsHeadset(true)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    let active = true
    void fetchAllSessions(userId).then((loaded) => {
      if (active) setAllSessions(loaded)
    })
    return () => {
      active = false
    }
  }, [userId])

  const handleLanguageChange = (next: AppLanguage) => {
    setLanguage(next)
    setStoredLanguage(next)
  }

  const handleOpenReport = (record?: SessionRecord) => {
    setSelectedReport(record ?? allSessions[0] ?? SAMPLE_SESSION_RECORDS[0])
    setStep('report')
  }

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    const next = await renameSessionRecord(userId, sessionId, newTitle, allSessions)
    setAllSessions(next)
    if (selectedReport?.id === sessionId) {
      setSelectedReport(next.find((s) => s.id === sessionId) ?? selectedReport)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    const next = await deleteSessionRecord(userId, sessionId, allSessions)
    setAllSessions(next)
    if (selectedReport?.id === sessionId) {
      setSelectedReport(next[0] ?? null)
    }
  }

  const handleDeleteAllRecordings = async () => {
    await deleteAllRecordings(userId)
    setAllSessions([])
    setSelectedReport(null)
  }

  // VR Headset Direct Boot: bypass flat Step 1/2/3 web UI completely and mount 3D Floating VR Lobby
  if (isHeadset && !forceWeb2D) {
    return (
      <div className="stagera-headset-root">
        <VRStage
          setup={activeSetup ?? DEFAULT_HEADSET_SETUP}
          userId={userId}
          language={language}
          captionsEnabled={captionsEnabled}
          pairingCode={activePairingCode}
          headsetBootMode={true}
          onSwitchTo2DWeb={() => setForceWeb2D(true)}
          onEndSession={(record) => {
            setAllSessions((prev) => [
              record,
              ...prev.filter((item) => item.id !== record.id),
            ])
            setSelectedReport(record)
          }}
        />
      </div>
    )
  }

  const t = translations[language].app
  const activeReportRecord = selectedReport ?? allSessions[0] ?? SAMPLE_SESSION_RECORDS[0]

  return (
    <div className="stagera-shell">
      <header className="stagera-topbar">
        <div className="stagera-topbar-inner">
          <div className="stagera-brand">
            <span className="stagera-brand-mark" aria-hidden="true">
              S
            </span>
            <span>Stagera VR</span>
          </div>

          <nav className="stagera-step-nav" aria-label="Stagera steps">
            {(['setup', 'vr', 'report'] as const).map((tab) => (
              <button
                key={tab}
                id={`app-step-${tab}`}
                type="button"
                className={`stagera-step-btn ${step === tab ? 'active' : ''}`}
                onClick={() => setStep(tab)}
              >
                {tab === 'setup' ? t.step1 : tab === 'vr' ? t.step2 : t.step3}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="stagera-main">
        {step === 'setup' && (
          <CompanionFlow
            language={language}
            sessions={allSessions}
            onLanguageChange={handleLanguageChange}
            onLaunchVR={(setup) => {
              setActiveSetup(setup)
              setStep('vr')
            }}
            onOpenReport={handleOpenReport}
            onRenameSession={handleRenameSession}
            onDeleteSession={handleDeleteSession}
            onDeleteAllRecordings={handleDeleteAllRecordings}
            onUserChange={setUserId}
          />
        )}

        {step === 'vr' && (
          <div className="stage-card stage-card-showcase">
            {activeSetup ? (
              <VRStage
                setup={activeSetup}
                userId={userId}
                language={language}
                captionsEnabled={captionsEnabled}
                pairingCode={activePairingCode}
                onBackToPreFlight={() => setActiveSetup(null)}
                onEndSession={(record) => {
                  setAllSessions((prev) => [
                    record,
                    ...prev.filter((item) => item.id !== record.id),
                  ])
                  setSelectedReport(record)
                  setStep('report')
                }}
              />
            ) : (
              <VRPreFlight
                language={language}
                userId={userId}
                captionsEnabled={captionsEnabled}
                onToggleCaptions={() => setCaptionsEnabled((prev) => !prev)}
                onStartSession={(setup, code) => {
                  setActivePairingCode(code ?? null)
                  setActiveSetup(setup)
                }}
              />
            )}
          </div>
        )}

        {step === 'report' && (
          <Step3ReportFlow
            record={activeReportRecord}
            allSessions={allSessions}
            language={language}
            onLaunchVRWithSetup={(setup) => {
              setActiveSetup(setup)
              setStep('vr')
            }}
          />
        )}
      </main>
    </div>
  )
}

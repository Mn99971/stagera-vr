import { useCallback, useEffect, useRef, useState } from 'react'
import { CompanionFlow } from './companion/CompanionFlow'
import { Step3ReportFlow } from './companion/Step3ReportFlow'
import { getStoredLanguage, setStoredLanguage } from './lib/auth'
import { translations } from './lib/i18n'
import {
  clearActivePhoneLink,
  createPhonePersistentLink,
  loadActivePhoneLink,
  type PhonePairingPhase,
  type PhonePersistentLink,
} from './lib/pairing'
import { saveSessionSnapshot } from './lib/sessionRecorder'
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

export interface ActivePhoneLinkView {
  code: string
  phase: PhonePairingPhase
  message: string
  setupTitle: string
}

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

function shouldBootInVRHeadsetMode(): boolean {
  if (typeof window !== 'undefined') {
    const mode = new URLSearchParams(window.location.search).get('mode')?.toLowerCase()
    if (mode === 'phone' || mode === 'web') return false
    if (mode === 'vr') return true
  }
  if (typeof navigator === 'undefined') return false
  return /OculusBrowser|Quest|Pico|Vive|Mobile VR|Wolvic/i.test(navigator.userAgent)
}

export function App() {
  const [isHeadset] = useState<boolean>(() => shouldBootInVRHeadsetMode())
  const [forceWeb2D, setForceWeb2D] = useState(false)
  const [step, setStep] = useState<'setup' | 'vr' | 'report'>('setup')
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [activeSetup, setActiveSetup] = useState<SessionSetup | null>(null)
  const [activePairingCode, setActivePairingCode] = useState<string | null>(null)
  const [allSessions, setAllSessions] = useState<SessionRecord[]>(SAMPLE_SESSION_RECORDS)
  const [selectedReport, setSelectedReport] = useState<SessionRecord | null>(null)
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [language, setLanguage] = useState<AppLanguage>(() => getStoredLanguage())

  // Persistent Phone <-> Headset Session Link state (survives screens, tab sleep, and reloads)
  const phoneLinkRef = useRef<PhonePersistentLink | null>(null)
  const [phoneLinkState, setPhoneLinkState] = useState<ActivePhoneLinkView | null>(null)
  const [reportReceivedNotice, setReportReceivedNotice] = useState<string | null>(null)
  const userIdRef = useRef<string | undefined>(userId)
  userIdRef.current = userId

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

  const handleDisconnectPhoneLink = useCallback(() => {
    phoneLinkRef.current?.disconnect()
    phoneLinkRef.current = null
    clearActivePhoneLink()
    setPhoneLinkState(null)
  }, [])

  const handleConnectPhoneLink = useCallback(
    (code: string, setup: SessionSetup | null, isReconnect = false) => {
      const cleaned = code.replace(/\D/g, '').slice(0, 4)
      if (cleaned.length !== 4) return

      // Reuse existing live link for same code if launching a new setup
      if (phoneLinkRef.current && phoneLinkRef.current.code === cleaned && setup && !isReconnect) {
        phoneLinkRef.current.sendLaunchSetup(setup)
        setPhoneLinkState((prev) => ({
          code: cleaned,
          phase: 'waiting_headset',
          message: 'Sending session to headset…',
          setupTitle: setup.title || prev?.setupTitle || 'VR Session',
        }))
        return
      }

      phoneLinkRef.current?.disconnect()
      const setupTitle = setup?.title ?? loadActivePhoneLink()?.setupTitle ?? 'VR Session'

      const link = createPhonePersistentLink({
        rawCode: cleaned,
        setup,
        isReconnect,
        onUpdate: (update) => {
          setPhoneLinkState({
            code: update.code || cleaned,
            phase: update.phase,
            message: update.message,
            setupTitle,
          })
        },
        onReportReady: (record) => {
          void saveSessionSnapshot(userIdRef.current ?? 'demo-phone', record)
          setAllSessions((prev) => [record, ...prev.filter((item) => item.id !== record.id)])
          setSelectedReport(record)
          setStep('report')
          setReportReceivedNotice(
            `✓ Report received from VR headset (Code ${cleaned}) — "${record.title}"`,
          )
        },
      })
      phoneLinkRef.current = link
    },
    [],
  )

  // Auto-reconnect persistent phone link on mount / page refresh
  useEffect(() => {
    if (isHeadset && !forceWeb2D) return
    const persisted = loadActivePhoneLink()
    if (persisted) {
      handleConnectPhoneLink(persisted.code, null, true)
    }
    return () => {
      phoneLinkRef.current?.disconnect()
      phoneLinkRef.current = null
    }
  }, [forceWeb2D, handleConnectPhoneLink, isHeadset])

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
  const showPersistentLinkBar =
    phoneLinkState !== null &&
    (phoneLinkState.phase === 'connected' ||
      phoneLinkState.phase === 'in_session' ||
      phoneLinkState.phase === 'generating_report' ||
      phoneLinkState.phase === 'report_ready')

  return (
    <div className="stagera-shell">
      <header className="stagera-topbar no-print">
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

      {showPersistentLinkBar && phoneLinkState && (
        <div className="persistent-link-bar no-print" role="status" aria-live="polite">
          <div className="persistent-link-info">
            <span className="persistent-link-dot" aria-hidden="true" />
            <span>{phoneLinkState.message}</span>
          </div>
          <div className="persistent-link-actions">
            <button
              id="persistent-link-resync-btn"
              type="button"
              className="btn-small-ghost"
              onClick={() => phoneLinkRef.current?.requestSync()}
            >
              {language === 'fr' ? '↻ Synchroniser' : '↻ Re-sync'}
            </button>
            <button
              id="persistent-link-disconnect-btn"
              type="button"
              className="btn-small-ghost"
              onClick={handleDisconnectPhoneLink}
            >
              {language === 'fr' ? 'Déconnecter' : 'Unlink'}
            </button>
          </div>
        </div>
      )}

      <main className="stagera-main">
        {step === 'setup' && (
          <CompanionFlow
            language={language}
            sessions={allSessions}
            phoneLinkState={phoneLinkState}
            onConnectHeadset={(code, setup) => handleConnectPhoneLink(code, setup, false)}
            onResyncHeadset={() => phoneLinkRef.current?.requestSync()}
            onDisconnectHeadset={handleDisconnectPhoneLink}
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
          <>
            {reportReceivedNotice && (
              <div className="report-handoff-banner no-print" role="status">
                <span>{reportReceivedNotice}</span>
                <button
                  type="button"
                  className="btn-small-ghost"
                  onClick={() => setReportReceivedNotice(null)}
                >
                  ✕
                </button>
              </div>
            )}
            <Step3ReportFlow
              record={activeReportRecord}
              allSessions={allSessions}
              language={language}
              onLaunchVRWithSetup={(setup) => {
                setActiveSetup(setup)
                setStep('vr')
              }}
            />
          </>
        )}
      </main>
    </div>
  )
}

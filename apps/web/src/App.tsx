import { useEffect, useState } from 'react'
import { CompanionFlow } from './companion/CompanionFlow'
import { getStoredLanguage, setStoredLanguage } from './lib/auth'
import { translations } from './lib/i18n'
import type { AppLanguage, SessionRecord, SessionSetup } from './types/stagera'
import { VRPreFlight } from './vr/VRPreFlight'
import { VRStage } from './vr/VRStage'

export function App() {
  const [step, setStep] = useState<'setup' | 'vr' | 'report'>('setup')
  const [activeSetup, setActiveSetup] = useState<SessionSetup | null>(null)
  const [lastRecord, setLastRecord] = useState<SessionRecord | null>(null)
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [language, setLanguage] = useState<AppLanguage>(() => getStoredLanguage())

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const handleLanguageChange = (next: AppLanguage) => {
    setLanguage(next)
    setStoredLanguage(next)
  }

  const t = translations[language].app

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
            onLanguageChange={handleLanguageChange}
            onLaunchVR={(setup) => {
              setActiveSetup(setup)
              setStep('vr')
            }}
            onOpenReport={() => setStep('report')}
          />
        )}

        {step === 'vr' && (
          <div className="stage-card">
            {activeSetup ? (
              <VRStage
                setup={activeSetup}
                language={language}
                captionsEnabled={captionsEnabled}
                onBackToPreFlight={() => setActiveSetup(null)}
                onEndSession={(record) => {
                  setLastRecord(record)
                  setStep('report')
                }}
              />
            ) : (
              <VRPreFlight
                language={language}
                captionsEnabled={captionsEnabled}
                onToggleCaptions={() => setCaptionsEnabled((prev) => !prev)}
                onStartSession={(setup) => setActiveSetup(setup)}
              />
            )}
          </div>
        )}

        {step === 'report' && (
          <section className="stage-card" aria-labelledby="report-heading">
            <h1 id="report-heading" className="screen-title">
              {lastRecord ? lastRecord.title : t.reportPlaceholderTitle}
            </h1>
            <p className="screen-subtitle" style={{ marginBottom: 0 }}>
              {lastRecord
                ? `${lastRecord.wpm} WPM · ${lastRecord.fillerCount} fillers · ${lastRecord.topicsCovered}/${lastRecord.topicsTotal} topics · ${lastRecord.flaggedMoments.length} flagged moment(s)`
                : t.reportPlaceholderDesc}
            </p>
          </section>
        )}
      </main>
    </div>
  )
}

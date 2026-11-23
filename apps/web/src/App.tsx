import { useEffect, useState } from 'react'
import { CompanionFlow } from './companion/CompanionFlow'
import { getStoredLanguage, setStoredLanguage } from './lib/auth'
import { translations } from './lib/i18n'
import type { AppLanguage, VenueType } from './types/stagera'
import { VRStage } from './vr/VRStage'

export function App() {
  const [step, setStep] = useState<'setup' | 'vr' | 'report'>('setup')
  const [venue, setVenue] = useState<VenueType>('lecture_hall')
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
            onLaunchVR={(selectedVenue) => {
              setVenue(selectedVenue)
              setStep('vr')
            }}
            onOpenReport={() => setStep('report')}
          />
        )}

        {step === 'vr' && (
          <div className="stage-card">
            <VRStage venue={venue} />
          </div>
        )}

        {step === 'report' && (
          <section className="stage-card" aria-labelledby="report-heading">
            <h1 id="report-heading" className="screen-title">
              {t.reportPlaceholderTitle}
            </h1>
            <p className="screen-subtitle" style={{ marginBottom: 0 }}>
              {t.reportPlaceholderDesc}
            </p>
          </section>
        )}
      </main>
    </div>
  )
}

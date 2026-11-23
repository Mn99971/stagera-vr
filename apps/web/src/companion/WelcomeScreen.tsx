import { translations } from '../lib/i18n'
import type { AppLanguage } from '../types/stagera'
import { LanguageToggle } from './LanguageToggle'

interface WelcomeScreenProps {
  language: AppLanguage
  onLanguageChange: (lang: AppLanguage) => void
  onGetStarted: () => void
  onAlreadyHaveAccount: () => void
}

export function WelcomeScreen({
  language,
  onLanguageChange,
  onGetStarted,
  onAlreadyHaveAccount,
}: WelcomeScreenProps) {
  const t = translations[language].welcome

  return (
    <section className="companion-screen" aria-labelledby="welcome-heading">
      <div className="screen-header">
        <div className="stagera-brand">
          <span className="stagera-brand-mark" aria-hidden="true">
            S
          </span>
          <span>Stagera VR</span>
        </div>
        <LanguageToggle language={language} onChange={onLanguageChange} idPrefix="welcome-lang" />
      </div>

      <h1 id="welcome-heading" className="screen-title">
        {t.title}
      </h1>
      <p className="screen-subtitle">{t.subtitle}</p>

      <div className="welcome-features">
        <div className="welcome-feature">
          <h2>{t.feature1Title}</h2>
          <p>{t.feature1Desc}</p>
        </div>
        <div className="welcome-feature">
          <h2>{t.feature2Title}</h2>
          <p>{t.feature2Desc}</p>
        </div>
        <div className="welcome-feature">
          <h2>{t.feature3Title}</h2>
          <p>{t.feature3Desc}</p>
        </div>
      </div>

      <div className="welcome-actions">
        <button id="welcome-get-started" type="button" className="btn-primary" onClick={onGetStarted}>
          {t.getStarted}
        </button>
        <button
          id="welcome-already-have-account"
          type="button"
          className="btn-secondary"
          onClick={onAlreadyHaveAccount}
        >
          {t.alreadyHaveAccount}
        </button>
      </div>

      <p className="welcome-footer">{t.footerNote}</p>
    </section>
  )
}

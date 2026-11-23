import type { AppLanguage } from '../types/stagera'

interface LanguageToggleProps {
  language: AppLanguage
  onChange: (lang: AppLanguage) => void
  idPrefix?: string
}

export function LanguageToggle({ language, onChange, idPrefix = 'lang' }: LanguageToggleProps) {
  return (
    <div className="lang-toggle" role="group" aria-label="Language selector">
      <button
        id={`${idPrefix}-en`}
        type="button"
        className={`lang-toggle-btn ${language === 'en' ? 'active' : ''}`}
        aria-pressed={language === 'en'}
        onClick={() => onChange('en')}
      >
        EN
      </button>
      <button
        id={`${idPrefix}-fr`}
        type="button"
        className={`lang-toggle-btn ${language === 'fr' ? 'active' : ''}`}
        aria-pressed={language === 'fr'}
        onClick={() => onChange('fr')}
      >
        FR
      </button>
    </div>
  )
}

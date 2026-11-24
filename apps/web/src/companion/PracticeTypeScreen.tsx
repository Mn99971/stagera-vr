import { translations } from '../lib/i18n'
import type { AppLanguage, PracticeType } from '../types/stagera'

interface PracticeTypeScreenProps {
  language: AppLanguage
  selected: PracticeType | null
  onSelect: (type: PracticeType) => void
  onContinue: () => void
}

const PRACTICE_TYPES: PracticeType[] = ['presentation', 'interview', 'pitch', 'panel']

function PracticeTypeIcon({ type }: { type: PracticeType }) {
  switch (type) {
    case 'presentation':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M12 16v4" />
          <path d="M8 20h8" />
        </svg>
      )
    case 'interview':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19a6 6 0 0 1 12 0" />
          <path d="M16 11h5l-2 2 2 2h-5" />
        </svg>
      )
    case 'pitch':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 17l6-6 4 4 7-7" />
          <path d="M14 8h6v6" />
        </svg>
      )
    case 'panel':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="6" cy="9" r="2.5" />
          <circle cx="12" cy="8" r="2.5" />
          <circle cx="18" cy="9" r="2.5" />
          <path d="M2 19a4 4 0 0 1 8 0" />
          <path d="M8 19a4 4 0 0 1 8 0" />
          <path d="M14 19a4 4 0 0 1 8 0" />
        </svg>
      )
  }
}

export function PracticeTypeScreen({
  language,
  selected,
  onSelect,
  onContinue,
}: PracticeTypeScreenProps) {
  const t = translations[language].wizard

  return (
    <div className="wizard-body">
      <h1 className="screen-title">{t.practiceType.heading}</h1>
      <p className="screen-subtitle">{t.practiceType.subtitle}</p>

      <div className="practice-type-list" role="radiogroup" aria-label={t.practiceType.heading}>
        {PRACTICE_TYPES.map((type) => {
          const card = t.practiceType.cards[type]
          const isSelected = selected === type
          return (
            <button
              key={type}
              id={`practice-type-${type}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`practice-type-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(type)}
            >
              <span className="practice-type-icon">
                <PracticeTypeIcon type={type} />
              </span>
              <span className="practice-type-content">
                <span className="practice-type-title">{card.title}</span>
                <span className="practice-type-desc">{card.desc}</span>
                <span className="practice-type-venue">{card.venueHint}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="wizard-footer-actions">
        <button
          id="wizard-step1-continue"
          type="button"
          className="btn-primary"
          disabled={!selected}
          onClick={onContinue}
        >
          {t.continue}
        </button>
      </div>
    </div>
  )
}

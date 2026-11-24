import { translations } from '../lib/i18n'
import type {
  AppLanguage,
  AudienceBehaviour,
  InterruptionLevel,
  PracticeType,
  VenueType,
} from '../types/stagera'

interface VenueAudienceScreenProps {
  language: AppLanguage
  practiceType: PracticeType
  venue: VenueType
  audienceBehaviour: AudienceBehaviour
  interruptionLevel: InterruptionLevel
  followUps: boolean
  questionsAtEnd: boolean
  unexpectedQuestions: boolean
  onVenueChange: (venue: VenueType) => void
  onBehaviourChange: (behaviour: AudienceBehaviour) => void
  onInterruptionChange: (level: InterruptionLevel) => void
  onToggleFollowUps: () => void
  onToggleQuestionsAtEnd: () => void
  onToggleUnexpectedQuestions: () => void
  onContinue: () => void
}

const BEHAVIOURS: AudienceBehaviour[] = ['supportive', 'attentive', 'distracted', 'challenging']
const INTERRUPTIONS: InterruptionLevel[] = ['none', 'low', 'medium', 'high']

export function VenueAudienceScreen({
  language,
  practiceType,
  venue,
  audienceBehaviour,
  interruptionLevel,
  followUps,
  questionsAtEnd,
  unexpectedQuestions,
  onVenueChange,
  onBehaviourChange,
  onInterruptionChange,
  onToggleFollowUps,
  onToggleQuestionsAtEnd,
  onToggleUnexpectedQuestions,
  onContinue,
}: VenueAudienceScreenProps) {
  const t = translations[language].wizard
  const s = t.venueAudience

  const venueOptions: Array<'classroom' | 'lecture_hall' | 'auditorium' | 'panel_room'> =
    practiceType === 'panel'
      ? ['panel_room', 'classroom', 'lecture_hall', 'auditorium']
      : ['classroom', 'lecture_hall', 'auditorium']

  return (
    <div className="wizard-body">
      <h1 className="screen-title">{s.heading}</h1>
      <p className="screen-subtitle">{s.subtitle}</p>

      <div className="wizard-section">
        <p className="section-label">{s.venueLabel}</p>
        <div className="venue-card-list" role="radiogroup" aria-label={s.venueLabel}>
          {venueOptions.map((v) => {
            const info = s.venues[v]
            const selected = venue === v
            return (
              <button
                key={v}
                id={`venue-card-${v}`}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`venue-card ${selected ? 'selected' : ''}`}
                onClick={() => onVenueChange(v)}
              >
                <span className="venue-card-top">
                  <span className="venue-card-name">{info.name}</span>
                  <span className="venue-seats-pill">{info.seats}</span>
                </span>
                <span className="venue-card-desc">{info.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="wizard-section">
        <p className="section-label">{s.behaviourLabel}</p>
        <div className="role-grid" role="radiogroup" aria-label={s.behaviourLabel}>
          {BEHAVIOURS.map((b) => {
            const info = s.behaviours[b]
            const selected = audienceBehaviour === b
            return (
              <button
                key={b}
                id={`behaviour-${b}`}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`role-card ${selected ? 'selected' : ''}`}
                onClick={() => onBehaviourChange(b)}
              >
                <span className="role-card-title">{info.label}</span>
                <span className="role-card-desc">{info.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="wizard-section">
        <p className="section-label">{s.interruptionsLabel}</p>
        <p className="section-hint">{s.interruptionsHint}</p>
        <div className="rate-grid" role="radiogroup" aria-label={s.interruptionsLabel}>
          {INTERRUPTIONS.map((lvl) => {
            const info = s.interruptions[lvl]
            const selected = interruptionLevel === lvl
            return (
              <button
                key={lvl}
                id={`interruption-${lvl}`}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`rate-card ${selected ? 'selected' : ''}`}
                onClick={() => onInterruptionChange(lvl)}
              >
                <span className="rate-card-label">{info.label}</span>
                <span className="rate-card-sub">{info.rate}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="dash-card" style={{ marginBottom: 0 }}>
        <p className="section-label" style={{ marginBottom: 4 }}>
          {s.qaOptionsLabel}
        </p>

        <div className="setting-row">
          <div>
            <p className="setting-title">{s.followUpsTitle}</p>
            <p className="setting-desc">{s.followUpsDesc}</p>
          </div>
          <button
            id="toggle-followups"
            type="button"
            role="switch"
            aria-checked={followUps}
            aria-label={s.followUpsTitle}
            className={`toggle-switch ${followUps ? 'on' : ''}`}
            onClick={onToggleFollowUps}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="setting-row">
          <div>
            <p className="setting-title">{s.questionsAtEndTitle}</p>
            <p className="setting-desc">{s.questionsAtEndDesc}</p>
          </div>
          <button
            id="toggle-questions-end"
            type="button"
            role="switch"
            aria-checked={questionsAtEnd}
            aria-label={s.questionsAtEndTitle}
            className={`toggle-switch ${questionsAtEnd ? 'on' : ''}`}
            onClick={onToggleQuestionsAtEnd}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="setting-row">
          <div>
            <p className="setting-title">{s.unexpectedQuestionsTitle}</p>
            <p className="setting-desc">{s.unexpectedQuestionsDesc}</p>
          </div>
          <button
            id="toggle-unexpected-questions"
            type="button"
            role="switch"
            aria-checked={unexpectedQuestions}
            aria-label={s.unexpectedQuestionsTitle}
            className={`toggle-switch ${unexpectedQuestions ? 'on' : ''}`}
            onClick={onToggleUnexpectedQuestions}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
      </div>

      <div className="wizard-footer-actions">
        <button
          id="wizard-step4-continue"
          type="button"
          className="btn-primary"
          onClick={onContinue}
        >
          {t.continue}
        </button>
      </div>
    </div>
  )
}

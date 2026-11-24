import { translations } from '../lib/i18n'
import type {
  AppLanguage,
  AudienceBehaviour,
  InterruptionLevel,
  VenueType,
} from '../types/stagera'

interface GoalsInterviewerScreenProps {
  language: AppLanguage
  goals: string[]
  venue: VenueType
  interviewerStyle: AudienceBehaviour
  interruptionLevel: InterruptionLevel
  followUps: boolean
  coachedMode: boolean
  onGoalsChange: (goals: string[]) => void
  onVenueChange: (venue: VenueType) => void
  onStyleChange: (style: AudienceBehaviour) => void
  onInterruptionChange: (level: InterruptionLevel) => void
  onToggleFollowUps: () => void
  onToggleCoachedMode: () => void
  onContinue: () => void
}

const MAX_GOALS = 3
const INTERVIEW_SETTINGS: Array<'interview_room' | 'panel_room'> = [
  'interview_room',
  'panel_room',
]
const INTERVIEWER_STYLES: Array<'supportive' | 'attentive' | 'challenging'> = [
  'supportive',
  'attentive',
  'challenging',
]
const INTERRUPTIONS: InterruptionLevel[] = ['none', 'low', 'medium', 'high']

export function GoalsInterviewerScreen({
  language,
  goals,
  venue,
  interviewerStyle,
  interruptionLevel,
  followUps,
  coachedMode,
  onGoalsChange,
  onVenueChange,
  onStyleChange,
  onInterruptionChange,
  onToggleFollowUps,
  onToggleCoachedMode,
  onContinue,
}: GoalsInterviewerScreenProps) {
  const t = translations[language].wizard
  const s = t.goalsInterviewer
  const va = t.venueAudience

  const toggleGoal = (goalId: string) => {
    if (goals.includes(goalId)) {
      onGoalsChange(goals.filter((g) => g !== goalId))
    } else if (goals.length < MAX_GOALS) {
      onGoalsChange([...goals, goalId])
    }
  }

  const maxReached = goals.length >= MAX_GOALS

  return (
    <div className="wizard-body">
      <h1 className="screen-title">{s.heading}</h1>
      <p className="screen-subtitle">{s.subtitle}</p>

      <div className="wizard-section">
        <p className="section-label">
          <span>{s.goalsLabel}</span>
          <span className={`goal-counter ${maxReached ? 'max' : ''}`}>
            {goals.length} / {MAX_GOALS}
          </span>
        </p>
        <p className="section-hint">{maxReached ? s.goalsMaxReached : s.goalsHint}</p>
        <div className="chip-list" role="group" aria-label={s.goalsLabel}>
          {s.goalOptions.map((opt) => {
            const isSelected = goals.includes(opt.id)
            const disabled = !isSelected && maxReached
            return (
              <button
                key={opt.id}
                id={`interview-goal-${opt.id}`}
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                className={`chip-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleGoal(opt.id)}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="wizard-section">
        <p className="section-label">{s.settingLabel}</p>
        <div className="venue-card-list" role="radiogroup" aria-label={s.settingLabel}>
          {INTERVIEW_SETTINGS.map((setting) => {
            const info = s.settings[setting]
            const selected = venue === setting
            return (
              <button
                key={setting}
                id={`interview-setting-${setting}`}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`venue-card ${selected ? 'selected' : ''}`}
                onClick={() => onVenueChange(setting)}
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
        <p className="section-label">{s.styleLabel}</p>
        <div className="style-grid" role="radiogroup" aria-label={s.styleLabel}>
          {INTERVIEWER_STYLES.map((style) => {
            const info = s.styles[style]
            const selected = interviewerStyle === style
            return (
              <button
                key={style}
                id={`interviewer-style-${style}`}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`role-card ${selected ? 'selected' : ''}`}
                onClick={() => onStyleChange(style)}
              >
                <span className="role-card-title">{info.label}</span>
                <span className="role-card-desc">{info.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="wizard-section">
        <p className="section-label">{va.interruptionsLabel}</p>
        <p className="section-hint">{va.interruptionsHint}</p>
        <div className="rate-grid" role="radiogroup" aria-label={va.interruptionsLabel}>
          {INTERRUPTIONS.map((lvl) => {
            const info = va.interruptions[lvl]
            const selected = interruptionLevel === lvl
            return (
              <button
                key={lvl}
                id={`interview-interruption-${lvl}`}
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
        <div className="setting-row">
          <div>
            <p className="setting-title">{va.followUpsTitle}</p>
            <p className="setting-desc">{va.followUpsDesc}</p>
          </div>
          <button
            id="interview-toggle-followups"
            type="button"
            role="switch"
            aria-checked={followUps}
            aria-label={va.followUpsTitle}
            className={`toggle-switch ${followUps ? 'on' : ''}`}
            onClick={onToggleFollowUps}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="setting-row">
          <div>
            <p className="setting-title">{s.coachedTitle}</p>
            <p className="setting-desc">{s.coachedDesc}</p>
            <p className="coached-separate-note">{s.coachedBadgeNote}</p>
          </div>
          <button
            id="interview-toggle-coached"
            type="button"
            role="switch"
            aria-checked={coachedMode}
            aria-label={s.coachedTitle}
            className={`toggle-switch ${coachedMode ? 'on' : ''}`}
            onClick={onToggleCoachedMode}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
      </div>

      <div className="wizard-footer-actions">
        <button
          id="wizard-step4b-continue"
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

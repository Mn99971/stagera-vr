import { translations } from '../lib/i18n'
import type {
  AppLanguage,
  AudienceBehaviour,
  InterruptionLevel,
  PracticeType,
  Topic,
  UploadedMaterialFile,
  VenueType,
} from '../types/stagera'

export type EditableWizardStep = 1 | 2 | 3 | 4

interface SessionReviewScreenProps {
  language: AppLanguage
  practiceType: PracticeType
  files: UploadedMaterialFile[]
  outlineText: string
  jobTitle: string
  topics: Topic[]
  includedTopicIds: string[]
  venue: VenueType
  audienceBehaviour: AudienceBehaviour
  interruptionLevel: InterruptionLevel
  goals: string[]
  coachedMode: boolean
  timeLimitMinutes: number
  oneMinWarning: boolean
  isSaving: boolean
  onToggleTopicIncluded: (topicId: string) => void
  onTimeLimitChange: (minutes: number) => void
  onToggleOneMinWarning: () => void
  onJumpToStep: (step: EditableWizardStep) => void
  onSendToHeadset: () => void
  onSaveForLater: () => void
}

const PRESET_MINUTES = [5, 10, 15, 20] as const

export function SessionReviewScreen({
  language,
  practiceType,
  files,
  outlineText,
  jobTitle,
  topics,
  includedTopicIds,
  venue,
  audienceBehaviour,
  interruptionLevel,
  goals,
  coachedMode,
  timeLimitMinutes,
  oneMinWarning,
  isSaving,
  onToggleTopicIncluded,
  onTimeLimitChange,
  onToggleOneMinWarning,
  onJumpToStep,
  onSendToHeadset,
  onSaveForLater,
}: SessionReviewScreenProps) {
  const t = translations[language].wizard
  const homeT = translations[language].home
  const r = t.review
  const isInterview = practiceType === 'interview'
  const isFullRehearsal = !PRESET_MINUTES.includes(timeLimitMinutes as (typeof PRESET_MINUTES)[number])

  const includedCount = isInterview
    ? topics.length
    : topics.filter((item) => includedTopicIds.includes(item.id)).length

  const materialSummary = isInterview
    ? jobTitle.trim() || homeT.practiceTypes.interview
    : files.length > 0
      ? r.materialFilesCount.replace('{count}', String(files.length))
      : outlineText.trim()
        ? r.materialOutlineOnly
        : r.materialNoSlides

  const styleLabel = isInterview
    ? t.goalsInterviewer.styles[
        audienceBehaviour === 'distracted' ? 'attentive' : audienceBehaviour
      ].label
    : t.venueAudience.behaviours[audienceBehaviour].label

  const interruptionLabel = `${t.venueAudience.interruptions[interruptionLevel].label} (${t.venueAudience.interruptions[interruptionLevel].rate})`

  const goalLabels = goals
    .map((id) => t.goalsInterviewer.goalOptions.find((g) => g.id === id)?.label)
    .filter((label): label is string => Boolean(label))

  return (
    <div className="wizard-body">
      <h1 className="screen-title">{r.heading}</h1>
      <p className="screen-subtitle">{r.subtitle}</p>

      {!isInterview && topics.length > 0 && (
        <div className="wizard-section">
          <p className="section-label">
            <span>{r.topicSubsetLabel}</span>
            <span className="dash-card-meta">
              {r.topicSubsetSelected
                .replace('{selected}', String(includedCount))
                .replace('{total}', String(topics.length))}
            </span>
          </p>
          <p className="section-hint">{r.topicSubsetHint}</p>
          <ul className="topic-subset-list">
            {topics.map((topic) => {
              const checked = includedTopicIds.includes(topic.id)
              const disableUncheck = checked && includedCount <= 1
              return (
                <li key={topic.id} className="topic-subset-row">
                  <label className="topic-subset-label">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disableUncheck}
                      onChange={() => onToggleTopicIncluded(topic.id)}
                    />
                    <span className="topic-subset-title">{topic.title}</span>
                    {topic.brief && (
                      <span className="tag-coached">{t.topics.briefToggle}</span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="wizard-section">
        <p className="section-label">{r.timeLimitLabel}</p>
        <div className="chip-list" role="radiogroup" aria-label={r.timeLimitLabel}>
          {PRESET_MINUTES.map((mins) => {
            const selected = timeLimitMinutes === mins
            return (
              <button
                key={mins}
                id={`time-chip-${mins}`}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`chip-btn ${selected ? 'selected' : ''}`}
                onClick={() => onTimeLimitChange(mins)}
              >
                {mins} {homeT.minUnit}
              </button>
            )
          })}
          <button
            id="time-chip-full"
            type="button"
            role="radio"
            aria-checked={isFullRehearsal}
            className={`chip-btn ${isFullRehearsal ? 'selected' : ''}`}
            onClick={() => onTimeLimitChange(isFullRehearsal ? timeLimitMinutes : 45)}
          >
            {r.fullRehearsalChip}
          </button>
        </div>

        {isFullRehearsal && (
          <div className="full-rehearsal-slider">
            <label htmlFor="full-rehearsal-range" className="field-label">
              <span>{r.customMinutesLabel}</span>
              <span className="wizard-type-pill">
                {timeLimitMinutes} {homeT.minUnit}
              </span>
            </label>
            <input
              id="full-rehearsal-range"
              type="range"
              min={25}
              max={90}
              step={5}
              value={timeLimitMinutes}
              onChange={(e) => onTimeLimitChange(Number(e.target.value))}
            />
            <div className="slider-scale">
              <span>25 {homeT.minUnit}</span>
              <span>60 {homeT.minUnit}</span>
              <span>90 {homeT.minUnit}</span>
            </div>
          </div>
        )}
      </div>

      <div className="dash-card">
        <div className="setting-row" style={{ padding: 0 }}>
          <div>
            <p className="setting-title">{r.oneMinWarningTitle}</p>
            <p className="setting-desc">{r.oneMinWarningDesc}</p>
          </div>
          <button
            id="toggle-one-min-warning"
            type="button"
            role="switch"
            aria-checked={oneMinWarning}
            aria-label={r.oneMinWarningTitle}
            className={`toggle-switch ${oneMinWarning ? 'on' : ''}`}
            onClick={onToggleOneMinWarning}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
      </div>

      <div className="dash-card" style={{ marginBottom: 0 }}>
        <div className="dash-card-header" style={{ marginBottom: 4 }}>
          <h2 className="dash-card-title">{r.summaryHeading}</h2>
        </div>
        <p className="section-hint" style={{ marginTop: 0, marginBottom: 10 }}>
          {r.summaryTapHint}
        </p>

        <div className="summary-list">
          <button
            type="button"
            className="summary-row-btn"
            onClick={() => onJumpToStep(1)}
          >
            <span className="summary-row-key">{r.rowPracticeType}</span>
            <span className="summary-row-val">
              {homeT.practiceTypes[practiceType]}
              <span className="summary-edit-hint">{r.editLabel}</span>
            </span>
          </button>

          <button
            type="button"
            className="summary-row-btn"
            onClick={() => onJumpToStep(2)}
          >
            <span className="summary-row-key">{r.rowMaterial}</span>
            <span className="summary-row-val">
              {materialSummary}
              <span className="summary-edit-hint">{r.editLabel}</span>
            </span>
          </button>

          <button
            type="button"
            className="summary-row-btn"
            onClick={() => onJumpToStep(3)}
          >
            <span className="summary-row-key">{r.rowTopics}</span>
            <span className="summary-row-val">
              {r.topicsCountValue.replace('{count}', String(includedCount))}
              <span className="summary-edit-hint">{r.editLabel}</span>
            </span>
          </button>

          <button
            type="button"
            className="summary-row-btn"
            onClick={() => onJumpToStep(4)}
          >
            <span className="summary-row-key">{r.rowVenue}</span>
            <span className="summary-row-val">
              {homeT.venues[venue]}
              <span className="summary-edit-hint">{r.editLabel}</span>
            </span>
          </button>

          <button
            type="button"
            className="summary-row-btn"
            onClick={() => onJumpToStep(4)}
          >
            <span className="summary-row-key">
              {isInterview ? r.rowInterviewerStyle : r.rowBehaviour}
            </span>
            <span className="summary-row-val">
              {styleLabel}
              <span className="summary-edit-hint">{r.editLabel}</span>
            </span>
          </button>

          <button
            type="button"
            className="summary-row-btn"
            onClick={() => onJumpToStep(4)}
          >
            <span className="summary-row-key">{r.rowInterruptions}</span>
            <span className="summary-row-val">
              {interruptionLabel}
              <span className="summary-edit-hint">{r.editLabel}</span>
            </span>
          </button>

          {isInterview && (
            <>
              <button
                type="button"
                className="summary-row-btn"
                onClick={() => onJumpToStep(4)}
              >
                <span className="summary-row-key">{r.rowGoals}</span>
                <span className="summary-row-val">
                  {goalLabels.length > 0 ? goalLabels.join(', ') : '—'}
                  <span className="summary-edit-hint">{r.editLabel}</span>
                </span>
              </button>

              <button
                type="button"
                className="summary-row-btn"
                onClick={() => onJumpToStep(4)}
              >
                <span className="summary-row-key">{r.rowCoached}</span>
                <span className="summary-row-val">
                  {coachedMode ? r.coachedSeparateLabel : r.independentLabel}
                  <span className="summary-edit-hint">{r.editLabel}</span>
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="wizard-footer-actions">
        <button
          id="wizard-send-to-headset-btn"
          type="button"
          className="btn-primary"
          disabled={isSaving}
          onClick={onSendToHeadset}
        >
          {isSaving ? r.saving : r.sendToHeadset}
        </button>
        <button
          id="wizard-save-for-later-btn"
          type="button"
          className="btn-secondary"
          disabled={isSaving}
          onClick={onSaveForLater}
        >
          {r.saveForLater}
        </button>
      </div>
    </div>
  )
}

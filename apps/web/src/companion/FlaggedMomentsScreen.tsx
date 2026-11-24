import { translations } from '../lib/i18n'
import type { AppLanguage, FlaggedMoment, SessionRecord } from '../types/stagera'

interface FlaggedMomentsScreenProps {
  record: SessionRecord
  language: AppLanguage
  onBack: () => void
  onSelectMoment: (moment: FlaggedMoment) => void
}

function formatTs(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60)
  const s = Math.max(0, seconds) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function FlaggedMomentsScreen({
  record,
  language,
  onBack,
  onSelectMoment,
}: FlaggedMomentsScreenProps) {
  const step3T = translations[language].step3
  const t = step3T.timeline

  const sorted = [...record.flaggedMoments].sort(
    (a, b) => a.timestampSeconds - b.timestampSeconds,
  )

  return (
    <div className="report-shell">
      <div>
        <button id="timeline-back-btn" type="button" className="back-btn" onClick={onBack}>
          <span aria-hidden="true">←</span>
          <span>{step3T.backToReport}</span>
        </button>
        <span className="step-kicker" style={{ display: 'block', marginTop: 8 }}>
          {t.kicker}
        </span>
        <h1 className="screen-title" style={{ marginTop: 4 }}>
          {t.heading}
        </h1>
        <p className="screen-subtitle" style={{ marginBottom: 0 }}>
          {t.subtitle}
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="dash-card">
          <p className="setting-desc">{t.empty}</p>
        </div>
      ) : (
        <ol className="timeline-list">
          {sorted.map((moment) => (
            <li key={moment.id} className="timeline-item">
              <button
                type="button"
                className="timeline-card-btn"
                onClick={() => onSelectMoment(moment)}
              >
                <div className="timeline-card-top">
                  <span className="wizard-type-pill">{formatTs(moment.timestampSeconds)}</span>
                  <span className={`moment-type-badge ${moment.momentType}`}>
                    {t.types[moment.momentType]}
                  </span>
                  {moment.recoverySuccessful && (
                    <span className="tag-coached">{t.recoveredBadge}</span>
                  )}
                </div>

                <p className="timeline-label">{moment.label}</p>

                {moment.transcriptExcerpt && (
                  <p className="timeline-excerpt">“{moment.transcriptExcerpt}”</p>
                )}

                {moment.aiTip && <p className="timeline-tip">💡 {moment.aiTip}</p>}

                <span className="timeline-cta">{t.openReplay} →</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

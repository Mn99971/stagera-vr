import { translations } from '../lib/i18n'
import type { AppLanguage, SessionRecord } from '../types/stagera'

interface AttemptComparisonScreenProps {
  current: SessionRecord
  allSessions: SessionRecord[]
  language: AppLanguage
  onBack: () => void
}

function formatDuration(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60)
  const s = Math.max(0, sec) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function AttemptComparisonScreen({
  current,
  allSessions,
  language,
  onBack,
}: AttemptComparisonScreenProps) {
  const step3T = translations[language].step3
  const t = step3T.compare

  // Find prior attempts of the same setup (or same practiceType as fallback)
  const priorCandidates = allSessions
    .filter((s) => s.id !== current.id)
    .filter((s) =>
      current.setupId ? s.setupId === current.setupId || s.practiceType === current.practiceType : s.practiceType === current.practiceType,
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const previous = priorCandidates[0] ?? null

  const currentSideEye = current.eyeContactZones.left + current.eyeContactZones.right
  const prevSideEye = previous
    ? previous.eyeContactZones.left + previous.eyeContactZones.right
    : 0

  const renderDelta = (diff: number, lowerIsBetter = false, suffix = '') => {
    if (diff === 0) return <span className="delta-pill neutral">0{suffix}</span>
    const improved = lowerIsBetter ? diff < 0 : diff > 0
    const sign = diff > 0 ? '+' : ''
    return (
      <span className={`delta-pill ${improved ? 'good' : 'warn'}`}>
        {sign}
        {diff}
        {suffix}
      </span>
    )
  }

  return (
    <div className="report-shell">
      <div>
        <button id="compare-back-btn" type="button" className="back-btn" onClick={onBack}>
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

      {!previous ? (
        <div className="dash-card">
          <p className="setting-desc">{t.noPriorAttempts}</p>
        </div>
      ) : (
        <div className="dash-card" style={{ marginBottom: 0 }}>
          <div className="compare-badges-row">
            <div className="compare-attempt-col">
              <span className="debrief-metric-label">{t.currentLabel}</span>
              <strong>{current.title}</strong>
              <span
                className={`attempt-mode-pill ${current.coachedMode ? 'coached' : 'independent'}`}
              >
                {current.coachedMode ? t.coachedAssisted : t.independentAttempt}
              </span>
            </div>

            <div className="compare-attempt-col">
              <span className="debrief-metric-label">{t.previousLabel}</span>
              <strong>{previous.title}</strong>
              <span
                className={`attempt-mode-pill ${previous.coachedMode ? 'coached' : 'independent'}`}
              >
                {previous.coachedMode ? t.coachedAssisted : t.independentAttempt}
              </span>
            </div>
          </div>

          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>{t.metricCol}</th>
                  <th>{t.previousLabel}</th>
                  <th>{t.currentLabel}</th>
                  <th>{t.deltaCol}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t.rowWpm}</td>
                  <td>{previous.wpm}</td>
                  <td>
                    <strong>{current.wpm}</strong>
                  </td>
                  <td>{renderDelta(current.wpm - previous.wpm, previous.wpm > 150)}</td>
                </tr>
                <tr>
                  <td>{t.rowFillers}</td>
                  <td>{previous.fillerCount}</td>
                  <td>
                    <strong>{current.fillerCount}</strong>
                  </td>
                  <td>{renderDelta(current.fillerCount - previous.fillerCount, true)}</td>
                </tr>
                <tr>
                  <td>{t.rowTopics}</td>
                  <td>
                    {previous.topicsCovered}/{previous.topicsTotal}
                  </td>
                  <td>
                    <strong>
                      {current.topicsCovered}/{current.topicsTotal}
                    </strong>
                  </td>
                  <td>{renderDelta(current.topicsCovered - previous.topicsCovered, false)}</td>
                </tr>
                <tr>
                  <td>{t.rowEyeContact}</td>
                  <td>{prevSideEye}%</td>
                  <td>
                    <strong>{currentSideEye}%</strong>
                  </td>
                  <td>{renderDelta(currentSideEye - prevSideEye, false, '%')}</td>
                </tr>
                <tr>
                  <td>{t.rowTime}</td>
                  <td>{formatDuration(previous.durationSeconds)}</td>
                  <td>
                    <strong>{formatDuration(current.durationSeconds)}</strong>
                  </td>
                  <td>
                    {renderDelta(
                      Math.round((current.durationSeconds - previous.durationSeconds) / 60),
                      false,
                      'm',
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

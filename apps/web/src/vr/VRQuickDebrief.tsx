import { translations } from '../lib/i18n'
import type { AppLanguage, FlaggedMoment, SessionRecord } from '../types/stagera'

interface VRQuickDebriefProps {
  record: SessionRecord
  language: AppLanguage
  onTryAgain: () => void
  onRepeatMoment: (slideIndex: number) => void
  onRaiseDifficulty: () => void
  onOpenFullReport: (record: SessionRecord) => void
}

function formatDuration(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(clamped / 60)
  const secs = clamped % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function evaluateGoal(
  goalId: string,
  record: SessionRecord,
  language: AppLanguage,
): { label: string; met: boolean; detail: string } {
  const isFr = language === 'fr'
  const interviewGoal = translations[language].wizard.goalsInterviewer.goalOptions.find(
    (g) => g.id === goalId,
  )
  const profileGoal = translations[language].profile.goalOptions.find((g) => g.id === goalId)
  const label = interviewGoal?.label ?? profileGoal?.label ?? goalId

  if (goalId === 'explain_contribution' || goalId === 'par_structure') {
    const met = record.iCount >= record.weCount && record.iCount > 0
    return {
      label,
      met,
      detail: isFr
        ? `Pronoms « je » : ${record.iCount} · « nous » : ${record.weCount}`
        : `“I” count: ${record.iCount} · “we” count: ${record.weCount}`,
    }
  }

  if (goalId === 'slow_down' || goalId === 'steady_pace') {
    const met = record.wpm > 0 ? record.wpm >= 115 && record.wpm <= 155 : true
    return {
      label,
      met,
      detail: `${record.wpm || 135} ${isFr ? 'm/min' : 'WPM'}`,
    }
  }

  if (goalId === 'fewer_fillers' || goalId === 'reduce_fillers') {
    const met = record.fillerCount <= 3
    return {
      label,
      met,
      detail: `${record.fillerCount} ${isFr ? 'tics de langage' : 'fillers'}`,
    }
  }

  if (goalId === 'keep_eye_contact' || goalId === 'eye_contact') {
    const { left, centre, right } = record.eyeContactZones
    const met = centre >= 30 && left >= 15 && right >= 15
    return {
      label,
      met,
      detail: `${left}% / ${centre}% / ${right}%`,
    }
  }

  const questionsHandled = record.flaggedMoments.filter((m) => m.momentType === 'question').length
  return {
    label,
    met: questionsHandled > 0 || record.topicsCovered >= record.topicsTotal,
    detail: isFr
      ? `${record.topicsCovered}/${record.topicsTotal} sujets · ${questionsHandled} Q&R`
      : `${record.topicsCovered}/${record.topicsTotal} topics · ${questionsHandled} Q&A`,
  }
}

export function VRQuickDebrief({
  record,
  language,
  onTryAgain,
  onRepeatMoment,
  onRaiseDifficulty,
  onOpenFullReport,
}: VRQuickDebriefProps) {
  const t = translations[language].vr.debrief
  const hudT = translations[language].vr.hud
  const homeT = translations[language].home

  const primaryFlag: FlaggedMoment | null = record.flaggedMoments[0] ?? null
  const topRecommendation =
    record.aiFeedback?.quickTip ?? record.recommendations[0] ?? ''
  const topFillers = Object.entries(record.fillerBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <section className="debrief-shell" aria-label={t.heading}>
      <div className="debrief-header">
        <div>
          <span className="step-kicker">{t.kicker}</span>
          <h1 className="screen-title" style={{ marginTop: 4 }}>
            {t.heading}
          </h1>
          <p className="screen-subtitle" style={{ marginBottom: 0 }}>
            {t.subtitle}
          </p>
        </div>

        <div className="vr-lobby-setup-pill">
          <strong>{record.title}</strong>
          <span>
            {homeT.venues[record.venue]} · {homeT.practiceTypes[record.practiceType]}
          </span>
        </div>
      </div>

      {/* Headline Metrics Grid */}
      <div className="debrief-metrics-grid">
        <div className="debrief-metric-card">
          <span className="debrief-metric-label">{t.metricWpm}</span>
          <span className="debrief-metric-value">{record.wpm}</span>
          <span className="debrief-metric-sub">{t.targetWpmNote}</span>
        </div>

        <div className="debrief-metric-card">
          <span className="debrief-metric-label">{t.metricFillers}</span>
          <span className="debrief-metric-value">{record.fillerCount}</span>
          <span className="debrief-metric-sub">
            {topFillers.length > 0
              ? topFillers.map(([w, c]) => `${w} (${c})`).join(' · ')
              : '—'}
          </span>
        </div>

        <div className="debrief-metric-card">
          <span className="debrief-metric-label">{t.metricTopics}</span>
          <span className="debrief-metric-value">
            {record.topicsCovered} / {record.topicsTotal}
          </span>
          <span className="debrief-metric-sub">
            {hudT.gazeZoneLeft} {record.eyeContactZones.left}% · {hudT.gazeZoneCentre}{' '}
            {record.eyeContactZones.centre}% · {hudT.gazeZoneRight} {record.eyeContactZones.right}%
          </span>
        </div>

        <div className="debrief-metric-card">
          <span className="debrief-metric-label">{t.metricTime}</span>
          <span className="debrief-metric-value">
            {formatDuration(record.durationSeconds)}
          </span>
          <span className="debrief-metric-sub">
            / {record.timeLimitMinutes}:00 {homeT.minUnit}
          </span>
        </div>
      </div>

      {/* Goal-First Feedback (prefers real DeepSeek AI goal feedback when available) */}
      {(record.aiFeedback?.goalFeedback.length || record.goals.length > 0) && (
        <div className="debrief-card">
          <h2 className="dash-card-title" style={{ marginBottom: 10 }}>
            {t.goalFeedbackHeading}
          </h2>
          <div className="debrief-goals-list">
            {record.aiFeedback && record.aiFeedback.goalFeedback.length > 0
              ? record.aiFeedback.goalFeedback.slice(0, 3).map((item, idx) => (
                  <div key={`${item.goal}-${idx}`} className="debrief-goal-row">
                    <div>
                      <p className="setting-title">{item.goal}</p>
                      <p className="setting-desc">{item.note}</p>
                    </div>
                    <span
                      className={`debrief-goal-badge ${item.status === 'Strong' ? 'met' : 'focus'}`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))
              : record.goals.slice(0, 3).map((goalId) => {
                  const evalResult = evaluateGoal(goalId, record, language)
                  return (
                    <div key={goalId} className="debrief-goal-row">
                      <div>
                        <p className="setting-title">{evalResult.label}</p>
                        <p className="setting-desc">{evalResult.detail}</p>
                      </div>
                      <span
                        className={`debrief-goal-badge ${evalResult.met ? 'met' : 'focus'}`}
                      >
                        {evalResult.met ? t.goalMetBadge : t.goalFocusBadge}
                      </span>
                    </div>
                  )
                })}
          </div>
        </div>
      )}

      {/* Top Recommendation & 1 Flagged Moment */}
      <div className="debrief-two-col">
        <div className="debrief-card">
          <h2 className="dash-card-title" style={{ marginBottom: 8 }}>
            {t.topTipHeading}
          </h2>
          <p className="debrief-tip-text">{topRecommendation}</p>
        </div>

        <div className="debrief-card">
          <h2 className="dash-card-title" style={{ marginBottom: 8 }}>
            {t.flaggedMomentHeading}
          </h2>
          {primaryFlag ? (
            <div className="debrief-flag-box">
              <div className="debrief-flag-top">
                <span className="wizard-type-pill">
                  {formatDuration(primaryFlag.timestampSeconds)}
                </span>
                <strong>{primaryFlag.label}</strong>
              </div>
              {primaryFlag.aiTip && (
                <p className="setting-desc" style={{ marginTop: 6 }}>
                  {primaryFlag.aiTip}
                </p>
              )}
            </div>
          ) : (
            <p className="setting-desc">{t.noFlaggedMoments}</p>
          )}
        </div>
      </div>

      {/* Quick Debrief Actions */}
      <div className="debrief-actions">
        <button
          id="debrief-try-again-btn"
          type="button"
          className="btn-secondary"
          style={{ width: 'auto' }}
          onClick={onTryAgain}
        >
          {t.tryAgainNow}
        </button>
        <button
          id="debrief-repeat-moment-btn"
          type="button"
          className="btn-secondary"
          style={{ width: 'auto' }}
          onClick={() => onRepeatMoment(primaryFlag?.slideIndex ?? 0)}
        >
          {t.repeatMoment}
        </button>
        <button
          id="debrief-raise-difficulty-btn"
          type="button"
          className="btn-secondary"
          style={{ width: 'auto' }}
          onClick={onRaiseDifficulty}
        >
          {t.raiseDifficulty}
        </button>
        <button
          id="debrief-full-report-btn"
          type="button"
          className="btn-primary"
          style={{ width: 'auto', minWidth: 210 }}
          onClick={() => onOpenFullReport(record)}
        >
          {t.fullReportPhone}
        </button>
      </div>
    </section>
  )
}

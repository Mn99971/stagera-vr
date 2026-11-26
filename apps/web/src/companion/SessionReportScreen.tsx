import { useState } from 'react'
import { translations } from '../lib/i18n'
import { computeSessionSummary, exportSessionReportPdf } from '../lib/reportExport'
import type { AppLanguage, FlaggedMoment, SessionRecord } from '../types/stagera'

interface SessionReportScreenProps {
  record: SessionRecord
  language: AppLanguage
  onOpenTimeline: () => void
  onOpenMomentReplay: (moment: FlaggedMoment) => void
  onOpenCompare: () => void
  onTryAgain: () => void
  onRaiseDifficulty: () => void
}

function formatTime(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds))
  const m = Math.floor(clamped / 60)
  const s = clamped % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function checkParStructure(transcript: string): { p: boolean; a: boolean; r: boolean } {
  const lower = transcript.toLowerCase()
  return {
    p: /\b(problem|challenge|bottleneck|issue|spike|enjeu|problème)\b/i.test(lower),
    a: /\b(i |i've|designed|built|led|redesigned|profiled|j’ai|conçu)\b/i.test(lower),
    r: /\b(result|percent|%|dropped|cut|improved|ms|résultat|réduit)\b/i.test(lower),
  }
}

export function SessionReportScreen({
  record,
  language,
  onOpenTimeline,
  onOpenMomentReplay,
  onOpenCompare,
  onTryAgain,
  onRaiseDifficulty,
}: SessionReportScreenProps) {
  const t = translations[language].step3.report
  const homeT = translations[language].home
  const hudT = translations[language].vr.hud
  const isFr = language === 'fr'

  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfExported, setPdfExported] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  const isInterview =
    record.practiceType === 'interview' ||
    record.venue === 'interview_room' ||
    record.venue === 'panel_room'
  const fillerEntries = Object.entries(record.fillerBreakdown).sort((a, b) => b[1] - a[1])
  const missedTopics = Math.max(0, record.topicsTotal - record.topicsCovered)
  const par = checkParStructure(record.transcript)
  const totalPronouns = Math.max(1, record.iCount + record.weCount)
  const iPct = Math.round((record.iCount / totalPronouns) * 100)
  const summary = computeSessionSummary(record, language)

  const recommendations =
    record.recommendations.length >= 3
      ? record.recommendations
      : [
          ...record.recommendations,
          isFr
            ? 'Gardez un débit régulier entre 130 et 150 mots/min lors des transitions.'
            : 'Keep a steady cadence between 130 and 150 WPM during slide transitions.',
          isFr
            ? 'Balayez les zones Gauche, Centre et Droite pour maintenir le contact visuel.'
            : 'Sweep Left, Centre, and Right audience zones to balance eye contact.',
          isFr
            ? 'Terminez chaque réponse aux questions en moins de 45 secondes avec un exemple chiffré.'
            : 'Wrap up Q&A answers in under 45 seconds with one concrete metric.',
        ].slice(0, 3)

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      await exportSessionReportPdf(record, language)
      setPdfExported(true)
      window.setTimeout(() => setPdfExported(false), 2600)
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="report-shell">
      <div className="report-header">
        <div>
          <span className="step-kicker">{t.kicker}</span>
          <h1 className="screen-title" style={{ marginTop: 4 }}>
            {record.title}
          </h1>
          <div className="setup-row-sub">
            <span>{homeT.practiceTypes[record.practiceType]}</span>
            <span>·</span>
            <span>{homeT.venues[record.venue]}</span>
            <span>·</span>
            <span>
              {new Date(record.createdAt).toLocaleDateString(
                isFr ? 'fr-FR' : 'en-US',
                { month: 'short', day: 'numeric', year: 'numeric' },
              )}
            </span>
            <span className={`attempt-mode-pill ${record.coachedMode ? 'coached' : 'independent'}`}>
              {record.coachedMode ? t.coachedBadge : t.independentBadge}
            </span>
          </div>
        </div>

        <div className="report-export-actions no-print">
          <button
            id="report-export-pdf-btn"
            type="button"
            className="btn-primary"
            style={{ width: 'auto', minWidth: 168 }}
            disabled={exportingPdf}
            onClick={() => void handleExportPdf()}
          >
            {exportingPdf
              ? isFr
                ? 'Génération PDF…'
                : 'Generating PDF…'
              : pdfExported
                ? isFr
                  ? '✓ PDF téléchargé'
                  : '✓ PDF Downloaded'
                : isFr
                  ? 'Télécharger le PDF'
                  : 'Export PDF Report'}
          </button>
          <button
            id="report-print-btn"
            type="button"
            className="btn-secondary"
            style={{ width: 'auto' }}
            onClick={() => window.print()}
          >
            {isFr ? 'Imprimer' : 'Print'}
          </button>
        </div>
      </div>

      {/* Executive Summary & Overall Score */}
      <section className="report-exec-card" aria-label={isFr ? 'Synthèse' : 'Executive Summary'}>
        <div className="report-score-badge">
          <span className="report-score-value">{summary.overallScore}</span>
          <span className="report-score-denom">/ 100</span>
          <span className="report-score-label">{summary.scoreLabel}</span>
        </div>
        <div className="report-exec-body">
          <h2 className="dash-card-title" style={{ marginBottom: 6 }}>
            {isFr ? 'Synthèse de la session' : 'Executive Summary'}
          </h2>
          <p className="report-exec-text">{summary.executiveSummary}</p>
        </div>
      </section>

      {/* Core Delivery Metrics */}
      <div className="debrief-metrics-grid">
        <div className="debrief-metric-card">
          <span className="debrief-metric-label">{homeT.metricWpm}</span>
          <span className="debrief-metric-value">{record.wpm}</span>
          <span className="debrief-metric-sub">{t.wpmTarget}</span>
        </div>

        <div className="debrief-metric-card">
          <span className="debrief-metric-label">{homeT.metricFillers}</span>
          <span className="debrief-metric-value">{record.fillerCount}</span>
          <span className="debrief-metric-sub">{t.fillersByWord}</span>
        </div>

        <div className="debrief-metric-card">
          <span className="debrief-metric-label">{homeT.metricTopics}</span>
          <span className="debrief-metric-value">
            {record.topicsCovered} / {record.topicsTotal}
          </span>
          <span className="debrief-metric-sub">
            {missedTopics > 0
              ? t.missedTopicsNote.replace('{missed}', String(missedTopics))
              : t.allTopicsCovered}
          </span>
        </div>

        <div className="debrief-metric-card">
          <span className="debrief-metric-label">
            {translations[language].vr.debrief.metricTime}
          </span>
          <span className="debrief-metric-value">{formatTime(record.durationSeconds)}</span>
          <span className="debrief-metric-sub">
            / {record.timeLimitMinutes}:00 {homeT.minUnit}
          </span>
        </div>
      </div>

      {/* Strengths & Areas to Improve */}
      <div className="debrief-two-col">
        <section className="dash-card report-strengths-card" style={{ marginBottom: 0 }}>
          <h2 className="dash-card-title" style={{ marginBottom: 10 }}>
            {isFr ? 'Points forts' : 'Key Strengths'}
          </h2>
          <ul className="report-bullet-list">
            {summary.strengths.map((item, idx) => (
              <li key={idx}>
                <span className="report-bullet-icon ok" aria-hidden="true">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="dash-card report-improve-card" style={{ marginBottom: 0 }}>
          <h2 className="dash-card-title" style={{ marginBottom: 10 }}>
            {isFr ? 'Axes d’amélioration' : 'Areas to Improve'}
          </h2>
          <ul className="report-bullet-list">
            {summary.areasToImprove.map((item, idx) => (
              <li key={idx}>
                <span className="report-bullet-icon focus" aria-hidden="true">
                  →
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* S3.1b Goal-First Feedback (prefers real DeepSeek AI goal feedback when present) */}
      {(record.aiFeedback?.goalFeedback.length || record.goals.length > 0 || isInterview) && (
        <section className="dash-card" style={{ marginBottom: 0 }} aria-label={t.goalsHeading}>
          <h2 className="dash-card-title" style={{ marginBottom: 10 }}>
            {t.goalsHeading}
          </h2>

          {record.aiFeedback && record.aiFeedback.goalFeedback.length > 0 ? (
            <div className="debrief-goals-list" style={{ marginBottom: isInterview ? 14 : 0 }}>
              {record.aiFeedback.goalFeedback.map((item, idx) => (
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
              ))}
            </div>
          ) : (
            record.goals.length > 0 && (
              <div className="chip-list" style={{ marginBottom: isInterview ? 14 : 0 }}>
                {record.goals.map((goalId) => {
                  const label =
                    translations[language].wizard.goalsInterviewer.goalOptions.find(
                      (g) => g.id === goalId,
                    )?.label ??
                    translations[language].profile.goalOptions.find((g) => g.id === goalId)?.label ??
                    goalId
                  return (
                    <span key={goalId} className="preview-chip">
                      ✓ {label}
                    </span>
                  )
                })}
              </div>
            )
          )}

          {isInterview && (
            <div className="interview-feedback-grid">
              <div className="interview-feedback-box">
                <span className="debrief-metric-label">{t.ownershipLabel}</span>
                <div className="ownership-counts">
                  <strong>“I”: {record.iCount}</strong>
                  <span>vs</span>
                  <strong>“we”: {record.weCount}</strong>
                </div>
                <div className="ownership-bar" aria-hidden="true">
                  <div className="ownership-bar-i" style={{ width: `${iPct}%` }} />
                </div>
              </div>

              <div className="interview-feedback-box">
                <span className="debrief-metric-label">{t.parCheckLabel}</span>
                <div className="par-pills-row">
                  <span className={`par-pill ${par.p ? 'ok' : ''}`}>
                    {par.p ? '✓' : '○'} {t.parProblem}
                  </span>
                  <span className={`par-pill ${par.a ? 'ok' : ''}`}>
                    {par.a ? '✓' : '○'} {t.parAction}
                  </span>
                  <span className={`par-pill ${par.r ? 'ok' : ''}`}>
                    {par.r ? '✓' : '○'} {t.parResult}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Interview / Q&A Conversation Breakdown */}
      {record.qaTranscript && record.qaTranscript.length > 0 && (
        <section className="dash-card" style={{ marginBottom: 0 }}>
          <h2 className="dash-card-title" style={{ marginBottom: 12 }}>
            {isFr ? 'Déroulé Q&R de l’entretien' : 'Interview Q&A Breakdown'}
          </h2>
          <div className="qa-breakdown-list">
            {record.qaTranscript.map((turn) => (
              <div key={turn.id} className={`qa-turn-row ${turn.role}`}>
                <div className="qa-turn-meta">
                  <span className="qa-turn-speaker">{turn.speakerLabel}</span>
                  <span className="qa-turn-time">{formatTime(turn.timestampSeconds)}</span>
                  {turn.isFollowUp && (
                    <span className="wizard-type-pill">
                      {isFr ? 'Relance' : 'Follow-up'}
                    </span>
                  )}
                </div>
                <p className="qa-turn-text">{turn.text}</p>
                {turn.coachingNote && (
                  <p className="qa-turn-note">
                    {isFr ? 'Conseil : ' : 'Coach note: '}
                    {turn.coachingNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filler Breakdown by Word + Eye-Contact Zone Bar */}
      <div className="debrief-two-col">
        <div className="dash-card" style={{ marginBottom: 0 }}>
          <h2 className="dash-card-title" style={{ marginBottom: 10 }}>
            {t.fillersByWord}
          </h2>
          {fillerEntries.length === 0 ? (
            <p className="setting-desc">{t.noFillersDetected}</p>
          ) : (
            <div className="filler-chips-wrap">
              {fillerEntries.map(([word, count]) => (
                <span key={word} className="filler-word-pill">
                  <span>“{word}”</span>
                  <strong>{count}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="dash-card" style={{ marginBottom: 0 }}>
          <h2 className="dash-card-title" style={{ marginBottom: 10 }}>
            {t.eyeContactTitle}
          </h2>
          <div
            className="gaze-zone-bar"
            role="img"
            aria-label={`Left ${record.eyeContactZones.left}%, Centre ${record.eyeContactZones.centre}%, Right ${record.eyeContactZones.right}%`}
          >
            <div
              className="gaze-seg left"
              style={{ width: `${Math.max(8, record.eyeContactZones.left)}%` }}
            >
              {record.eyeContactZones.left}%
            </div>
            <div
              className="gaze-seg centre"
              style={{ width: `${Math.max(8, record.eyeContactZones.centre)}%` }}
            >
              {record.eyeContactZones.centre}%
            </div>
            <div
              className="gaze-seg right"
              style={{ width: `${Math.max(8, record.eyeContactZones.right)}%` }}
            >
              {record.eyeContactZones.right}%
            </div>
          </div>
          <div className="gaze-legend">
            <span>
              {hudT.gazeZoneLeft}: {record.eyeContactZones.left}%
            </span>
            <span>
              {hudT.gazeZoneCentre}: {record.eyeContactZones.centre}%
            </span>
            <span>
              {hudT.gazeZoneRight}: {record.eyeContactZones.right}%
            </span>
          </div>
        </div>
      </div>

      {/* >=3 Actionable Recommendations linked to Flagged Moments */}
      <div className="dash-card" style={{ marginBottom: 0 }}>
        <h2 className="dash-card-title" style={{ marginBottom: 12 }}>
          {t.recommendationsTitle}
        </h2>
        <ol className="recommendations-list">
          {recommendations.map((rec, idx) => {
            const linkedMoment = record.flaggedMoments[idx] ?? record.flaggedMoments[0] ?? null
            return (
              <li key={idx} className="recommendation-row">
                <div className="recommendation-content">
                  <span className="topic-index-badge">{idx + 1}</span>
                  <p className="recommendation-text">{rec}</p>
                </div>
                {linkedMoment && (
                  <button
                    type="button"
                    className="link-btn no-print"
                    style={{ alignSelf: 'flex-start', marginLeft: 34, fontSize: 12.5 }}
                    onClick={() => onOpenMomentReplay(linkedMoment)}
                  >
                    {t.viewLinkedMoment} ({formatTime(linkedMoment.timestampSeconds)})
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {/* Readable Transcript Preview */}
      {record.transcript && record.transcript.trim().length > 0 && (
        <section className="dash-card" style={{ marginBottom: 0 }}>
          <div className="dash-card-header" style={{ marginBottom: transcriptOpen ? 10 : 0 }}>
            <h2 className="dash-card-title">
              {isFr ? 'Transcription' : 'Session Transcript'}
            </h2>
            <button
              type="button"
              className="btn-small-ghost no-print"
              onClick={() => setTranscriptOpen((prev) => !prev)}
            >
              {transcriptOpen
                ? isFr
                  ? 'Masquer'
                  : 'Hide'
                : isFr
                  ? 'Afficher la transcription'
                  : 'Show Transcript'}
            </button>
          </div>
          {transcriptOpen && <p className="report-transcript-body">{record.transcript}</p>}
        </section>
      )}

      {/* Primary Report Actions */}
      <div className="report-action-bar no-print">
        <button
          id="report-flagged-moments-btn"
          type="button"
          className="btn-secondary"
          style={{ width: 'auto' }}
          onClick={onOpenTimeline}
        >
          {t.seeFlaggedMoments} ({record.flaggedMoments.length})
        </button>
        <button
          id="report-compare-btn"
          type="button"
          className="btn-secondary"
          style={{ width: 'auto' }}
          onClick={onOpenCompare}
        >
          {t.compareAttempts}
        </button>
        <button
          id="report-raise-difficulty-btn"
          type="button"
          className="btn-secondary"
          style={{ width: 'auto' }}
          onClick={onRaiseDifficulty}
        >
          {t.raiseDifficulty}
        </button>
        <button
          id="report-try-again-btn"
          type="button"
          className="btn-primary"
          style={{ width: 'auto', minWidth: 160 }}
          onClick={onTryAgain}
        >
          {t.tryAgainNow}
        </button>
      </div>
    </div>
  )
}

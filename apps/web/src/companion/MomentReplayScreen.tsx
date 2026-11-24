import { useEffect, useState } from 'react'
import { FILLER_WORDS } from '../ai/speechAnalyzer'
import { translations } from '../lib/i18n'
import type { AppLanguage, FlaggedMoment, SessionRecord } from '../types/stagera'

interface MomentReplayScreenProps {
  record: SessionRecord
  moment: FlaggedMoment
  language: AppLanguage
  onBack: () => void
  onRepeatInVR: (record: SessionRecord, moment: FlaggedMoment) => void
}

type ReplayPov = 'audience' | 'presenter' | 'phone_2d'

const CLIP_DURATION_SEC = 20

function formatTs(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60)
  const s = Math.max(0, seconds) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function renderHighlightedTranscript(text: string) {
  const pattern = new RegExp(
    `\\b(${FILLER_WORDS.map((w) => w.replace(/\s+/g, '\\s+')).join('|')})\\b`,
    'gi',
  )
  const parts = text.split(pattern)
  return parts.map((part, idx) => {
    const isFiller = FILLER_WORDS.some((w) => w.toLowerCase() === part.toLowerCase())
    if (isFiller) {
      return (
        <mark key={idx} className="transcript-filler-mark">
          {part}
        </mark>
      )
    }
    return <span key={idx}>{part}</span>
  })
}

export function MomentReplayScreen({
  record,
  moment,
  language,
  onBack,
  onRepeatInVR,
}: MomentReplayScreenProps) {
  const step3T = translations[language].step3
  const t = step3T.replay
  const timelineT = step3T.timeline

  const [pov, setPov] = useState<ReplayPov>('audience')
  const [playing, setPlaying] = useState(false)
  const [clipPos, setClipPos] = useState(0)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setClipPos((prev) => {
        if (prev >= CLIP_DURATION_SEC) {
          setPlaying(false)
          return CLIP_DURATION_SEC
        }
        return prev + 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [playing])

  const snippet = moment.transcriptExcerpt || record.transcript || moment.label
  const isQuestion = moment.momentType === 'question'

  return (
    <div className="report-shell">
      <div>
        <button id="replay-back-btn" type="button" className="back-btn" onClick={onBack}>
          <span aria-hidden="true">←</span>
          <span>{step3T.backToReport}</span>
        </button>
        <span className="step-kicker" style={{ display: 'block', marginTop: 8 }}>
          {t.kicker}
        </span>
        <h1 className="screen-title" style={{ marginTop: 4 }}>
          {moment.label}
        </h1>
        <div className="setup-row-sub">
          <span className="wizard-type-pill">{formatTs(moment.timestampSeconds)}</span>
          <span className={`moment-type-badge ${moment.momentType}`}>
            {timelineT.types[moment.momentType]}
          </span>
          <span>· {record.wpm} WPM</span>
        </div>
      </div>

      {/* Point-of-view selector */}
      <div className="dash-card" style={{ marginBottom: 0 }}>
        <p className="section-label">{t.povLabel}</p>
        <div className="pov-tabs" role="tablist" aria-label={t.povLabel}>
          {(
            [
              { id: 'audience', label: t.povAudience },
              { id: 'presenter', label: t.povPresenter },
              { id: 'phone_2d', label: t.povPhone2d },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              id={`replay-pov-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={pov === tab.id}
              className={`segmented-tab ${pov === tab.id ? 'active' : ''}`}
              onClick={() => setPov(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Visual POV Stage Preview */}
        <div className={`replay-stage-preview pov-${pov}`}>
          <div className="replay-stage-badge">
            {pov === 'audience'
              ? t.povAudience
              : pov === 'presenter'
                ? t.povPresenter
                : t.povPhone2d}
          </div>
          <p className="replay-stage-desc">
            {pov === 'audience'
              ? t.povAudienceDesc
              : pov === 'presenter'
                ? t.povPresenterDesc
                : t.povPhone2dDesc}
          </p>
          <div className="replay-waveform" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => {
              const active = i / 24 <= clipPos / CLIP_DURATION_SEC
              const height = 14 + ((i * 19) % 28)
              return (
                <span
                  key={i}
                  className={`replay-wave-bar ${active ? 'active' : ''}`}
                  style={{ height }}
                />
              )
            })}
          </div>
        </div>

        {/* Playback Scrubber */}
        <div className="replay-scrubber-row">
          <button
            id="replay-play-btn"
            type="button"
            className="btn-small"
            onClick={() => {
              if (clipPos >= CLIP_DURATION_SEC) setClipPos(0)
              setPlaying((prev) => !prev)
            }}
          >
            {playing ? `⏸ ${t.pauseBtn}` : `▶ ${t.playBtn}`}
          </button>
          <input
            id="replay-scrubber"
            type="range"
            min={0}
            max={CLIP_DURATION_SEC}
            value={clipPos}
            aria-label="Replay scrubber"
            onChange={(e) => setClipPos(Number(e.target.value))}
          />
          <span className="replay-clock">
            {formatTs(moment.timestampSeconds + clipPos)} /{' '}
            {formatTs(moment.timestampSeconds + CLIP_DURATION_SEC)}
          </span>
        </div>
      </div>

      {/* Highlighted Transcript + AI Tip */}
      <div className="debrief-two-col">
        <div className="dash-card" style={{ marginBottom: 0 }}>
          <h2 className="dash-card-title" style={{ marginBottom: 8 }}>
            {t.transcriptHeading}
          </h2>
          <p className="replay-transcript-box">{renderHighlightedTranscript(snippet)}</p>
        </div>

        <div className="dash-card" style={{ marginBottom: 0 }}>
          <h2 className="dash-card-title" style={{ marginBottom: 8 }}>
            {t.aiTipHeading}
          </h2>
          <p className="debrief-tip-text">
            {moment.aiTip ||
              (language === 'fr'
                ? 'Ralentissez légèrement et marquez une pause avant votre point clé.'
                : 'Slow down slightly and pause for one beat before your key takeaway.')}
          </p>
        </div>
      </div>

      <div className="report-action-bar">
        <button
          id="replay-repeat-vr-btn"
          type="button"
          className="btn-primary"
          style={{ width: 'auto', minWidth: 230 }}
          onClick={() => onRepeatInVR(record, moment)}
        >
          {isQuestion ? t.retryQuestionBtn : t.repeatInVrBtn}
        </button>
      </div>
    </div>
  )
}

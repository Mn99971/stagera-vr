import { useState } from 'react'
import { translations } from '../lib/i18n'
import type { AppLanguage } from '../types/stagera'

interface PauseMenuProps {
  language: AppLanguage
  coachedMode: boolean
  currentTopicTitle: string
  panelVisible: boolean
  hintUsed: boolean
  onResume: () => void
  onRestartCurrentSlide: () => void
  onRestartBeginning: () => void
  onTogglePanel: () => void
  onUseHint: () => void
  onEndSession: () => void
}

export function PauseMenu({
  language,
  coachedMode,
  currentTopicTitle,
  panelVisible,
  hintUsed,
  onResume,
  onRestartCurrentSlide,
  onRestartBeginning,
  onTogglePanel,
  onUseHint,
  onEndSession,
}: PauseMenuProps) {
  const t = translations[language].vr.pause
  const [showHintCard, setShowHintCard] = useState(false)

  const handleRequestHint = () => {
    setShowHintCard(true)
    if (!hintUsed) {
      onUseHint()
    }
  }

  return (
    <div className="vr-pause-backdrop" role="dialog" aria-modal="true" aria-labelledby="vr-pause-heading">
      <div className="vr-pause-card">
        <h2 id="vr-pause-heading" className="vr-pause-title">
          {t.heading}
        </h2>
        <p className="vr-pause-subtitle">{t.subtitle}</p>

        <div className="vr-pause-actions">
          <button
            id="pause-resume-btn"
            type="button"
            className="btn-primary"
            onClick={onResume}
          >
            {t.resume}
          </button>

          {coachedMode && (
            <button
              id="pause-give-hint-btn"
              type="button"
              className="btn-hint"
              onClick={handleRequestHint}
            >
              💡 {t.giveHintBtn}
            </button>
          )}

          {coachedMode && showHintCard && (
            <div id="pause-par-hint-card" className="vr-par-hint-card" role="region" aria-label={t.hintTitle}>
              <div className="vr-par-hint-header">
                <strong>{t.hintTitle}</strong>
                <span className="tag-coached">{t.hintTrackedNote}</span>
              </div>
              <dl className="vr-par-list">
                <div>
                  <dt>{t.parProblemLabel}</dt>
                  <dd>{t.parProblemTip.replace('{topic}', currentTopicTitle)}</dd>
                </div>
                <div>
                  <dt>{t.parActionLabel}</dt>
                  <dd>{t.parActionTip}</dd>
                </div>
                <div>
                  <dt>{t.parResultLabel}</dt>
                  <dd>{t.parResultTip}</dd>
                </div>
              </dl>
            </div>
          )}

          <button
            id="pause-restart-current-btn"
            type="button"
            className="btn-secondary"
            onClick={onRestartCurrentSlide}
          >
            {t.restartCurrent}
          </button>

          <button
            id="pause-restart-beginning-btn"
            type="button"
            className="btn-secondary"
            onClick={onRestartBeginning}
          >
            {t.restartBeginning}
          </button>

          <button
            id="pause-toggle-panel-btn"
            type="button"
            className="btn-secondary"
            onClick={onTogglePanel}
          >
            {panelVisible ? t.hidePanel : t.showPanel}
          </button>

          <button
            id="pause-end-session-btn"
            type="button"
            className="btn-danger-outline"
            onClick={onEndSession}
          >
            {t.endSession}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { translations } from '../lib/i18n'
import { claimPairingCode } from '../lib/pairing'
import { loadSavedSetups } from '../lib/savedSetups'
import type { AppLanguage, SessionSetup } from '../types/stagera'

interface VRPreFlightProps {
  language: AppLanguage
  userId?: string
  captionsEnabled: boolean
  onToggleCaptions: () => void
  onStartSession: (setup: SessionSetup) => void
}

export function VRPreFlight({
  language,
  userId = 'demo-headset',
  captionsEnabled,
  onToggleCaptions,
  onStartSession,
}: VRPreFlightProps) {
  const t = translations[language].preflight
  const homeT = translations[language].home
  const vaT = translations[language].wizard.venueAudience

  const [codeInput, setCodeInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [pairError, setPairError] = useState<string | null>(null)
  const [pairedFromPhone, setPairedFromPhone] = useState(false)
  const [savedSetups, setSavedSetups] = useState<SessionSetup[]>([])
  const [selectedSetup, setSelectedSetup] = useState<SessionSetup | null>(null)

  useEffect(() => {
    let active = true
    void loadSavedSetups(userId).then((loaded) => {
      if (!active) return
      setSavedSetups(loaded)
      setSelectedSetup((prev) => prev ?? loaded[0] ?? null)
    })
    return () => {
      active = false
    }
  }, [userId])

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault()
    setPairError(null)
    setPairedFromPhone(false)
    setConnecting(true)
    try {
      const result = await claimPairingCode(codeInput)
      if (result.ok) {
        setSelectedSetup(result.setup)
        setPairedFromPhone(true)
        setCodeInput('')
      } else if (result.reason === 'invalid') {
        setPairError(t.errInvalidCode)
      } else if (result.reason === 'expired') {
        setPairError(t.errExpiredCode)
      } else {
        setPairError(t.errNotFoundCode)
      }
    } finally {
      setConnecting(false)
    }
  }

  return (
    <section className="preflight-shell" aria-label={t.heading}>
      <div className="preflight-header">
        <span className="step-kicker">{t.kicker}</span>
        <h1 className="screen-title" style={{ marginTop: 4 }}>
          {t.heading}
        </h1>
        <p className="screen-subtitle" style={{ marginBottom: 0 }}>
          {t.subtitle}
        </p>
      </div>

      <div className="preflight-grid">
        {/* Left column: 4-digit phone pairing + Saved Setups list (FR-09, FR-31) */}
        <div className="preflight-col">
          <div className="preflight-card">
            <h2 className="dash-card-title" style={{ marginBottom: 4 }}>
              {t.pairCardTitle}
            </h2>
            <p className="setting-desc" style={{ marginBottom: 14 }}>
              {t.pairCardDesc}
            </p>

            <form className="preflight-pair-form" onSubmit={handleConnect}>
              <label htmlFor="preflight-code-input" className="sr-only">
                {t.codeInputLabel}
              </label>
              <input
                id="preflight-code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                className="text-input preflight-code-input"
                value={codeInput}
                placeholder={t.codeInputPlaceholder}
                onChange={(e) => {
                  setPairError(null)
                  setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                }}
              />
              <button
                id="preflight-connect-btn"
                type="submit"
                className="btn-primary"
                style={{ width: 'auto', minWidth: 120 }}
                disabled={connecting || codeInput.length !== 4}
              >
                {connecting ? t.connectingBtn : t.connectBtn}
              </button>
            </form>

            {pairError && (
              <div className="error-alert" role="alert" style={{ marginTop: 10 }}>
                {pairError}
              </div>
            )}

            {pairedFromPhone && (
              <div className="preflight-success-banner" role="status">
                {t.pairedBanner}
              </div>
            )}
          </div>

          <div className="preflight-card">
            <h2 className="dash-card-title" style={{ marginBottom: 4 }}>
              {t.savedCardTitle}
            </h2>
            <p className="setting-desc" style={{ marginBottom: 12 }}>
              {t.savedCardDesc}
            </p>

            {savedSetups.length === 0 ? (
              <p className="setting-desc">{t.noSavedSetups}</p>
            ) : (
              <div className="preflight-setup-list" role="radiogroup" aria-label={t.savedCardTitle}>
                {savedSetups.map((setup) => {
                  const isSelected =
                    selectedSetup?.id === setup.id && selectedSetup?.title === setup.title
                  return (
                    <button
                      key={setup.id ?? setup.title}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`preflight-setup-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedSetup(setup)
                        setPairedFromPhone(false)
                      }}
                    >
                      <span className="preflight-setup-title">{setup.title}</span>
                      <span className="setup-row-sub">
                        <span>{homeT.venues[setup.venue]}</span>
                        <span>·</span>
                        <span>
                          {setup.timeLimitMinutes} {homeT.minUnit}
                        </span>
                        {setup.coachedMode && (
                          <span className="tag-coached">{homeT.coachedTag}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Selected Setup Preview + Captions Toggle + Start Session */}
        <div className="preflight-col">
          <div className="preflight-card preflight-preview-card">
            <p className="section-label" style={{ marginBottom: 10 }}>
              {t.selectedSetupHeading}
            </p>

            {selectedSetup ? (
              <>
                <h2 className="preflight-selected-title">{selectedSetup.title}</h2>
                <div className="setup-row-sub" style={{ marginBottom: 16 }}>
                  <span>{homeT.practiceTypes[selectedSetup.practiceType]}</span>
                  {selectedSetup.coachedMode && (
                    <span className="tag-coached">{homeT.coachedTag}</span>
                  )}
                </div>

                <dl className="preflight-meta-grid">
                  <div className="preflight-meta-item">
                    <dt>{t.labelVenue}</dt>
                    <dd>{homeT.venues[selectedSetup.venue]}</dd>
                  </div>
                  <div className="preflight-meta-item">
                    <dt>{t.labelBehaviour}</dt>
                    <dd>{vaT.behaviours[selectedSetup.audienceBehaviour].label}</dd>
                  </div>
                  <div className="preflight-meta-item">
                    <dt>{t.labelInterruptions}</dt>
                    <dd>
                      {vaT.interruptions[selectedSetup.interruptionLevel].label} (
                      {vaT.interruptions[selectedSetup.interruptionLevel].rate})
                    </dd>
                  </div>
                  <div className="preflight-meta-item">
                    <dt>{t.labelTimeLimit}</dt>
                    <dd>
                      {selectedSetup.timeLimitMinutes} {homeT.minUnit}
                    </dd>
                  </div>
                  <div className="preflight-meta-item">
                    <dt>{t.labelTopics}</dt>
                    <dd>{selectedSetup.topics.length}</dd>
                  </div>
                </dl>

                <div className="setting-row" style={{ marginTop: 12, borderTop: '1px solid var(--border-default)' }}>
                  <div>
                    <p className="setting-title">{t.captionsTitle}</p>
                    <p className="setting-desc">{t.captionsDesc}</p>
                  </div>
                  <button
                    id="preflight-toggle-captions"
                    type="button"
                    role="switch"
                    aria-checked={captionsEnabled}
                    aria-label={t.captionsTitle}
                    className={`toggle-switch ${captionsEnabled ? 'on' : ''}`}
                    onClick={onToggleCaptions}
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>

                <button
                  id="preflight-start-session-btn"
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: 18 }}
                  onClick={() => onStartSession(selectedSetup)}
                >
                  {t.startSessionCta}
                </button>
              </>
            ) : (
              <p className="setting-desc">{t.noSavedSetups}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

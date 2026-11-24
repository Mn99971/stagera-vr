import { useCallback, useEffect, useState } from 'react'
import { translations } from '../lib/i18n'
import {
  createPairingSession,
  subscribeHostPairing,
  type PairingSessionRecord,
} from '../lib/pairing'
import type { AppLanguage, SessionSetup } from '../types/stagera'
import { LanguageToggle } from './LanguageToggle'

interface ConnectHeadsetScreenProps {
  language: AppLanguage
  userId: string
  setup: SessionSetup
  onLanguageChange: (lang: AppLanguage) => void
  onBack: () => void
  onLaunchLocalVR: (setup: SessionSetup) => void
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function ConnectHeadsetScreen({
  language,
  userId,
  setup,
  onLanguageChange,
  onBack,
  onLaunchLocalVR,
}: ConnectHeadsetScreenProps) {
  const t = translations[language].pairing
  const homeT = translations[language].home

  const [record, setRecord] = useState<PairingSessionRecord | null>(null)
  const [remainingMs, setRemainingMs] = useState(5 * 60 * 1000)
  const [status, setStatus] = useState<'waiting' | 'connected' | 'expired'>('waiting')

  const startNewCode = useCallback(async () => {
    setStatus('waiting')
    const created = await createPairingSession(userId, setup)
    setRecord(created)
    setRemainingMs(Math.max(0, created.expiresAt - Date.now()))
  }, [setup, userId])

  useEffect(() => {
    void startNewCode()
  }, [startNewCode])

  useEffect(() => {
    if (!record) return
    const unsubscribe = subscribeHostPairing(record.code, setup, () => {
      setStatus('connected')
    })
    return unsubscribe
  }, [record, setup])

  useEffect(() => {
    if (!record || status === 'connected') return
    const interval = window.setInterval(() => {
      const left = record.expiresAt - Date.now()
      if (left <= 0) {
        setRemainingMs(0)
        setStatus('expired')
        window.clearInterval(interval)
      } else {
        setRemainingMs(left)
      }
    }, 1000)
    return () => window.clearInterval(interval)
  }, [record, status])

  const digits = (record?.code ?? '----').split('')

  return (
    <section className="companion-screen" aria-label={t.heading}>
      <div className="screen-header">
        <button id="pairing-back-btn" type="button" className="back-btn" onClick={onBack}>
          <span aria-hidden="true">←</span>
          <span>{t.back}</span>
        </button>
        <LanguageToggle language={language} onChange={onLanguageChange} idPrefix="pairing-lang" />
      </div>

      <span className="step-kicker">{t.kicker}</span>
      <h1 className="screen-title" style={{ marginTop: 4 }}>
        {t.heading}
      </h1>
      <p className="screen-subtitle">{t.subtitle}</p>

      <div className="dash-card" style={{ marginBottom: 14 }}>
        <p className="setup-row-title" style={{ whiteSpace: 'normal' }}>
          {setup.title}
        </p>
        <div className="setup-row-sub">
          <span>{homeT.practiceTypes[setup.practiceType]}</span>
          <span>·</span>
          <span>{homeT.venues[setup.venue]}</span>
          <span>·</span>
          <span>
            {setup.timeLimitMinutes} {homeT.minUnit}
          </span>
          {setup.coachedMode && <span className="tag-coached">{homeT.coachedTag}</span>}
        </div>
      </div>

      <div className="pairing-code-card" aria-live="polite">
        <span className="pairing-code-label">{t.codeLabel}</span>
        <div className="pairing-digits" aria-label={record?.code ?? ''}>
          {digits.map((digit, idx) => (
            <span
              key={idx}
              className={`pairing-digit ${status === 'expired' ? 'expired' : ''}`}
            >
              {digit}
            </span>
          ))}
        </div>

        <div className="pairing-timer-row">
          {status === 'expired' ? (
            <span className="pairing-expiry-text expired">{t.codeExpired}</span>
          ) : (
            <span className="pairing-expiry-text">
              {t.expiresIn.replace('{time}', formatCountdown(remainingMs))}
            </span>
          )}
        </div>

        <div
          id="pairing-status-pill"
          className={`pairing-status-pill ${status}`}
          role="status"
        >
          <span className={`pairing-status-dot ${status}`} aria-hidden="true" />
          <span>
            {status === 'connected'
              ? t.statusConnected
              : status === 'expired'
                ? t.statusExpired
                : t.statusWaiting}
          </span>
        </div>

        {status === 'expired' && (
          <button
            id="pairing-regenerate-btn"
            type="button"
            className="btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => void startNewCode()}
          >
            {t.generateNewCode}
          </button>
        )}
      </div>

      <div className="dash-card" style={{ marginBottom: 0 }}>
        <h2 className="dash-card-title" style={{ marginBottom: 10 }}>
          {t.checklistTitle}
        </h2>
        <ul className="pairing-checklist">
          <li>
            <span className="checklist-check" aria-hidden="true">
              ✓
            </span>
            <span>{t.checklistSpace}</span>
          </li>
          <li>
            <span className="checklist-check" aria-hidden="true">
              ✓
            </span>
            <span>{t.checklistMic}</span>
          </li>
          <li>
            <span className="checklist-check" aria-hidden="true">
              ✓
            </span>
            <span>{t.checklistStand}</span>
          </li>
        </ul>
      </div>

      <div className="wizard-footer-actions">
        <button
          id="pairing-launch-local-btn"
          type="button"
          className="btn-primary"
          onClick={() => onLaunchLocalVR(setup)}
        >
          {t.launchLocalCta}
        </button>
        <button
          id="pairing-home-btn"
          type="button"
          className="btn-secondary"
          onClick={onBack}
        >
          {t.backToHome}
        </button>
      </div>
    </section>
  )
}

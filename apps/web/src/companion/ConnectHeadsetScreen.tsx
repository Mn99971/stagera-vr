import { useEffect, useRef, useState, type FormEvent } from 'react'
import { translations } from '../lib/i18n'
import {
  connectAndSendToHeadset,
  isSupabaseRealtimeConfigured,
  type PhonePairingPhase,
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

export function ConnectHeadsetScreen({
  language,
  setup,
  onLanguageChange,
  onBack,
  onLaunchLocalVR,
}: ConnectHeadsetScreenProps) {
  const t = translations[language].pairing
  const homeT = translations[language].home

  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<PhonePairingPhase>('idle')
  const [statusMessage, setStatusMessage] = useState<string>(
    isSupabaseRealtimeConfigured()
      ? 'Enter the 4-digit code shown in your Quest VR lobby.'
      : 'Warning: Supabase Realtime env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) are missing.',
  )

  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  const sanitizeCode = (raw: string) => raw.replace(/\D/g, '').slice(0, 4)

  const handleCodeChange = (raw: string) => {
    const cleaned = sanitizeCode(raw)
    setCode(cleaned)
    if (phase === 'error' || phase === 'connected') {
      setPhase('idle')
      setStatusMessage('Enter the 4-digit code shown in your Quest VR lobby.')
    }
  }

  const handleConnectSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (code.length !== 4) return

    cleanupRef.current?.()
    cleanupRef.current = connectAndSendToHeadset(code, setup, (update) => {
      setPhase(update.phase)
      setStatusMessage(update.message)
    })
  }

  const isBusy = phase === 'connecting' || phase === 'waiting_headset'
  const supabaseReady = isSupabaseRealtimeConfigured()

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
      <p className="screen-subtitle">
        Open Stagera VR on Meta Quest to view your 4-digit lobby code, then enter it below to
        launch this session directly in the headset.
      </p>

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

      <form className="pairing-code-card" onSubmit={handleConnectSubmit} noValidate>
        <label htmlFor="phone-pairing-code-input" className="pairing-code-label">
          Enter 4-Digit Headset Code
        </label>

        {/* Single rock-solid numeric input compatible with Chrome, Samsung Internet & Firefox Android */}
        <input
          id="phone-pairing-code-input"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="one-time-code"
          placeholder="0000"
          value={code}
          disabled={isBusy}
          onChange={(e) => handleCodeChange(e.target.value)}
          onInput={(e) => handleCodeChange((e.target as HTMLInputElement).value)}
          style={{
            width: '100%',
            maxWidth: 260,
            margin: '12px auto 14px',
            display: 'block',
            textAlign: 'center',
            fontSize: 38,
            fontWeight: 800,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            letterSpacing: '0.45em',
            padding: '14px 12px 14px 26px',
            borderRadius: 14,
            border:
              phase === 'error'
                ? '2px solid #dc2626'
                : phase === 'connected'
                  ? '2px solid #059669'
                  : '2px solid var(--border-strong)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          }}
        />

        <button
          id="pairing-send-headset-btn"
          type="submit"
          className="btn-primary"
          disabled={code.length !== 4 || isBusy}
          style={{ maxWidth: 320, margin: '0 auto' }}
        >
          {phase === 'connecting'
            ? 'Connecting to Supabase...'
            : phase === 'waiting_headset'
              ? 'Waiting for headset...'
              : phase === 'connected'
                ? '✓ Sent — Send Again'
                : 'Connect & Send to Headset'}
        </button>

        {/* Clear live status text directly under input */}
        <div
          id="pairing-status-pill"
          role="status"
          aria-live="polite"
          style={{
            marginTop: 14,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 600,
            background:
              phase === 'connected'
                ? '#dcfce7'
                : phase === 'error' || !supabaseReady
                  ? '#fee2e2'
                  : 'var(--bg-subtle)',
            color:
              phase === 'connected'
                ? '#166534'
                : phase === 'error' || !supabaseReady
                  ? '#991b1b'
                  : 'var(--text-secondary)',
          }}
        >
          {statusMessage}
        </div>
      </form>

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
          className="btn-secondary"
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

import { useState, type FormEvent } from 'react'
import type { ActivePhoneLinkView } from '../App'
import { translations } from '../lib/i18n'
import { isSupabaseRealtimeConfigured, type PhonePairingPhase } from '../lib/pairing'
import type { AppLanguage, SessionSetup } from '../types/stagera'
import { LanguageToggle } from './LanguageToggle'

interface ConnectHeadsetScreenProps {
  language: AppLanguage
  userId: string
  setup: SessionSetup
  phoneLinkState: ActivePhoneLinkView | null
  onConnectHeadset: (code: string, setup: SessionSetup) => void
  onResyncHeadset: () => void
  onDisconnectHeadset: () => void
  onLanguageChange: (lang: AppLanguage) => void
  onBack: () => void
  onLaunchLocalVR: (setup: SessionSetup) => void
}

export function ConnectHeadsetScreen({
  language,
  setup,
  phoneLinkState,
  onConnectHeadset,
  onResyncHeadset,
  onDisconnectHeadset,
  onLanguageChange,
  onBack,
  onLaunchLocalVR,
}: ConnectHeadsetScreenProps) {
  const t = translations[language].pairing
  const homeT = translations[language].home
  const isFr = language === 'fr'

  const [code, setCode] = useState(() => phoneLinkState?.code ?? '')
  const phase: PhonePairingPhase = phoneLinkState?.phase ?? 'idle'
  const statusMessage =
    phoneLinkState?.message ??
    (isSupabaseRealtimeConfigured()
      ? isFr
        ? 'Entrez le code à 4 chiffres affiché dans votre casque Quest VR.'
        : 'Enter the 4-digit code shown in your Quest VR lobby.'
      : isFr
        ? 'Mode local actif (BroadcastChannel). Configurez Supabase pour le jumelage multi-appareils.'
        : 'Local simulator pairing active (BroadcastChannel). Configure Supabase env vars for cross-device Quest pairing.')

  const sanitizeCode = (raw: string) => raw.replace(/\D/g, '').slice(0, 4)

  const handleCodeChange = (raw: string) => {
    const cleaned = sanitizeCode(raw)
    setCode(cleaned)
  }

  const handleConnectSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (code.length !== 4) return
    onConnectHeadset(code, setup)
  }

  const isBusy = phase === 'connecting' || phase === 'waiting_headset'
  const isLinked =
    phase === 'connected' ||
    phase === 'in_session' ||
    phase === 'generating_report' ||
    phase === 'report_ready'

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
        {isFr
          ? 'Ouvrez Stagera VR sur Meta Quest pour voir votre code à 4 chiffres. Le lien reste actif pendant toute la session afin que votre rapport s’ouvre automatiquement sur ce téléphone.'
          : 'Open Stagera VR on Meta Quest to view your 4-digit lobby code. This link stays active throughout your VR session so your full report automatically opens here when you finish.'}
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
          {setup.interviewContext?.cvFileName && (
            <span className="tag-coached">CV: {setup.interviewContext.cvFileName}</span>
          )}
        </div>
      </div>

      <form className="pairing-code-card" onSubmit={handleConnectSubmit} noValidate>
        <label htmlFor="phone-pairing-code-input" className="pairing-code-label">
          {isFr ? 'Code casque à 4 chiffres' : 'Enter 4-Digit Headset Code'}
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
                : isLinked
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
            ? isFr
              ? 'Connexion…'
              : 'Connecting…'
            : phase === 'waiting_headset'
              ? isFr
                ? 'En attente du casque…'
                : 'Waiting for headset…'
              : isLinked
                ? isFr
                  ? '✓ Lié — Renvoyer la configuration'
                  : '✓ Linked — Send Setup Again'
                : isFr
                  ? 'Connecter et lancer dans le casque'
                  : 'Connect & Launch in Headset'}
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
            background: isLinked
              ? '#dcfce7'
              : phase === 'error'
                ? '#fee2e2'
                : 'var(--bg-subtle)',
            color: isLinked
              ? '#166534'
              : phase === 'error'
                ? '#991b1b'
                : 'var(--text-secondary)',
          }}
        >
          {statusMessage}
        </div>

        {isLinked && (
          <div className="pairing-live-footer">
            <p className="setting-desc" style={{ margin: '10px 0 8px' }}>
              {isFr
                ? 'Gardez cet onglet ouvert ou revenez-y plus tard : lorsque vous appuyez sur « Voir le rapport sur le téléphone » en VR, le rapport complet s’ouvrira ici automatiquement.'
                : 'Keep this tab open or return anytime — when you tap "View full report (on phone)" inside VR, the full report will open here automatically.'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-small-ghost"
                onClick={onResyncHeadset}
              >
                {isFr ? '↻ Vérifier le rapport' : '↻ Check for Report'}
              </button>
              <button
                type="button"
                className="btn-small-ghost"
                onClick={onDisconnectHeadset}
              >
                {isFr ? 'Déconnecter' : 'Disconnect'}
              </button>
            </div>
          </div>
        )}
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

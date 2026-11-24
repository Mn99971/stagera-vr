import { useEffect, useRef, useState } from 'react'
import { translations } from '../lib/i18n'
import type { AppLanguage, SessionSetup } from '../types/stagera'

interface VRLobbyCheckProps {
  setup: SessionSetup
  language: AppLanguage
  onEnterSession: () => void
  onBackToSetups?: () => void
}

type MicStatus = 'idle' | 'active' | 'denied'

export function VRLobbyCheck({
  setup,
  language,
  onEnterSession,
  onBackToSetups,
}: VRLobbyCheckProps) {
  const t = translations[language].vr.lobby
  const homeT = translations[language].home

  const [micStatus, setMicStatus] = useState<MicStatus>('idle')
  const [micLevel, setMicLevel] = useState(0)
  const [gazeCalibrated, setGazeCalibrated] = useState({
    left: false,
    centre: false,
    right: false,
  })
  const [sampleSlide, setSampleSlide] = useState(1)
  const [triggerTested, setTriggerTested] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)

  const stopMic = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close()
      audioCtxRef.current = null
    }
  }

  useEffect(() => {
    return () => stopMic()
  }, [])

  // Keyboard arrow test for slide trigger in lobby
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setSampleSlide((prev) => Math.min(3, prev + 1))
        setTriggerTested(true)
      } else if (e.key === 'ArrowLeft') {
        setSampleSlide((prev) => Math.max(1, prev - 1))
        setTriggerTested(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleEnableMic = async () => {
    stopMic()
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicStatus('denied')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) {
        setMicStatus('active')
        setMicLevel(40)
        return
      }

      const audioCtx = new AudioCtx()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const buffer = new Uint8Array(analyser.frequencyBinCount)
      setMicStatus('active')

      const tick = () => {
        analyser.getByteTimeDomainData(buffer)
        let sumSq = 0
        for (let i = 0; i < buffer.length; i++) {
          const normalized = (buffer[i] - 128) / 128
          sumSq += normalized * normalized
        }
        const rms = Math.sqrt(sumSq / buffer.length)
        setMicLevel(Math.min(100, Math.round(rms * 320)))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      setMicStatus('denied')
    }
  }

  const allGazeDone = gazeCalibrated.left && gazeCalibrated.centre && gazeCalibrated.right
  const allChecksReady = (micStatus === 'active' || micStatus === 'denied') && allGazeDone && triggerTested

  return (
    <section className="vr-lobby-shell" aria-label={t.heading}>
      <div className="vr-lobby-header">
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
          <strong>{setup.title}</strong>
          <span>
            {homeT.venues[setup.venue]} · {setup.timeLimitMinutes} {homeT.minUnit}
          </span>
        </div>
      </div>

      <div className="vr-lobby-grid">
        {/* 1. Microphone check */}
        <div className="vr-lobby-card">
          <div className="dash-card-header">
            <h2 className="dash-card-title">{t.micTitle}</h2>
            {micStatus === 'active' && <span className="tag-coached">{t.micActive}</span>}
          </div>
          <p className="setting-desc" style={{ marginBottom: 12 }}>
            {t.micDesc}
          </p>

          <button
            id="lobby-test-mic-btn"
            type="button"
            className="btn-secondary"
            onClick={() => void handleEnableMic()}
          >
            {t.micTestBtn}
          </button>

          <div className="mic-meter-wrap" aria-label={t.micLevelLabel}>
            <div className="mic-meter-track" role="meter" aria-valuenow={micLevel} aria-valuemin={0} aria-valuemax={100}>
              <div className="mic-meter-fill" style={{ width: `${micLevel}%` }} />
            </div>
          </div>

          {micStatus === 'denied' && (
            <div className="vr-lobby-fallback" role="status">
              <strong>{t.micDenied}</strong>
              <p>{t.micFallbackNote}</p>
            </div>
          )}
        </div>

        {/* 2. 3-point head/gaze calibration */}
        <div className="vr-lobby-card">
          <div className="dash-card-header">
            <h2 className="dash-card-title">{t.gazeTitle}</h2>
            {allGazeDone && <span className="tag-coached">3 / 3 ✓</span>}
          </div>
          <p className="setting-desc" style={{ marginBottom: 12 }}>
            {t.gazeDesc}
          </p>

          <div className="gaze-targets-grid">
            {(
              [
                { key: 'left', label: t.gazeLeft },
                { key: 'centre', label: t.gazeCentre },
                { key: 'right', label: t.gazeRight },
              ] as const
            ).map((zone) => {
              const done = gazeCalibrated[zone.key]
              return (
                <button
                  key={zone.key}
                  id={`lobby-gaze-${zone.key}`}
                  type="button"
                  aria-pressed={done}
                  className={`gaze-target-btn ${done ? 'calibrated' : ''}`}
                  onClick={() =>
                    setGazeCalibrated((prev) => ({ ...prev, [zone.key]: true }))
                  }
                >
                  <span className="gaze-dot" aria-hidden="true">
                    {done ? '✓' : '◎'}
                  </span>
                  <span>{zone.label}</span>
                </button>
              )
            })}
          </div>

          {allGazeDone && <p className="coached-separate-note">{t.gazeReady}</p>}
        </div>

        {/* 3. Slide trigger test */}
        <div className="vr-lobby-card">
          <div className="dash-card-header">
            <h2 className="dash-card-title">{t.triggerTitle}</h2>
            {triggerTested && <span className="tag-coached">✓</span>}
          </div>
          <p className="setting-desc" style={{ marginBottom: 12 }}>
            {t.triggerDesc}
          </p>

          <div className="trigger-test-box">
            <span className="trigger-slide-preview">
              {t.triggerSampleSlide.replace('{num}', String(sampleSlide))}
            </span>
            <div className="trigger-test-actions">
              <button
                id="lobby-trigger-prev"
                type="button"
                className="btn-small-ghost"
                disabled={sampleSlide <= 1}
                onClick={() => {
                  setSampleSlide((prev) => Math.max(1, prev - 1))
                  setTriggerTested(true)
                }}
              >
                ← {t.triggerPrev}
              </button>
              <button
                id="lobby-trigger-next"
                type="button"
                className="btn-small"
                disabled={sampleSlide >= 3}
                onClick={() => {
                  setSampleSlide((prev) => Math.min(3, prev + 1))
                  setTriggerTested(true)
                }}
              >
                {t.triggerNext} →
              </button>
            </div>
          </div>

          {triggerTested && <p className="coached-separate-note">{t.triggerReady}</p>}
        </div>
      </div>

      <div className="vr-lobby-footer">
        <div className="vr-lobby-footer-left">
          {onBackToSetups && (
            <button
              id="lobby-back-setups-btn"
              type="button"
              className="btn-secondary"
              style={{ width: 'auto' }}
              onClick={() => {
                stopMic()
                onBackToSetups()
              }}
            >
              ← {t.backToSetups}
            </button>
          )}
        </div>

        <div className="vr-lobby-footer-right">
          {!allChecksReady && (
            <button
              id="lobby-skip-checks-btn"
              type="button"
              className="btn-secondary"
              style={{ width: 'auto' }}
              onClick={() => {
                stopMic()
                onEnterSession()
              }}
            >
              {t.skipChecksBtn}
            </button>
          )}
          <button
            id="lobby-enter-session-btn"
            type="button"
            className="btn-primary"
            style={{ width: 'auto', minWidth: 200 }}
            onClick={() => {
              stopMic()
              onEnterSession()
            }}
          >
            {t.enterSessionCta}
          </button>
        </div>
      </div>
    </section>
  )
}

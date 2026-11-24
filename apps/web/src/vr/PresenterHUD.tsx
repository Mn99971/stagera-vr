import { useEffect, useRef, useState } from 'react'
import { translations } from '../lib/i18n'
import type { AppLanguage, SessionSetup, Topic } from '../types/stagera'

interface PresenterHUDProps {
  setup: SessionSetup
  language: AppLanguage
  topics: Topic[]
  currentSlideIndex: number
  coveredIds: Set<string>
  elapsedSeconds: number
  remainingSeconds: number
  panelVisible: boolean
  isPaused: boolean
  captionsEnabled: boolean
  hintUsed: boolean
  liveCaption: string
  onPrevSlide: () => void
  onNextSlide: () => void
  onJumpToSlide: (index: number) => void
  onTogglePanel: () => void
  onTogglePause: () => void
  onEnterVR: () => void
  onVoiceFeedback: (message: string) => void
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    isFinal?: boolean
    0?: { transcript?: string }
  }>
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(clamped / 60)
  const secs = clamped % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function PresenterHUD({
  setup,
  language,
  topics,
  currentSlideIndex,
  coveredIds,
  elapsedSeconds,
  remainingSeconds,
  panelVisible,
  isPaused,
  captionsEnabled,
  hintUsed,
  liveCaption,
  onPrevSlide,
  onNextSlide,
  onJumpToSlide,
  onTogglePanel,
  onTogglePause,
  onEnterVR,
  onVoiceFeedback,
}: PresenterHUDProps) {
  const t = translations[language].vr.hud
  const homeT = translations[language].home

  const [voiceActive, setVoiceActive] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const lastCommandAtRef = useRef(0)

  const getSpeechCtor = (): SpeechRecognitionCtor | null => {
    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor
      webkitSpeechRecognition?: SpeechRecognitionCtor
    }
    return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
  }

  const speechSupported = typeof window !== 'undefined' && getSpeechCtor() !== null

  // Keyboard shortcuts: Left/Right arrows, B (private panel), P/Escape (pause)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault()
        onTogglePause()
        return
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        onTogglePanel()
        return
      }
      if (isPaused) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        onNextSlide()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onPrevSlide()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isPaused, onNextSlide, onPrevSlide, onTogglePanel, onTogglePause])

  // Web Speech API voice commands: "next slide" / "previous slide" (EN & FR)
  useEffect(() => {
    if (!voiceActive || isPaused) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // Ignore stop errors
        }
        recognitionRef.current = null
      }
      return
    }

    const Ctor = getSpeechCtor()
    if (!Ctor) return

    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = language === 'fr' ? 'fr-FR' : 'en-US'

    rec.onresult = (event) => {
      const now = Date.now()
      if (now - lastCommandAtRef.current < 1100) return
      const last = event.results[event.results.length - 1]
      const transcript = (last?.[0]?.transcript ?? '').toLowerCase()

      if (
        transcript.includes('next slide') ||
        transcript.includes('diapositive suivante') ||
        transcript.includes('diapo suivante')
      ) {
        lastCommandAtRef.current = now
        onNextSlide()
        onVoiceFeedback(t.voiceHeardNext)
      } else if (
        transcript.includes('previous slide') ||
        transcript.includes('diapositive précédente') ||
        transcript.includes('diapo précédente')
      ) {
        lastCommandAtRef.current = now
        onPrevSlide()
        onVoiceFeedback(t.voiceHeardPrev)
      }
    }

    rec.onerror = () => {
      setVoiceActive(false)
    }

    rec.onend = () => {
      if (voiceActive && !isPaused && recognitionRef.current === rec) {
        try {
          rec.start()
        } catch {
          setVoiceActive(false)
        }
      }
    }

    try {
      rec.start()
      recognitionRef.current = rec
    } catch {
      setVoiceActive(false)
    }

    return () => {
      recognitionRef.current = null
      try {
        rec.stop()
      } catch {
        // Ignore
      }
    }
  }, [voiceActive, isPaused, language, onNextSlide, onPrevSlide, onVoiceFeedback, t.voiceHeardNext, t.voiceHeardPrev])

  const totalSlides = Math.max(1, topics.length)
  const isInterview = setup.practiceType === 'interview'
  const counterText = (isInterview ? t.questionCounter : t.slideCounter)
    .replace('{current}', String(currentSlideIndex + 1))
    .replace('{total}', String(totalSlides))

  const showOneMinWarning =
    setup.oneMinWarning && remainingSeconds > 0 && remainingSeconds <= 60
  const showTimeUp = remainingSeconds === 0

  return (
    <>
      {/* Top Bar Controls */}
      <div className="vr-stage-overlay-bar">
        <div className="vr-stage-meta">
          <strong>{setup.title}</strong>
          <span>
            {homeT.venues[setup.venue]} · {counterText}
            {hintUsed ? ` · ${t.hintUsedBadge}` : ''}
          </span>
        </div>

        <div className="vr-stage-actions">
          <button
            id="hud-prev-slide-btn"
            type="button"
            className="vr-hud-btn"
            disabled={currentSlideIndex <= 0 || isPaused}
            onClick={onPrevSlide}
          >
            ← {t.prevSlide}
          </button>
          <button
            id="hud-next-slide-btn"
            type="button"
            className="vr-hud-btn"
            disabled={currentSlideIndex >= totalSlides - 1 || isPaused}
            onClick={onNextSlide}
          >
            {t.nextSlide} →
          </button>
          <button
            id="hud-voice-toggle-btn"
            type="button"
            className={`vr-hud-btn ${voiceActive ? 'active' : ''}`}
            disabled={!speechSupported || isPaused}
            aria-pressed={voiceActive}
            onClick={() => setVoiceActive((prev) => !prev)}
          >
            {!speechSupported ? t.voiceUnsupported : voiceActive ? t.voiceOn : t.voiceOff}
          </button>
          <button
            id="hud-panel-toggle-btn"
            type="button"
            className={`vr-hud-btn ${panelVisible ? 'active' : ''}`}
            aria-pressed={panelVisible}
            onClick={onTogglePanel}
          >
            {panelVisible ? t.panelHide : t.panelShow}
          </button>
          <button
            id="hud-pause-btn"
            type="button"
            className="vr-hud-btn"
            onClick={onTogglePause}
          >
            ⏸ {t.pauseBtn}
          </button>
          <button
            id="vr-enter-xr-btn"
            type="button"
            className="btn-small"
            onClick={onEnterVR}
          >
            {t.enterVrBtn}
          </button>
        </div>
      </div>

      {/* 1-Minute Warning / Time-Up Banner */}
      {(showOneMinWarning || showTimeUp) && (
        <div
          id="hud-time-warning-banner"
          className={`vr-warning-banner ${showTimeUp ? 'danger' : ''}`}
          role="alert"
        >
          {showTimeUp ? t.timeUpBanner : t.oneMinWarningBanner}
        </div>
      )}

      {/* Toggleable Private Presenter Panel (NFR-10: large readable text >=32px equivalent) */}
      {panelVisible && (
        <aside className="vr-private-panel" aria-label={t.topicsHeading}>
          <div className="vr-private-timers">
            <div className="vr-timer-block">
              <span className="vr-timer-label">{t.elapsedLabel}</span>
              <span className="vr-timer-big">{formatClock(elapsedSeconds)}</span>
            </div>
            <div className="vr-timer-block">
              <span className="vr-timer-label">{t.remainingLabel}</span>
              <span
                className={`vr-timer-big ${
                  showTimeUp ? 'danger' : showOneMinWarning ? 'warn' : ''
                }`}
              >
                {formatClock(remainingSeconds)}
              </span>
            </div>
          </div>

          <div className="vr-private-slide-badge">{counterText}</div>

          <div className="vr-private-topics">
            <span className="vr-timer-label">{t.topicsHeading}</span>
            <ul className="vr-topic-checklist">
              {topics.map((topic, idx) => {
                const isCurrent = idx === currentSlideIndex
                const isCovered = coveredIds.has(topic.id)
                return (
                  <li key={topic.id}>
                    <button
                      type="button"
                      className={`vr-topic-item ${isCurrent ? 'current' : ''} ${
                        isCovered ? 'covered' : ''
                      }`}
                      onClick={() => onJumpToSlide(idx)}
                    >
                      <span className="vr-topic-tick" aria-hidden="true">
                        {isCovered ? '✓' : idx + 1}
                      </span>
                      <span className="vr-topic-name">{topic.title}</span>
                      {topic.brief && <span className="vr-brief-pill">{t.briefTag}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>
      )}

      {/* Live Captions Bar (ON by default - NFR-10) */}
      {captionsEnabled && liveCaption && (
        <div className="vr-captions-bar" role="status" aria-live="polite">
          {liveCaption}
        </div>
      )}
    </>
  )
}

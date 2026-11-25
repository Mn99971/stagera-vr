/**
 * VR-Safe Microphone, Web Audio Manager & Real-Time Audio VAD / Syllable Pace Tracker
 *
 * Standalone VR browsers (Meta Quest Browser):
 *  1. Block `getUserMedia` unless invoked directly inside a user gesture.
 *  2. Frequently suspend `AudioContext` upon WebXR `sessionstart`.
 *  3. Do NOT support `webkitSpeechRecognition`, leaving WPM & word count at 0
 *     unless driven by real-time Web Audio Voice Activity Detection (VAD).
 *
 * This manager handles gesture-based mic capture, `sessionstart` resume,
 * zero-allocation RMS level sampling, AND real-time syllable-based VAD word/WPM
 * & pause tracking directly from the live Quest microphone stream.
 */

export type VRMicStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported'

export interface VRMicSnapshot {
  status: VRMicStatus
  errorMessage: string | null
}

export interface VADSpeechMetrics {
  isSpeaking: boolean
  estimatedWords: number
  syllables: number
  speakingDurationSeconds: number
  rollingWpm: number
  overallWpm: number
  currentSilenceSeconds: number
  slideSpeakingSeconds: number
  qaSpeakingSeconds: number
  level: number
}

export interface VADStepResult {
  metrics: VADSpeechMetrics
  detectedLongPause: boolean
  longPauseSeconds: number
  slideCoveredNow: boolean
}

type Listener = (snapshot: VRMicSnapshot) => void

const SYLLABLES_PER_WORD = 1.45
const VOICE_RMS_FLOOR_THRESHOLD = 0.022
const VOICE_HANGOVER_SEC = 0.30
const MIN_SYLLABLE_INTERVAL_SEC = 0.14
const LONG_PAUSE_THRESHOLD_SEC = 3.5
const LONG_PAUSE_COOLDOWN_SEC = 8.0
const SLIDE_COVERED_SPEAK_SEC = 4.5

class VRMicManager {
  private stream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private dataBuffer: Uint8Array<ArrayBuffer> | null = null
  private smoothedLevel = 0
  private lastRawRms = 0
  private status: VRMicStatus = 'idle'
  private errorMessage: string | null = null
  private listeners = new Set<Listener>()
  private pendingRequest: Promise<boolean> | null = null

  // Real-time Audio VAD & Syllable Pace Tracker state
  private noiseFloorRms = 0.008
  private fastEnv = 0
  private slowEnv = 0
  private wasAbovePeak = false
  private timeSinceLastSyllable = 1
  private voiceHangover = 0
  private isSpeaking = false
  private hasEverSpoken = false
  private syllables = 0
  private syllableTimestamps: number[] = []
  private sessionClockSec = 0
  private speakingDurationSec = 0
  private currentSilenceSec = 0
  private longPauseFlaggedForGap = false
  private lastLongPauseAtSec = -999
  private slideSpeakingSec = 0
  private slideCoveredEmitted = false
  private qaSpeakingSec = 0

  getSnapshot(): VRMicSnapshot {
    return { status: this.status, errorMessage: this.errorMessage }
  }

  getStream(): MediaStream | null {
    if (this.stream && this.stream.active) {
      return this.stream
    }
    return null
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const snap = this.getSnapshot()
    this.listeners.forEach((fn) => fn(snap))
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      return this.audioCtx
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    this.audioCtx = new AudioCtx()
    return this.audioCtx
  }

  /**
   * MUST be called directly inside a user click gesture (e.g. "Enter VR" or
   * "Start Practice") BEFORE the WebXR session takes over.
   */
  requestMicFromGesture(): Promise<boolean> {
    if (this.stream && this.stream.active && this.status === 'active') {
      void this.resumeAudioContext()
      return Promise.resolve(true)
    }

    if (this.pendingRequest) {
      return this.pendingRequest
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      this.status = 'unsupported'
      this.errorMessage = 'Microphone API unavailable in this browser'
      this.emit()
      return Promise.resolve(false)
    }

    const ctx = this.ensureAudioContext()
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }

    this.status = 'requesting'
    this.errorMessage = null
    this.emit()

    const request = navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        this.stream = stream
        const activeCtx = this.ensureAudioContext()
        if (activeCtx) {
          if (activeCtx.state === 'suspended') {
            void activeCtx.resume().catch(() => {})
          }
          const source = activeCtx.createMediaStreamSource(stream)
          const analyser = activeCtx.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.55
          source.connect(analyser)
          this.analyser = analyser
          this.dataBuffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
        }
        this.status = 'active'
        this.errorMessage = null
        this.emit()
        return true
      })
      .catch((err: unknown) => {
        this.status = 'denied'
        const name = err instanceof Error ? err.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          this.errorMessage = 'Mic permission blocked'
        } else if (name === 'NotFoundError') {
          this.errorMessage = 'No microphone detected'
        } else {
          this.errorMessage = 'Mic unavailable'
        }
        this.emit()
        return false
      })
      .finally(() => {
        this.pendingRequest = null
      })

    this.pendingRequest = request
    return request
  }

  /**
   * Call inside WebXR `sessionstart` to recover from Quest Browser suspending
   * AudioContext upon entering immersive-vr.
   */
  async resumeAudioContext(): Promise<void> {
    if (!this.audioCtx || this.audioCtx.state === 'closed') return
    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume()
      } catch {
        // Ignore
      }
    }
  }

  private readRawRms(): number {
    if (this.status !== 'active' || !this.analyser || !this.dataBuffer) {
      this.lastRawRms = 0
      return 0
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {})
    }

    this.analyser.getByteTimeDomainData(this.dataBuffer)
    let sumSq = 0
    for (let i = 0; i < this.dataBuffer.length; i++) {
      const normalized = (this.dataBuffer[i] - 128) / 128
      sumSq += normalized * normalized
    }
    const rms = Math.sqrt(sumSq / this.dataBuffer.length)
    this.lastRawRms = rms
    return rms
  }

  /**
   * Reads instantaneous smoothed input level (0..1) for visual VU meters.
   */
  sampleLevel(): number {
    if (this.status !== 'active' || !this.analyser || !this.dataBuffer) {
      this.smoothedLevel *= 0.82
      return this.smoothedLevel
    }

    const rms = this.readRawRms()
    const target = Math.min(1, rms * 5.2)
    this.smoothedLevel = this.smoothedLevel * 0.65 + target * 0.35
    return this.smoothedLevel
  }

  /* ==================== Real-Time Audio VAD & Syllable Tracker ==================== */

  resetVADSession(): void {
    this.noiseFloorRms = 0.008
    this.fastEnv = 0
    this.slowEnv = 0
    this.wasAbovePeak = false
    this.timeSinceLastSyllable = 1
    this.voiceHangover = 0
    this.isSpeaking = false
    this.hasEverSpoken = false
    this.syllables = 0
    this.syllableTimestamps = []
    this.sessionClockSec = 0
    this.speakingDurationSec = 0
    this.currentSilenceSec = 0
    this.longPauseFlaggedForGap = false
    this.lastLongPauseAtSec = -999
    this.slideSpeakingSec = 0
    this.slideCoveredEmitted = false
    this.qaSpeakingSec = 0
  }

  resetSlideSpeakingTimer(): void {
    this.slideSpeakingSec = 0
    this.slideCoveredEmitted = false
  }

  resetQASpeakingTimer(): void {
    this.qaSpeakingSec = 0
  }

  getVADMetrics(): VADSpeechMetrics {
    const estimatedWords = Math.floor(this.syllables / SYLLABLES_PER_WORD)

    // Rolling 25-second syllable pace window
    const windowSec = 25
    const cutoff = this.sessionClockSec - windowSec
    let recentSyllables = 0
    for (let i = this.syllableTimestamps.length - 1; i >= 0; i--) {
      if (this.syllableTimestamps[i] >= cutoff) {
        recentSyllables += 1
      } else {
        break
      }
    }
    const recentWords = recentSyllables / SYLLABLES_PER_WORD
    const effectiveWindow = Math.max(5, Math.min(windowSec, this.speakingDurationSec + 2))
    const rawRolling = recentSyllables >= 2 ? Math.round((recentWords / effectiveWindow) * 60) : 0
    const rollingWpm = rawRolling > 0 ? Math.max(65, Math.min(230, rawRolling)) : 0

    // Overall WPM over active session speaking/elapsed time
    const effectiveTotalSec = Math.max(5, this.sessionClockSec)
    const rawOverall = estimatedWords > 0 ? Math.round((estimatedWords / effectiveTotalSec) * 60) : 0
    const overallWpm = rawOverall > 0 ? Math.max(60, Math.min(230, rawOverall)) : 0

    return {
      isSpeaking: this.isSpeaking,
      estimatedWords,
      syllables: this.syllables,
      speakingDurationSeconds: Math.round(this.speakingDurationSec * 10) / 10,
      rollingWpm,
      overallWpm,
      currentSilenceSeconds: Math.round(this.currentSilenceSec * 10) / 10,
      slideSpeakingSeconds: Math.round(this.slideSpeakingSec * 10) / 10,
      qaSpeakingSeconds: Math.round(this.qaSpeakingSec * 10) / 10,
      level: this.smoothedLevel,
    }
  }

  /**
   * Advances real-time VAD & syllable pace detection by `dt` seconds.
   * Call on a ~60ms interval while `phase === 'active' && !isPaused`.
   */
  stepVAD(dtSeconds: number, opts?: { inQA?: boolean }): VADStepResult {
    const dt = Math.max(0.01, Math.min(0.25, dtSeconds))
    this.sessionClockSec += dt
    this.timeSinceLastSyllable += dt

    const level = this.sampleLevel()
    const rms = this.lastRawRms

    // Adaptive ambient noise floor when quiet
    const dynamicThreshold = Math.max(VOICE_RMS_FLOOR_THRESHOLD, this.noiseFloorRms * 2.4)
    if (rms < dynamicThreshold && this.status === 'active') {
      this.noiseFloorRms = this.noiseFloorRms * 0.985 + rms * 0.015
    }

    // Fast (speech burst) vs slow (syllable baseline) envelopes
    this.fastEnv = this.fastEnv * 0.55 + rms * 0.45
    this.slowEnv = this.slowEnv * 0.90 + rms * 0.10

    const activeVoiceNow = this.status === 'active' && this.fastEnv >= dynamicThreshold
    if (activeVoiceNow) {
      this.voiceHangover = VOICE_HANGOVER_SEC
    } else {
      this.voiceHangover = Math.max(0, this.voiceHangover - dt)
    }

    this.isSpeaking = this.voiceHangover > 0

    // Syllable peak detection (envelope onset above slow baseline)
    const peakThreshold = Math.max(dynamicThreshold * 1.05, this.slowEnv * 1.18)
    const abovePeak = this.status === 'active' && this.fastEnv >= peakThreshold

    if (abovePeak && !this.wasAbovePeak && this.timeSinceLastSyllable >= MIN_SYLLABLE_INTERVAL_SEC) {
      this.syllables += 1
      this.syllableTimestamps.push(this.sessionClockSec)
      // Prune timestamps older than 35s to keep memory tiny
      while (
        this.syllableTimestamps.length > 0 &&
        this.syllableTimestamps[0] < this.sessionClockSec - 35
      ) {
        this.syllableTimestamps.shift()
      }
      this.timeSinceLastSyllable = 0
    }
    this.wasAbovePeak = abovePeak

    let detectedLongPause = false
    let longPauseSeconds = 0
    let slideCoveredNow = false

    if (this.isSpeaking) {
      this.hasEverSpoken = true
      this.speakingDurationSec += dt
      this.slideSpeakingSec += dt
      if (opts?.inQA) {
        this.qaSpeakingSec += dt
      }
      this.currentSilenceSec = 0
      this.longPauseFlaggedForGap = false

      // Sustain baseline syllable flow during steady voiced speech if peaks are flat
      if (this.timeSinceLastSyllable >= 0.42) {
        this.syllables += 1
        this.syllableTimestamps.push(this.sessionClockSec)
        this.timeSinceLastSyllable = 0
      }

      if (!this.slideCoveredEmitted && this.slideSpeakingSec >= SLIDE_COVERED_SPEAK_SEC) {
        this.slideCoveredEmitted = true
        slideCoveredNow = true
      }
    } else if (this.hasEverSpoken) {
      this.currentSilenceSec += dt
      if (
        !this.longPauseFlaggedForGap &&
        this.currentSilenceSec >= LONG_PAUSE_THRESHOLD_SEC &&
        this.sessionClockSec - this.lastLongPauseAtSec >= LONG_PAUSE_COOLDOWN_SEC
      ) {
        this.longPauseFlaggedForGap = true
        this.lastLongPauseAtSec = this.sessionClockSec
        detectedLongPause = true
        longPauseSeconds = Math.round(this.currentSilenceSec * 10) / 10
      }
    }

    return {
      metrics: {
        ...this.getVADMetrics(),
        level,
      },
      detectedLongPause,
      longPauseSeconds,
      slideCoveredNow,
    }
  }

  release(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      void this.audioCtx.close().catch(() => {})
      this.audioCtx = null
    }
    this.analyser = null
    this.dataBuffer = null
    this.smoothedLevel = 0
    this.lastRawRms = 0
    this.status = 'idle'
    this.errorMessage = null
    this.resetVADSession()
    this.emit()
  }
}

export const vrMicManager = new VRMicManager()

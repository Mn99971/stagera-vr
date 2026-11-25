import type { AppLanguage, VenueType } from '../types/stagera'

/**
 * Zero-Asset Procedural VR Audio Engine (Web Audio API + Web Speech API)
 *
 * Provides:
 * - Warm ambient lobby synth pad music (with smooth fade-out & Music On/Off toggle)
 * - Venue-scaled subtle room tone & crowd murmur
 * - Stereo-panned interruption & distraction SFX (phone buzz, whisper burst,
 *   throat clear, late arrival door + footsteps, hand-raise Q&A chime)
 * - Spoken audience/recruiter TTS with per-speaker pitch/rate variation
 * - Session cues (1-minute warning chime, S2.6 applause burst, crisp UI hover/click)
 * - Clean mute/pause/resume on S2.5 Pause or session exit
 */

class VRAudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  private musicEnabled = true
  private musicTimer: number | null = null
  private musicGain: GainNode | null = null
  private musicOscillators: OscillatorNode[] = []
  private musicChordIndex = 0
  private isLobbyMusicPlaying = false

  private ambienceGain: GainNode | null = null
  private ambienceSource: AudioBufferSourceNode | null = null
  private ambienceLfo: OscillatorNode | null = null

  private listeners = new Set<(musicEnabled: boolean) => void>()

  isMusicEnabled(): boolean {
    return this.musicEnabled
  }

  subscribeMusic(listener: (enabled: boolean) => void): () => void {
    this.listeners.add(listener)
    listener(this.musicEnabled)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled
    this.listeners.forEach((fn) => fn(enabled))
    if (!enabled) {
      this.stopLobbyMusic(0.25)
    } else if (this.isLobbyMusicPlaying) {
      this.startLobbyMusic()
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (this.ctx && this.ctx.state !== 'closed') {
      return this.ctx
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      const ctx = new Ctor()
      const master = ctx.createGain()
      master.gain.value = 0.9
      master.connect(ctx.destination)
      this.ctx = ctx
      this.masterGain = master
      this.noiseBuffer = this.buildPinkNoiseBuffer(ctx, 3)
      return ctx
    } catch {
      return null
    }
  }

  private buildPinkNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let b3 = 0
    let b4 = 0
    let b5 = 0
    let b6 = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04
      b6 = white * 0.115926
    }
    return buffer
  }

  /** Call directly inside a user gesture ("Enter VR", splash tap, Start button) */
  unlock(): void {
    const ctx = this.ensureContext()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
  }

  async resume(): Promise<void> {
    const ctx = this.ensureContext()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        // Ignore if no gesture yet
      }
    }
  }

  private createPanner(ctx: AudioContext, pan: number): AudioNode {
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner()
      panner.pan.value = Math.max(-0.9, Math.min(0.9, pan))
      panner.connect(this.masterGain ?? ctx.destination)
      return panner
    }
    return this.masterGain ?? ctx.destination
  }

  /* ======================== VR Lobby Ambient Music ======================== */

  startLobbyMusic(): void {
    this.isLobbyMusicPlaying = true
    if (!this.musicEnabled) return
    const ctx = this.ensureContext()
    if (!ctx || !this.masterGain) return
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }

    if (this.musicTimer !== null) return

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.065, ctx.currentTime + 1.2)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 540
    filter.Q.value = 0.7

    filter.connect(gain)
    gain.connect(this.masterGain)
    this.musicGain = gain

    // Warm calm chord progression: Cmaj9 -> Am9 -> Fmaj7 -> G6
    const chords = [
      [130.81, 196.0, 246.94, 293.66],
      [110.0, 164.81, 246.94, 261.63],
      [87.31, 174.61, 220.0, 261.63],
      [98.0, 196.0, 246.94, 329.63],
    ]

    const playChord = () => {
      if (!this.ctx || !this.musicGain || !this.musicEnabled) return
      const now = this.ctx.currentTime
      const freqs = chords[this.musicChordIndex % chords.length]
      this.musicChordIndex += 1

      // Gently stop previous oscillators
      this.musicOscillators.forEach((osc) => {
        try {
          osc.stop(now + 0.6)
        } catch {
          // Ignore
        }
      })
      this.musicOscillators = []

      freqs.forEach((freq, idx) => {
        if (!this.ctx) return
        const osc = this.ctx.createOscillator()
        const voiceGain = this.ctx.createGain()
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle'
        osc.frequency.setValueAtTime(freq, now)
        osc.detune.setValueAtTime((idx - 1.5) * 3.5, now)

        voiceGain.gain.setValueAtTime(0.0001, now)
        voiceGain.gain.linearRampToValueAtTime(0.24, now + 1.1)
        voiceGain.gain.setValueAtTime(0.22, now + 3.6)
        voiceGain.gain.linearRampToValueAtTime(0.0001, now + 4.7)

        osc.connect(voiceGain)
        voiceGain.connect(filter)
        osc.start(now)
        osc.stop(now + 4.8)
        this.musicOscillators.push(osc)
      })
    }

    playChord()
    this.musicTimer = window.setInterval(playChord, 4400)
  }

  stopLobbyMusic(fadeSeconds = 0.7): void {
    this.isLobbyMusicPlaying = false
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer)
      this.musicTimer = null
    }
    const ctx = this.ctx
    const gain = this.musicGain
    const oscs = this.musicOscillators
    this.musicGain = null
    this.musicOscillators = []

    if (ctx && gain) {
      const now = ctx.currentTime
      try {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds)
      } catch {
        // Ignore
      }
      window.setTimeout(() => {
        oscs.forEach((o) => {
          try {
            o.stop()
          } catch {
            // Ignore
          }
        })
        try {
          gain.disconnect()
        } catch {
          // Ignore
        }
      }, fadeSeconds * 1000 + 80)
    }
  }

  /* ======================== Venue Room Ambience ======================== */

  startRoomAmbience(venue: VenueType): void {
    this.stopRoomAmbience()
    const ctx = this.ensureContext()
    if (!ctx || !this.masterGain || !this.noiseBuffer) return
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }

    const levelByVenue: Record<VenueType, number> = {
      interview_room: 0.014,
      panel_room: 0.022,
      classroom: 0.032,
      lecture_hall: 0.044,
      auditorium: 0.056,
    }
    const targetVol = levelByVenue[venue]

    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true

    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = venue === 'interview_room' ? 240 : 420
    band.Q.value = 0.65

    const gain = ctx.createGain()
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(targetVol, now + 1.0)

    // Subtle slow crowd-murmur breathing LFO
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.18
    lfoGain.gain.value = targetVol * 0.25
    lfo.connect(lfoGain)
    lfoGain.connect(gain.gain)

    src.connect(band)
    band.connect(gain)
    gain.connect(this.masterGain)

    src.start(now)
    lfo.start(now)

    this.ambienceSource = src
    this.ambienceGain = gain
    this.ambienceLfo = lfo
  }

  stopRoomAmbience(): void {
    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop()
      } catch {
        // Ignore
      }
      this.ambienceSource = null
    }
    if (this.ambienceLfo) {
      try {
        this.ambienceLfo.stop()
      } catch {
        // Ignore
      }
      this.ambienceLfo = null
    }
    if (this.ambienceGain) {
      try {
        this.ambienceGain.disconnect()
      } catch {
        // Ignore
      }
      this.ambienceGain = null
    }
  }

  /* ======================== Interruption & Distraction SFX ======================== */

  /** Phone double-vibrate buzz + soft notification ping panned left/right */
  playPhoneBuzz(pan = 0.5): void {
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running') return
    const dest = this.createPanner(ctx, pan)
    const now = ctx.currentTime

    // Two short vibrate pulses
    ;[0, 0.26].forEach((offset) => {
      const osc = ctx.createOscillator()
      const am = ctx.createOscillator()
      const amGain = ctx.createGain()
      const g = ctx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.value = 158
      am.frequency.value = 26
      amGain.gain.value = 0.035

      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 420

      g.gain.setValueAtTime(0.0001, now + offset)
      g.gain.linearRampToValueAtTime(0.055, now + offset + 0.02)
      g.gain.setValueAtTime(0.055, now + offset + 0.14)
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18)

      am.connect(amGain)
      amGain.connect(g.gain)
      osc.connect(lp)
      lp.connect(g)
      g.connect(dest)

      osc.start(now + offset)
      am.start(now + offset)
      osc.stop(now + offset + 0.2)
      am.stop(now + offset + 0.2)
    })

    // Soft notification ping
    const ping = ctx.createOscillator()
    const pg = ctx.createGain()
    ping.type = 'sine'
    ping.frequency.setValueAtTime(1318, now + 0.5)
    ping.frequency.setValueAtTime(1760, now + 0.59)
    pg.gain.setValueAtTime(0.0001, now + 0.5)
    pg.gain.linearRampToValueAtTime(0.045, now + 0.52)
    pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.78)
    ping.connect(pg)
    pg.connect(dest)
    ping.start(now + 0.5)
    ping.stop(now + 0.8)
  }

  /** Modulated bandpass pink-noise burst simulating brief muffled side-chatter */
  playWhisperBurst(pan = -0.55): void {
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running' || !this.noiseBuffer) return
    const dest = this.createPanner(ctx, pan)
    const now = ctx.currentTime

    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1450
    bp.Q.value = 2.4

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.11, now + 0.14)
    g.gain.linearRampToValueAtTime(0.04, now + 0.42)
    g.gain.linearRampToValueAtTime(0.10, now + 0.72)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.15)

    src.connect(bp)
    bp.connect(g)
    g.connect(dest)
    src.start(now)
    src.stop(now + 1.2)
  }

  /** Short filtered noise burst simulating a realistic room throat clear / cough */
  playThroatClear(pan = 0.4): void {
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running' || !this.noiseBuffer) return
    const dest = this.createPanner(ctx, pan)
    const now = ctx.currentTime

    ;[0, 0.18].forEach((offset, idx) => {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer

      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = idx === 0 ? 680 : 820
      bp.Q.value = 2.2

      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, now + offset)
      g.gain.linearRampToValueAtTime(0.13, now + offset + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14)

      src.connect(bp)
      bp.connect(g)
      g.connect(dest)
      src.start(now + offset)
      src.stop(now + offset + 0.16)
    })
  }

  /** Low wooden door thud + 4 soft fading footsteps panned from back/side */
  playLateArrival(pan = -0.7): void {
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running' || !this.noiseBuffer) return
    const dest = this.createPanner(ctx, pan)
    const now = ctx.currentTime

    // Door thud
    const thud = ctx.createOscillator()
    const tg = ctx.createGain()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(110, now)
    thud.frequency.exponentialRampToValueAtTime(42, now + 0.16)
    tg.gain.setValueAtTime(0.14, now)
    tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    thud.connect(tg)
    tg.connect(dest)
    thud.start(now)
    thud.stop(now + 0.24)

    // 4 soft fading footsteps
    for (let i = 0; i < 4; i++) {
      const t = now + 0.35 + i * 0.38
      const stepSrc = ctx.createBufferSource()
      stepSrc.buffer = this.noiseBuffer
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 320
      const sg = ctx.createGain()
      const vol = Math.max(0.03, 0.12 - i * 0.024)
      sg.gain.setValueAtTime(0.0001, t)
      sg.gain.linearRampToValueAtTime(vol, t + 0.02)
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
      stepSrc.connect(lp)
      lp.connect(sg)
      sg.connect(dest)
      stepSrc.start(t)
      stepSrc.stop(t + 0.13)
    }
  }

  /** Gentle two-tone hand-raise / Q&A attention chime */
  playHandRaiseChime(pan = 0): void {
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running') return
    const dest = this.createPanner(ctx, pan)
    const now = ctx.currentTime

    ;[
      { freq: 587.33, start: 0, dur: 0.18 },
      { freq: 880.0, start: 0.12, dur: 0.28 },
    ].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + start)
      g.gain.setValueAtTime(0.0001, now + start)
      g.gain.linearRampToValueAtTime(0.07, now + start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
      osc.connect(g)
      g.connect(dest)
      osc.start(now + start)
      osc.stop(now + start + dur + 0.02)
    })
  }

  /* ======================== Session Cues & UI Chimes ======================== */

  /** Subtle warm chime for the 1-minute warning */
  playOneMinuteWarning(): void {
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running') return
    const dest = this.masterGain ?? ctx.destination
    const now = ctx.currentTime

    ;[
      { freq: 659.25, start: 0, dur: 0.22 },
      { freq: 523.25, start: 0.18, dur: 0.34 },
    ].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + start)
      g.gain.setValueAtTime(0.0001, now + start)
      g.gain.linearRampToValueAtTime(0.075, now + start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
      osc.connect(g)
      g.connect(dest)
      osc.start(now + start)
      osc.stop(now + start + dur + 0.03)
    })
  }

  /** Synthesized stereo audience applause burst for S2.6 Session Complete */
  playApplause(): void {
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running' || !this.noiseBuffer) return
    const now = ctx.currentTime

    // Stereo layered filtered noise bed + rapid micro-clap bursts
    ;[-0.45, 0.45].forEach((pan) => {
      const dest = this.createPanner(ctx, pan)
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      src.loop = true

      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = pan < 0 ? 1150 : 1450
      bp.Q.value = 0.85

      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, now)
      g.gain.linearRampToValueAtTime(0.14, now + 0.45)
      g.gain.setValueAtTime(0.13, now + 1.65)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.8)

      src.connect(bp)
      bp.connect(g)
      g.connect(dest)
      src.start(now)
      src.stop(now + 2.85)
    })
  }

  playHover(): void {
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running') return
    try {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(860, now)
      osc.frequency.exponentialRampToValueAtTime(1080, now + 0.032)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.linearRampToValueAtTime(0.028, now + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038)
      osc.connect(gain)
      gain.connect(this.masterGain ?? ctx.destination)
      osc.start(now)
      osc.stop(now + 0.042)
    } catch {
      // Ignore
    }
  }

  playClick(): void {
    const ctx = this.ensureContext()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
    try {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(640, now)
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.055)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.linearRampToValueAtTime(0.06, now + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075)
      osc.connect(gain)
      gain.connect(this.masterGain ?? ctx.destination)
      osc.start(now)
      osc.stop(now + 0.08)
    } catch {
      // Ignore
    }
  }

  /* ======================== Spoken Audience / Recruiter TTS ======================== */

  speakAudienceVoice(text: string, language: AppLanguage, speakerIndex = 0): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = language === 'fr' ? 'fr-FR' : 'en-US'
      // Slight pitch & rate variation per speaker for natural variety
      const pitches = [0.92, 1.04, 1.12, 0.98]
      const rates = [0.98, 1.03, 0.96, 1.05]
      utter.pitch = pitches[Math.abs(speakerIndex) % pitches.length]
      utter.rate = rates[Math.abs(speakerIndex) % rates.length]
      window.speechSynthesis.speak(utter)
    } catch {
      // Fail gracefully if TTS is unavailable
    }
  }

  stopSpeech(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
    } catch {
      // Ignore
    }
  }

  /* ======================== Pause / Cleanup ======================== */

  pauseAll(): void {
    this.stopRoomAmbience()
    this.stopLobbyMusic(0.2)
    this.stopSpeech()
  }

  stopAll(): void {
    this.stopRoomAmbience()
    this.stopLobbyMusic(0.2)
    this.stopSpeech()
  }
}

export const vrAudioEngine = new VRAudioEngine()

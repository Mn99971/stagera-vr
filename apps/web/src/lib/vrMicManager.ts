/**
 * VR-Safe Microphone & Web Audio Manager
 *
 * Standalone VR browsers (Meta Quest Browser) block `getUserMedia` unless
 * invoked directly inside a user gesture, and frequently suspend `AudioContext`
 * upon WebXR `sessionstart`. This manager:
 *  1. Captures the microphone stream & creates/resumes the AudioContext inside
 *     the exact click handler before entering VR.
 *  2. Exposes `resumeAudioContext()` for the XR `sessionstart` listener.
 *  3. Provides a zero-allocation `sampleLevel()` (0..1) for the 3D podium HUD
 *     live mic meter bar without triggering React re-renders.
 *  4. Shares the live MediaStream with `OptionalAudioRecorder` so we never
 *     double-prompt or fail inside a `useEffect`.
 */

export type VRMicStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported'

export interface VRMicSnapshot {
  status: VRMicStatus
  errorMessage: string | null
}

type Listener = (snapshot: VRMicSnapshot) => void

class VRMicManager {
  private stream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private dataBuffer: Uint8Array<ArrayBuffer> | null = null
  private smoothedLevel = 0
  private status: VRMicStatus = 'idle'
  private errorMessage: string | null = null
  private listeners = new Set<Listener>()
  private pendingRequest: Promise<boolean> | null = null

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

    // Create & unlock AudioContext synchronously inside the user gesture
    const ctx = this.ensureAudioContext()
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        // Will retry on sessionstart
      })
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
          analyser.smoothingTimeConstant = 0.65
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
   * Call inside WebXR `sessionstart` (and visibility changes) to recover from
   * Quest Browser suspending the AudioContext upon entering immersive-vr.
   */
  async resumeAudioContext(): Promise<void> {
    if (!this.audioCtx || this.audioCtx.state === 'closed') return
    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume()
      } catch {
        // Ignore resume failure if no gesture yet
      }
    }
  }

  /**
   * Reads instantaneous smoothed RMS input level (0..1) for 3D podium meter bar.
   */
  sampleLevel(): number {
    if (this.status !== 'active' || !this.analyser || !this.dataBuffer) {
      this.smoothedLevel *= 0.85
      return this.smoothedLevel
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
    // Scale normal speech (~0.02 - 0.18 RMS) cleanly into 0..1 bar range
    const target = Math.min(1, rms * 5.2)
    this.smoothedLevel = this.smoothedLevel * 0.65 + target * 0.35
    return this.smoothedLevel
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
    this.status = 'idle'
    this.errorMessage = null
    this.emit()
  }
}

export const vrMicManager = new VRMicManager()

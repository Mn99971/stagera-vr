import type { AppLanguage } from '../types/stagera'
import { vrMicManager } from './vrMicManager'

/**
 * Chunked Live STT Streamer for Groq Whisper (`/.netlify/functions/transcribe`)
 *
 * Designed specifically for Meta Quest Browser (where `webkitSpeechRecognition`
 * is unsupported) and desktop/mobile browsers:
 *  - Reuses the already-unlocked `MediaStream` from `vrMicManager` (never calls `getUserMedia`).
 *  - Records standalone 3.5-second clips (stop & restart `MediaRecorder` each cycle)
 *    so every uploaded blob has a complete, valid container header.
 *  - Silence gate skips clips with zero voice activity to prevent Whisper hallucinations.
 *  - Silently falls back to `vrMicManager` VAD/WPM if the Netlify Function is unreachable.
 */

const CLIP_DURATION_MS = 3500
const VOICE_POLL_MS = 120
const UPLOAD_TIMEOUT_MS = 9000
const MIN_BLOB_BYTES = 800
const TRANSCRIBE_ENDPOINT = '/.netlify/functions/transcribe'

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate
      }
    } catch {
      // Ignore unsupported probe
    }
  }
  return ''
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const commaIdx = result.indexOf(',')
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
    }
    reader.onerror = () => reject(new Error('Failed to read audio clip'))
    reader.readAsDataURL(blob)
  })
}

export interface GroqTranscriberOptions {
  language: AppLanguage
  onTranscript: (text: string) => void
}

export class GroqLiveTranscriber {
  private running = false
  private sessionToken = 0
  private recorder: MediaRecorder | null = null
  private clipTimer: number | null = null
  private voicePollTimer: number | null = null
  private activeAbort: AbortController | null = null
  private consecutiveFailures = 0
  private options: GroqTranscriberOptions | null = null

  isRunning(): boolean {
    return this.running
  }

  start(options: GroqTranscriberOptions): boolean {
    this.stop()

    if (typeof MediaRecorder === 'undefined') {
      return false
    }
    const stream = vrMicManager.getStream()
    if (!stream || !stream.active) {
      return false
    }

    this.options = options
    this.running = true
    this.sessionToken += 1
    this.consecutiveFailures = 0
    this.beginNextClip(stream, this.sessionToken)
    return true
  }

  stop(): void {
    this.running = false
    this.sessionToken += 1
    this.clearTimers()

    if (this.activeAbort) {
      try {
        this.activeAbort.abort()
      } catch {
        // Ignore
      }
      this.activeAbort = null
    }

    if (this.recorder) {
      const rec = this.recorder
      this.recorder = null
      rec.ondataavailable = null
      rec.onstop = null
      rec.onerror = null
      if (rec.state !== 'inactive') {
        try {
          rec.stop()
        } catch {
          // Ignore stop errors
        }
      }
    }
  }

  private clearTimers(): void {
    if (this.clipTimer !== null) {
      window.clearTimeout(this.clipTimer)
      this.clipTimer = null
    }
    if (this.voicePollTimer !== null) {
      window.clearInterval(this.voicePollTimer)
      this.voicePollTimer = null
    }
  }

  private beginNextClip(stream: MediaStream, token: number): void {
    if (!this.running || token !== this.sessionToken || !stream.active) {
      return
    }
    // If endpoint failed 4 consecutive times (e.g. offline/local dev without Netlify Functions),
    // back off quietly and let local VAD/WPM carry the session cleanly.
    if (this.consecutiveFailures >= 4) {
      this.running = false
      return
    }

    this.clearTimers()

    const mimeType = pickSupportedMimeType()
    let recorder: MediaRecorder
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
    } catch {
      this.running = false
      return
    }

    this.recorder = recorder
    const chunks: Blob[] = []
    let voiceHits = 0

    // Silence gate: sample live VAD activity during this 3.5s window
    this.voicePollTimer = window.setInterval(() => {
      if (!this.running || token !== this.sessionToken) return
      const vad = vrMicManager.getVADMetrics()
      const level = vrMicManager.sampleLevel()
      if (vad.isSpeaking || level > 0.055) {
        voiceHits += 1
      }
    }, VOICE_POLL_MS)

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    recorder.onerror = () => {
      if (!this.running || token !== this.sessionToken) return
      this.clearTimers()
      this.recorder = null
    }

    recorder.onstop = () => {
      this.clearTimers()
      if (this.recorder === recorder) {
        this.recorder = null
      }

      const stillActive = this.running && token === this.sessionToken
      const resolvedMime = recorder.mimeType || mimeType || 'audio/webm'

      // Immediately spin up the next standalone 3.5s clip so there is minimal gap
      if (stillActive && stream.active) {
        this.beginNextClip(stream, token)
      }

      // Silence gate: skip upload if zero voice activity was detected during the clip
      if (!stillActive || voiceHits < 2 || chunks.length === 0) {
        return
      }

      const clipBlob = new Blob(chunks, { type: resolvedMime })
      if (clipBlob.size < MIN_BLOB_BYTES) {
        return
      }

      void this.uploadClip(clipBlob, resolvedMime, token)
    }

    try {
      recorder.start()
    } catch {
      this.clearTimers()
      this.recorder = null
      return
    }

    // Stop cleanly after 3.5s so each clip has a complete container header
    this.clipTimer = window.setTimeout(() => {
      if (this.recorder === recorder && recorder.state === 'recording') {
        try {
          recorder.stop()
        } catch {
          // Ignore
        }
      }
    }, CLIP_DURATION_MS)
  }

  private async uploadClip(blob: Blob, mimeType: string, token: number): Promise<void> {
    if (!this.running || token !== this.sessionToken || !this.options) return

    const controller = new AbortController()
    this.activeAbort = controller
    const timeoutId = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

    try {
      const audioBase64 = await blobToBase64(blob)
      if (!this.running || token !== this.sessionToken || !audioBase64) return

      const response = await fetch(TRANSCRIBE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          language: this.options.language,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        this.consecutiveFailures += 1
        return
      }

      const data = (await response.json()) as { text?: unknown; error?: unknown }
      if (typeof data.error === 'string' && data.error.length > 0) {
        this.consecutiveFailures += 1
        return
      }

      this.consecutiveFailures = 0
      const text = typeof data.text === 'string' ? data.text.trim() : ''
      if (text && this.running && token === this.sessionToken) {
        this.options.onTranscript(text)
      }
    } catch {
      // Silently ignore network/abort errors — local VAD/WPM handles fallback automatically
      if (this.running && token === this.sessionToken) {
        this.consecutiveFailures += 1
      }
    } finally {
      window.clearTimeout(timeoutId)
      if (this.activeAbort === controller) {
        this.activeAbort = null
      }
    }
  }
}

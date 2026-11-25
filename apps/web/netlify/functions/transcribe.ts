/**
 * Netlify Function: /.netlify/functions/transcribe
 *
 * Proxies base64-encoded 3.5s audio clips from Meta Quest / browser clients
 * to Groq Whisper (`whisper-large-v3-turbo`) using `process.env.GROQ_API_KEY`.
 * Fails gracefully with `{ text: "" }` so clients seamlessly fall back to VAD.
 */

interface NetlifyEventLike {
  httpMethod: string
  body: string | null
  isBase64Encoded?: boolean
}

interface NetlifyResponseLike {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function getExtensionForMime(mimeType: string): string {
  const lower = mimeType.toLowerCase()
  if (lower.includes('mp4') || lower.includes('m4a')) return 'm4a'
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('wav')) return 'wav'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  return 'webm'
}

function sanitizeWhisperText(raw: string): string {
  const cleaned = raw.trim()
  if (!cleaned) return ''
  // Filter well-known non-speech Whisper artifacts on near-silent clips
  const lower = cleaned.toLowerCase()
  if (
    lower === '[blank_audio]' ||
    lower === '(silence)' ||
    lower === '...' ||
    lower === 'you' ||
    lower === 'thanks for watching.' ||
    lower === 'thank you for watching.' ||
    lower.startsWith('subtitles by')
  ) {
    return ''
  }
  return cleaned
}

export const handler = async (event: NetlifyEventLike): Promise<NetlifyResponseLike> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ text: '', error: 'Method not allowed' }),
    }
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({ text: '', error: 'GROQ_API_KEY not configured' }),
    }
  }

  try {
    const rawBody = event.body
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body
      : '{}'
    const parsed = JSON.parse(rawBody) as {
      audioBase64?: unknown
      mimeType?: unknown
      language?: unknown
    }

    if (typeof parsed.audioBase64 !== 'string' || parsed.audioBase64.length < 32) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ text: '', error: 'Missing or empty audioBase64' }),
      }
    }

    const mimeType =
      typeof parsed.mimeType === 'string' && parsed.mimeType.trim().length > 0
        ? parsed.mimeType.split(';')[0].trim()
        : 'audio/webm'
    const language = parsed.language === 'fr' ? 'fr' : 'en'

    const audioBuffer = Buffer.from(parsed.audioBase64, 'base64')
    if (audioBuffer.byteLength < 256) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ text: '' }),
      }
    }

    const ext = getExtensionForMime(mimeType)
    const audioBlob = new Blob([audioBuffer], { type: mimeType })

    const formData = new FormData()
    formData.append('file', audioBlob, `clip.${ext}`)
    formData.append('model', 'whisper-large-v3-turbo')
    formData.append('language', language)
    formData.append('response_format', 'json')
    formData.append('temperature', '0')

    const groqResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    })

    if (!groqResp.ok) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          text: '',
          error: `Groq upstream ${groqResp.status}`,
        }),
      }
    }

    const groqJson = (await groqResp.json()) as { text?: unknown }
    const text = typeof groqJson.text === 'string' ? sanitizeWhisperText(groqJson.text) : ''

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ text }),
    }
  } catch {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ text: '', error: 'Transcription request failed' }),
    }
  }
}

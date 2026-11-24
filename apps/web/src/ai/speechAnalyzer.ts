import type { AppLanguage, PracticeType } from '../types/stagera'

export const FILLER_WORDS = [
  'you know',
  'basically',
  'actually',
  'like',
  'um',
  'uh',
  'so',
] as const

export interface TranscriptSegment {
  text: string
  timestampSeconds: number
  wordCount: number
}

export interface SpeechMetricsSnapshot {
  transcript: string
  totalWords: number
  rollingWpm: number
  overallWpm: number
  fillerCount: number
  fillerBreakdown: Record<string, number>
  iCount: number
  weCount: number
  lastSpeechTimestampSeconds: number | null
}

export interface ChunkAnalysisResult {
  segment: TranscriptSegment
  snapshot: SpeechMetricsSnapshot
  detectedPaceSpike: boolean
  detectedLongPause: boolean
  pauseDurationSeconds: number
  detectedWeOwnership: boolean
}

export function countWords(text: string): number {
  const cleaned = text.trim()
  if (!cleaned) return 0
  return cleaned.split(/\s+/).filter(Boolean).length
}

export function analyzeFillerWords(text: string): Record<string, number> {
  const counts: Record<string, number> = {}
  const lower = text.toLowerCase()

  for (const filler of FILLER_WORDS) {
    const escaped = filler.replace(/\s+/g, '\\s+')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    const matches = lower.match(regex)
    if (matches && matches.length > 0) {
      counts[filler] = matches.length
    }
  }
  return counts
}

export function analyzeOwnershipPronouns(text: string): { iCount: number; weCount: number } {
  const iMatches = text.match(/\b(i|i'm|i've|i'd|i'll|my|me|myself)\b/gi) ?? []
  const weMatches = text.match(/\b(we|we're|we've|we'd|we'll|our|us|ourselves)\b/gi) ?? []
  return {
    iCount: iMatches.length,
    weCount: weMatches.length,
  }
}

export class SpeechDeliveryAnalyzer {
  private segments: TranscriptSegment[] = []
  private fillerBreakdown: Record<string, number> = {}
  private totalWords = 0
  private iCount = 0
  private weCount = 0
  private lastSpeechTimestampSeconds: number | null = null

  reset(): void {
    this.segments = []
    this.fillerBreakdown = {}
    this.totalWords = 0
    this.iCount = 0
    this.weCount = 0
    this.lastSpeechTimestampSeconds = null
  }

  ingestChunk(
    rawText: string,
    timestampSeconds: number,
    practiceType: PracticeType,
  ): ChunkAnalysisResult | null {
    const text = rawText.trim()
    if (!text) return null

    const pauseDurationSeconds =
      this.lastSpeechTimestampSeconds !== null
        ? Math.max(0, timestampSeconds - this.lastSpeechTimestampSeconds)
        : 0
    const detectedLongPause = pauseDurationSeconds > 5

    const wordCount = countWords(text)
    const segment: TranscriptSegment = { text, timestampSeconds, wordCount }
    this.segments.push(segment)
    this.totalWords += wordCount
    this.lastSpeechTimestampSeconds = timestampSeconds

    // Update filler counts
    const chunkFillers = analyzeFillerWords(text)
    for (const [word, count] of Object.entries(chunkFillers)) {
      this.fillerBreakdown[word] = (this.fillerBreakdown[word] ?? 0) + count
    }

    // Update I vs we pronoun counts
    const pronouns = analyzeOwnershipPronouns(text)
    this.iCount += pronouns.iCount
    this.weCount += pronouns.weCount

    const snapshot = this.getSnapshot(timestampSeconds)
    const detectedPaceSpike = snapshot.rollingWpm > 160
    const detectedWeOwnership =
      practiceType === 'interview' &&
      pronouns.weCount >= 2 &&
      pronouns.weCount > pronouns.iCount

    return {
      segment,
      snapshot,
      detectedPaceSpike,
      detectedLongPause,
      pauseDurationSeconds,
      detectedWeOwnership,
    }
  }

  getSnapshot(currentElapsedSeconds: number): SpeechMetricsSnapshot {
    const elapsed = Math.max(1, currentElapsedSeconds)
    const overallWpm = Math.round((this.totalWords / elapsed) * 60)

    // Rolling 30-second window WPM
    const windowStart = Math.max(0, currentElapsedSeconds - 30)
    const recentWords = this.segments
      .filter((s) => s.timestampSeconds >= windowStart)
      .reduce((acc, s) => acc + s.wordCount, 0)
    const windowDuration = Math.max(5, Math.min(30, elapsed))
    const rollingWpm =
      recentWords > 0 ? Math.round((recentWords / windowDuration) * 60) : overallWpm

    const fillerCount = Object.values(this.fillerBreakdown).reduce((a, b) => a + b, 0)

    return {
      transcript: this.segments.map((s) => s.text).join(' '),
      totalWords: this.totalWords,
      rollingWpm,
      overallWpm,
      fillerCount,
      fillerBreakdown: { ...this.fillerBreakdown },
      iCount: this.iCount,
      weCount: this.weCount,
      lastSpeechTimestampSeconds: this.lastSpeechTimestampSeconds,
    }
  }
}

export function getSimulatedSpeechSample(
  practiceType: PracticeType,
  topicTitle: string,
  sampleIndex: number,
  language: AppLanguage,
): string {
  if (practiceType === 'interview') {
    const samplesEn = [
      `On ${topicTitle}, we worked as a team and we basically rebuilt the pipeline so our latency dropped by 35 percent.`,
      `Specifically, I designed the architecture, I wrote the automated test suite, and I cut deployment time in half.`,
      `Um, like, when we hit a scaling bottleneck, I profiled the queries and actually reduced p95 response time to 120 milliseconds.`,
    ]
    const samplesFr = [
      `Sur ${topicTitle}, nous avons travaillé en équipe et, basically, we rebuilt the pipeline pour réduire la latence de 35 %.`,
      `Concrètement, j’ai conçu l’architecture, I wrote the tests, et j’ai réduit le temps de déploiement de moitié.`,
      `Um, so, face au goulot d’étranglement, j’ai profilé les requêtes et ramené le temps de réponse p95 à 120 millisecondes.`,
    ]
    const pool = language === 'fr' ? samplesFr : samplesEn
    return pool[sampleIndex % pool.length]
  }

  const samplesEn = [
    `Let's look at ${topicTitle}. Our key takeaway is that clear structure keeps the audience engaged from the first minute.`,
    `Um, so basically what we found on ${topicTitle} is that, like, focusing on measurable outcomes makes the argument much stronger.`,
    `To illustrate ${topicTitle}, consider a real deployment where response times stayed under two seconds across two hundred concurrent users.`,
  ]
  const samplesFr = [
    `Regardons ${topicTitle}. Le point clé est qu’une structure claire maintient l’attention du public dès la première minute.`,
    `Um, so, sur ${topicTitle}, nous avons constaté qu’un exemple chiffré rend l’argumentation nettement plus convaincante.`,
    `Pour illustrer ${topicTitle}, prenons un déploiement réel avec un temps de réponse inférieur à deux secondes pour 200 utilisateurs.`,
  ]
  const pool = language === 'fr' ? samplesFr : samplesEn
  return pool[sampleIndex % pool.length]
}

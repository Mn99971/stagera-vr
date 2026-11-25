import type {
  FlaggedMoment,
  SessionAIFeedback,
  SessionRecord,
  SessionSetup,
  Topic,
} from '../types/stagera'

export interface AIFeedbackRequest {
  transcript: string
  wpm: number
  fillerCount: number
  fillerBreakdown: Record<string, number>
  durationSec: number
  timeLimitSec: number
  practiceType: string
  venue: string
  plannedTopics: string[]
  coveredTopics: string[]
  interviewContext?: {
    roleTitle?: string
    coachedMode?: boolean
    iCount?: number
    weCount?: number
  }
  goals: string[]
}

function parseTimestampSeconds(ts: string, maxSec: number): number {
  const match = ts.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return Math.min(maxSec, 15)
  const total = Number(match[1]) * 60 + Number(match[2])
  return Math.max(0, Math.min(Math.max(1, maxSec), total))
}

export async function requestSessionAIFeedback(
  record: SessionRecord,
  setup: SessionSetup,
  topics: Topic[],
  coveredIds: Set<string>,
): Promise<SessionAIFeedback | null> {
  const payload: AIFeedbackRequest = {
    transcript: record.transcript,
    wpm: record.wpm,
    fillerCount: record.fillerCount,
    fillerBreakdown: record.fillerBreakdown,
    durationSec: record.durationSeconds,
    timeLimitSec: Math.max(60, setup.timeLimitMinutes * 60),
    practiceType: setup.practiceType,
    venue: setup.venue,
    plannedTopics: topics.map((t) => t.title),
    coveredTopics: topics.filter((t) => coveredIds.has(t.id)).map((t) => t.title),
    interviewContext:
      setup.practiceType === 'interview'
        ? {
            roleTitle: setup.title,
            coachedMode: setup.coachedMode,
            iCount: record.iCount,
            weCount: record.weCount,
          }
        : undefined,
    goals: setup.goals,
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)

  try {
    const resp = await fetch('/.netlify/functions/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as Partial<SessionAIFeedback>
    if (!data || typeof data.quickTip !== 'string' || !data.quickTip.trim()) {
      return null
    }
    return {
      quickTip: data.quickTip.trim(),
      topRecommendations: Array.isArray(data.topRecommendations)
        ? data.topRecommendations.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
        : [],
      goalFeedback: Array.isArray(data.goalFeedback) ? data.goalFeedback : [],
      flaggedMoments: Array.isArray(data.flaggedMoments) ? data.flaggedMoments : [],
    }
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

export function applyAIFeedbackToRecord(
  record: SessionRecord,
  feedback: SessionAIFeedback,
): SessionRecord {
  const aiMoments: FlaggedMoment[] = feedback.flaggedMoments.map((m, idx) => ({
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `ai-flag-${Date.now().toString(36)}-${idx}`,
    timestampSeconds: parseTimestampSeconds(m.timestamp, record.durationSeconds),
    momentType: /pause/i.test(m.title)
      ? 'long_pause'
      : /pace|wpm|fast/i.test(m.title)
        ? 'pace_spike'
        : /we|ownership/i.test(m.title)
          ? 'we_ownership'
          : 'question',
    label: m.title,
    transcriptExcerpt: m.detail || undefined,
    aiTip: m.aiTip || undefined,
    slideIndex: 0,
  }))

  const mergedFlags =
    aiMoments.length > 0
      ? [...aiMoments, ...record.flaggedMoments].slice(0, 12)
      : record.flaggedMoments

  return {
    ...record,
    recommendations:
      feedback.topRecommendations.length > 0
        ? feedback.topRecommendations
        : record.recommendations,
    flaggedMoments: mergedFlags,
    aiFeedback: feedback,
  }
}

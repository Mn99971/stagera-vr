/**
 * Netlify Function: /.netlify/functions/feedback
 *
 * Generates real AI coaching feedback for Stagera VR End Session (S2.6) and
 * Step 3 Session Report (S3.1 / S3.1b / S3.2) via DeepSeek V4.1-Flash
 * (`model: "deepseek-flash"`, `thinking: { type: "disabled" }`).
 * Always returns HTTP 200 with valid JSON (metric-based fallback on error/empty).
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

interface FeedbackRequestPayload {
  transcript?: string
  qaTranscript?: Array<{
    role: 'interviewer' | 'candidate'
    speakerLabel: string
    text: string
    timestampSeconds: number
  }>
  wpm?: number
  fillerCount?: number
  fillerBreakdown?: Record<string, number>
  durationSec?: number
  timeLimitSec?: number
  practiceType?: string
  venue?: string
  plannedTopics?: string[]
  coveredTopics?: string[]
  interviewContext?: {
    roleTitle?: string
    jobDescription?: string
    cvSummary?: string
    projectSummary?: string
    coachedMode?: boolean
    iCount?: number
    weCount?: number
  }
  goals?: string[]
}

interface GoalFeedbackItem {
  goal: string
  status: 'Strong' | 'Improving' | 'Needs work'
  note: string
}

interface FlaggedMomentItem {
  timestamp: string
  title: string
  detail: string
  aiTip: string
}

interface FeedbackResponsePayload {
  overallScore: number
  executiveSummary: string
  strengths: string[]
  areasToImprove: string[]
  quickTip: string
  topRecommendations: string[]
  goalFeedback: GoalFeedbackItem[]
  flaggedMoments: FlaggedMomentItem[]
}

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const mins = Math.floor(s / 60)
  const rem = s % 60
  return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`
}

function buildLocalFallback(p: FeedbackRequestPayload): FeedbackResponsePayload {
  const wpm = Math.round(p.wpm ?? 0)
  const fillers = Math.round(p.fillerCount ?? 0)
  const durationSec = Math.round(p.durationSec ?? 0)
  const timeLimitSec = Math.max(60, Math.round(p.timeLimitSec ?? 300))
  const planned = p.plannedTopics ?? []
  const covered = p.coveredTopics ?? []
  const transcriptWords = (p.transcript ?? '').trim().split(/\s+/).filter(Boolean).length
  const topFiller = Object.entries(p.fillerBreakdown ?? {}).sort((a, b) => b[1] - a[1])[0]
  const isInterview =
    p.practiceType === 'interview' || p.venue === 'interview_room' || p.venue === 'panel_room'

  let score = 74
  if (wpm >= 120 && wpm <= 155) score += 10
  else if (wpm > 0 && (wpm < 100 || wpm > 175)) score -= 8
  if (fillers <= 3) score += 8
  else if (fillers > 8) score -= 8
  if (planned.length > 0 && covered.length / planned.length >= 0.8) score += 6
  if (transcriptWords < 10) score = Math.min(score, 68)
  const overallScore = Math.max(45, Math.min(98, score))

  const quickTip =
    transcriptWords < 10
      ? 'Nice warm-up run — speak through at least one full talking point next time to unlock detailed phrasing feedback.'
      : wpm > 160
        ? `Your pace ran fast at ${wpm} WPM — pause for one full beat after key points to land closer to 130–150 WPM.`
        : fillers > 3 && topFiller
          ? `Strong flow overall — replace "${topFiller[0]}" (${topFiller[1]}x) with a silent breath to sound even sharper.`
          : `Steady delivery at ${wpm || 132} WPM with ${fillers} filler words — keep sweeping the room on your next run.`

  const executiveSummary =
    transcriptWords < 10
      ? `You completed a ${formatMMSS(durationSec)} warm-up ${isInterview ? 'interview' : 'rehearsal'} session. Do a fuller take so DeepSeek coaching can analyze your phrasing, storytelling depth, and transitions in detail.`
      : `You delivered a ${formatMMSS(durationSec)} ${isInterview ? 'interview' : 'presentation'} at ${wpm || 132} WPM with ${fillers} detected filler word${fillers === 1 ? '' : 's'} and covered ${covered.length}/${Math.max(1, planned.length)} planned themes. ${wpm >= 120 && wpm <= 155 ? 'Your vocal cadence stayed comfortably inside the ideal clarity window.' : 'Adjusting pacing pauses between ideas will make your delivery even stronger.'}`

  const strengths: string[] = []
  if (wpm >= 115 && wpm <= 155) {
    strengths.push(`Balanced speaking pace (${wpm} WPM) inside the optimal 120–150 WPM comprehension range.`)
  }
  if (fillers <= 3) {
    strengths.push(`Clean verbal polish with only ${fillers} filler word${fillers === 1 ? '' : 's'} detected.`)
  }
  if (planned.length > 0 && covered.length >= Math.ceil(planned.length * 0.75)) {
    strengths.push(`Strong structural coverage: addressed ${covered.length} of ${planned.length} planned points.`)
  }
  if (isInterview && (p.interviewContext?.iCount ?? 0) >= (p.interviewContext?.weCount ?? 0) && (p.interviewContext?.iCount ?? 0) > 0) {
    strengths.push(`Clear personal ownership ("I": ${p.interviewContext?.iCount} vs "we": ${p.interviewContext?.weCount}).`)
  }
  if (strengths.length === 0) {
    strengths.push(`Completed a focused ${formatMMSS(durationSec)} live VR rehearsal under realistic room conditions.`)
  }

  const areasToImprove: string[] = []
  if (wpm > 155) {
    areasToImprove.push(`Ease pace down from ${wpm} WPM toward 130–150 WPM using intentional 1-second pauses.`)
  } else if (wpm > 0 && wpm < 115) {
    areasToImprove.push(`Lift energy slightly from ${wpm} WPM toward 125–145 WPM with tighter transitions.`)
  }
  if (fillers > 3 && topFiller) {
    areasToImprove.push(`Reduce "${topFiller[0]}" (${topFiller[1]}×) by pausing silently instead of bridging with filler words.`)
  }
  if (isInterview && (p.interviewContext?.weCount ?? 0) > (p.interviewContext?.iCount ?? 0)) {
    areasToImprove.push(`Shift from "we" (${p.interviewContext?.weCount}) toward "I" (${p.interviewContext?.iCount}) to highlight your personal contribution.`)
  }
  if (planned.length > 0 && covered.length < planned.length) {
    areasToImprove.push(`Cover remaining ${planned.length - covered.length} planned point(s) by budgeting time earlier in the session.`)
  }
  if (areasToImprove.length === 0) {
    areasToImprove.push('Anchor each major point with one quantified metric or concrete example for maximum authority.')
  }

  const topRecommendations: string[] = [
    wpm > 160
      ? `Dial back speaking pace from ${wpm} WPM toward 125–150 WPM by pausing briefly between sections.`
      : wpm > 0 && wpm < 110
        ? `Pick up energy from ${wpm} WPM toward 125–150 WPM by tightening transitions between points.`
        : `Maintain your balanced ${wpm || 135} WPM cadence and add brief emphasis pauses before key takeaways.`,
    fillers > 0 && topFiller
      ? `Cut filler words (${fillers} total, led by "${topFiller[0]}" ×${topFiller[1]}) by closing sentences with a clean pause.`
      : `Crisp phrasing with ${fillers} filler words detected — keep opening each point with a clear headline sentence.`,
    planned.length > 0 && covered.length < planned.length
      ? `You covered ${covered.length}/${planned.length} planned topics in ${formatMMSS(durationSec)} — allocate time early so later sections get full coverage.`
      : `Good time pacing (${formatMMSS(durationSec)} / ${formatMMSS(timeLimitSec)}) — add one concrete metric or story to anchor your closing.`,
  ]

  const goalFeedback: GoalFeedbackItem[] = (p.goals && p.goals.length > 0
    ? p.goals.slice(0, 3)
    : ['Clear pacing & structure']
  ).map((g) => {
    const isPace = /pace|slow|wpm/i.test(g)
    const isFiller = /filler/i.test(g)
    const status: GoalFeedbackItem['status'] =
      transcriptWords < 10
        ? 'Improving'
        : isPace
          ? wpm >= 115 && wpm <= 155
            ? 'Strong'
            : 'Needs work'
          : isFiller
            ? fillers <= 3
              ? 'Strong'
              : 'Needs work'
            : 'Improving'
    return {
      goal: g,
      status,
      note:
        transcriptWords < 10
          ? `Brief ${formatMMSS(durationSec)} warm-up captured — do a longer take so we can score this goal on your full phrasing.`
          : `Delivered at ${wpm || 130} WPM with ${fillers} filler words across ${formatMMSS(durationSec)}.`,
    }
  })

  const flaggedMoments: FlaggedMomentItem[] = []
  if (wpm > 160) {
    flaggedMoments.push({
      timestamp: formatMMSS(Math.floor(durationSec * 0.45)),
      title: `Fast pace (${wpm} WPM)`,
      detail: 'Delivery speed exceeded the 150 WPM target window.',
      aiTip: 'Insert a 1-second breath after your headline sentence before expanding.',
    })
  } else if (fillers > 2 && topFiller) {
    flaggedMoments.push({
      timestamp: formatMMSS(Math.floor(durationSec * 0.5)),
      title: `Repeated filler "${topFiller[0]}"`,
      detail: `Used "${topFiller[0]}" ${topFiller[1]} times during transitions.`,
      aiTip: 'Pause silently for half a second instead of filling the gap.',
    })
  }

  return {
    overallScore,
    executiveSummary,
    strengths,
    areasToImprove,
    quickTip,
    topRecommendations,
    goalFeedback,
    flaggedMoments,
  }
}

const SYSTEM_PROMPT = `You are an expert executive speaking & interview coach inside Stagera VR.
Analyze the speaker's session metrics, Q&A transcript, CV/role context (if provided), and full transcript.
Respond ONLY with a valid JSON object matching this exact JSON schema (no markdown fences, no extra prose):

{
  "overallScore": 82,
  "executiveSummary": "2-3 clear, human-readable sentences summarizing overall performance, delivery, and interview/presentation effectiveness.",
  "strengths": [
    "2 to 3 specific strengths referencing actual transcript/Q&A moments or metrics"
  ],
  "areasToImprove": [
    "2 to 3 concrete areas to improve referencing actual moments or metrics"
  ],
  "quickTip": "1 concise sentence (<120 chars) for the in-VR S2.6 debrief card",
  "topRecommendations": [
    "3 specific, actionable tips referencing actual transcript moments/numbers"
  ],
  "goalFeedback": [
    {
      "goal": "string",
      "status": "Strong | Improving | Needs work",
      "note": "1-2 sentences citing their actual phrasing (e.g. 'we' vs 'I' in interviews)"
    }
  ],
  "flaggedMoments": [
    {
      "timestamp": "MM:SS",
      "title": "Short label",
      "detail": "What happened",
      "aiTip": "Concrete recovery tip"
    }
  ]
}

Rules:
- Output strict JSON matching the schema above.
- "overallScore" must be an integer between 40 and 99 grounded in real delivery metrics & answer quality.
- Always provide exactly 3 items in "topRecommendations", and 2-3 items each in "strengths" and "areasToImprove".
- Keep "quickTip" under 125 characters so it fits cleanly on a VR headset debrief card.
- If the transcript has fewer than 10 words, DO NOT invent or hallucinate fake quotes; give a brief, encouraging warm-up summary based only on the real metrics provided.`

function normalizeStatus(raw: unknown): 'Strong' | 'Improving' | 'Needs work' {
  if (raw === 'Strong' || raw === 'Improving' || raw === 'Needs work') return raw
  const str = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (str.includes('strong') || str.includes('good') || str.includes('great')) return 'Strong'
  if (str.includes('need') || str.includes('work') || str.includes('weak')) return 'Needs work'
  return 'Improving'
}

async function callDeepSeekFeedback(
  apiKey: string,
  userPrompt: string,
): Promise<string | null> {
  const candidates = [process.env.DEEPSEEK_MODEL, 'deepseek-chat', 'deepseek-flash'].filter(
    (m): m is string => typeof m === 'string' && m.trim().length > 0,
  )
  const models = Array.from(new Set(candidates))

  for (const model of models) {
    try {
      const body: Record<string, unknown> = {
        model,
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 950,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }
      if (model.includes('flash')) {
        body.thinking = { type: 'disabled' }
      }

      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!resp.ok) continue
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = data.choices?.[0]?.message?.content?.trim()
      if (content) return content
    } catch {
      // Try next candidate model
    }
  }
  return null
}

export const handler = async (event: NetlifyEventLike): Promise<NetlifyResponseLike> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  let payload: FeedbackRequestPayload = {}
  try {
    const rawBody = event.body
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body
      : '{}'
    payload = JSON.parse(rawBody) as FeedbackRequestPayload
  } catch {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(buildLocalFallback({})),
    }
  }

  const fallback = buildLocalFallback(payload)
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(fallback),
    }
  }

  const transcript = (payload.transcript ?? '').trim()
  const wordCount = transcript ? transcript.split(/\s+/).filter(Boolean).length : 0
  const shortTranscriptNote =
    wordCount < 10
      ? 'NOTE: Transcript has fewer than 10 words. Give a brief warm-up summary based on the metrics without inventing any fake quotes.'
      : ''

  const qaLines = Array.isArray(payload.qaTranscript) && payload.qaTranscript.length > 0
    ? payload.qaTranscript
        .slice(-14)
        .map((t) => `[${formatMMSS(t.timestampSeconds)}] ${t.speakerLabel}: ${t.text}`)
        .join('\n')
    : ''

  const userPrompt = [
    `Practice type: ${payload.practiceType ?? 'presentation'} | Venue: ${payload.venue ?? 'auditorium'}`,
    `Duration: ${formatMMSS(payload.durationSec ?? 0)} / ${formatMMSS(payload.timeLimitSec ?? 300)}`,
    `WPM: ${payload.wpm ?? 0} | Fillers: ${payload.fillerCount ?? 0} (${JSON.stringify(payload.fillerBreakdown ?? {})})`,
    `Planned topics: ${JSON.stringify(payload.plannedTopics ?? [])}`,
    `Covered topics: ${JSON.stringify(payload.coveredTopics ?? [])}`,
    `Goals: ${JSON.stringify(payload.goals ?? [])}`,
    payload.interviewContext ? `Interview & CV context: ${JSON.stringify(payload.interviewContext)}` : '',
    qaLines ? `Interview / Q&A Transcript:\n${qaLines}` : '',
    `Speaker Transcript (${wordCount} words): ${transcript || '(empty)'}`,
    shortTranscriptNote,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const content = await callDeepSeekFeedback(apiKey, userPrompt)
    if (!content) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(fallback),
      }
    }

    const parsed = JSON.parse(content) as Partial<FeedbackResponsePayload>
    const overallScore =
      typeof parsed.overallScore === 'number' && Number.isFinite(parsed.overallScore)
        ? Math.max(40, Math.min(99, Math.round(parsed.overallScore)))
        : fallback.overallScore

    const executiveSummary =
      typeof parsed.executiveSummary === 'string' && parsed.executiveSummary.trim().length > 10
        ? parsed.executiveSummary.trim()
        : fallback.executiveSummary

    const strengths =
      Array.isArray(parsed.strengths) && parsed.strengths.length > 0
        ? parsed.strengths
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .slice(0, 4)
        : fallback.strengths

    const areasToImprove =
      Array.isArray(parsed.areasToImprove) && parsed.areasToImprove.length > 0
        ? parsed.areasToImprove
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .slice(0, 4)
        : fallback.areasToImprove

    const quickTip =
      typeof parsed.quickTip === 'string' && parsed.quickTip.trim().length > 0
        ? parsed.quickTip.trim()
        : fallback.quickTip

    const topRecommendations =
      Array.isArray(parsed.topRecommendations) && parsed.topRecommendations.length > 0
        ? parsed.topRecommendations
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .slice(0, 4)
        : fallback.topRecommendations

    const goalFeedback: GoalFeedbackItem[] = Array.isArray(parsed.goalFeedback)
      ? parsed.goalFeedback
          .filter((g) => g && typeof g.goal === 'string' && typeof g.note === 'string')
          .map((g) => ({
            goal: g.goal.trim(),
            status: normalizeStatus(g.status),
            note: g.note.trim(),
          }))
      : fallback.goalFeedback

    const flaggedMoments: FlaggedMomentItem[] = Array.isArray(parsed.flaggedMoments)
      ? parsed.flaggedMoments
          .filter((m) => m && typeof m.title === 'string')
          .slice(0, 5)
          .map((m) => ({
            timestamp: typeof m.timestamp === 'string' ? m.timestamp : '00:00',
            title: m.title.trim(),
            detail: typeof m.detail === 'string' ? m.detail.trim() : '',
            aiTip: typeof m.aiTip === 'string' ? m.aiTip.trim() : '',
          }))
      : fallback.flaggedMoments

    const normalized: FeedbackResponsePayload = {
      overallScore,
      executiveSummary,
      strengths: strengths.length > 0 ? strengths : fallback.strengths,
      areasToImprove: areasToImprove.length > 0 ? areasToImprove : fallback.areasToImprove,
      quickTip,
      topRecommendations:
        topRecommendations.length > 0 ? topRecommendations : fallback.topRecommendations,
      goalFeedback: goalFeedback.length > 0 ? goalFeedback : fallback.goalFeedback,
      flaggedMoments,
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(normalized),
    }
  } catch {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(fallback),
    }
  }
}

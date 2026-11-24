import { loadRecordedSessions } from './sessionRecorder'
import { supabase } from './supabase'
import type {
  AudienceBehaviour,
  FlaggedMoment,
  InterruptionLevel,
  PracticeType,
  SessionRecord,
  SessionSetup,
  UserProfile,
  VenueType,
} from '../types/stagera'

const LOCAL_SESSIONS_KEY = 'stagera_recorded_sessions_v1'
const TARGETS_STORAGE_KEY = 'stagera_user_targets_v1'
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface UserTargets {
  wpmMin: number
  wpmMax: number
  maxFillers: number
  weeklySessions: number
}

export const DEFAULT_USER_TARGETS: UserTargets = {
  wpmMin: 130,
  wpmMax: 150,
  maxFillers: 4,
  weeklySessions: 4,
}

export const SAMPLE_SESSION_RECORDS: SessionRecord[] = [
  {
    id: 'sample-session-1',
    setupId: 'setup-1',
    title: 'Capstone Design Pitch — Final Run',
    practiceType: 'presentation',
    venue: 'lecture_hall',
    coachedMode: false,
    hintUsed: false,
    durationSeconds: 560,
    timeLimitMinutes: 10,
    wpm: 142,
    fillerCount: 3,
    fillerBreakdown: { um: 2, so: 1 },
    eyeContactZones: { left: 26, centre: 48, right: 26 },
    topicsCovered: 5,
    topicsTotal: 5,
    iCount: 8,
    weCount: 11,
    transcript:
      'Welcome everyone. Today I am presenting our Capstone Design system. Um, our core problem was reducing sensor latency in real-time VR. So we redesigned the rendering pipeline with instanced meshes and hit 72 frames per second consistently across 200 seats.',
    recommendations: [
      'Strong speaking cadence (142 WPM) inside the 130–150 WPM target window.',
      'Only 3 filler words detected — keep replacing "um" with a silent breath on transitions.',
      'Well-balanced eye contact across Left (26%), Centre (48%), and Right (26%) audience zones.',
    ],
    flaggedMoments: [
      {
        id: 'flag-s1-1',
        timestampSeconds: 185,
        momentType: 'question',
        label: 'Audience Member: Architecture & Trade-offs',
        transcriptExcerpt:
          'How does your instanced mesh approach hold up when avatars animate independently?',
        aiTip: 'Great concise 32-second answer. Bridge back to Slide 4 immediately after Q&A.',
        slideIndex: 2,
        recoverySuccessful: true,
      },
      {
        id: 'flag-s1-2',
        timestampSeconds: 340,
        momentType: 'pace_spike',
        label: 'Pace spike (164 WPM)',
        transcriptExcerpt:
          'Um, so basically when we benchmarked the GPU draw calls they dropped from 420 down to 14.',
        aiTip: 'Slow down slightly when sharing benchmark numbers so the audience absorbs the impact.',
        slideIndex: 3,
      },
    ],
    goals: ['steady_pace', 'reduce_fillers', 'eye_contact'],
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: 'sample-session-2',
    setupId: 'setup-1',
    title: 'Capstone Design Pitch — First Rehearsal',
    practiceType: 'presentation',
    venue: 'lecture_hall',
    coachedMode: false,
    hintUsed: false,
    durationSeconds: 590,
    timeLimitMinutes: 10,
    wpm: 148,
    fillerCount: 4,
    fillerBreakdown: { um: 2, like: 1, actually: 1 },
    eyeContactZones: { left: 20, centre: 58, right: 22 },
    topicsCovered: 4,
    topicsTotal: 5,
    iCount: 5,
    weCount: 12,
    transcript:
      'Hi everyone, today we will walk through our capstone architecture. Like, the main challenge was keeping frame rates high. Actually, we tested three approaches before choosing instanced rendering.',
    recommendations: [
      'Pace (148 WPM) stayed within target — aim to hold 135–145 WPM during Q&A.',
      'You covered 4/5 planned topics; glance at the private outline to include Conclusions.',
      'Sweep left and right rows slightly longer to lift side eye contact above 25%.',
    ],
    flaggedMoments: [
      {
        id: 'flag-s2-1',
        timestampSeconds: 410,
        momentType: 'skipped_slide',
        label: 'Quickly skipped slide: Next Milestones',
        transcriptExcerpt: 'And moving right along to our final summary.',
        aiTip: 'Pause for 2–3 seconds to state one concrete takeaway before advancing.',
        slideIndex: 4,
      },
    ],
    goals: ['steady_pace', 'reduce_fillers'],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'sample-session-3',
    setupId: 'setup-2',
    title: 'Software Engineer Behavioral Interview (Independent)',
    practiceType: 'interview',
    venue: 'interview_room',
    coachedMode: false,
    hintUsed: false,
    durationSeconds: 780,
    timeLimitMinutes: 15,
    wpm: 138,
    fillerCount: 3,
    fillerBreakdown: { um: 1, so: 2 },
    eyeContactZones: { left: 18, centre: 66, right: 16 },
    topicsCovered: 4,
    topicsTotal: 4,
    iCount: 16,
    weCount: 6,
    transcript:
      'On our checkout migration project, the problem was a 4-second p95 latency spike. I profiled the database queries, I redesigned the index strategy, and I led the canary rollout. As a result, checkout latency dropped by 48 percent.',
    recommendations: [
      'Strong personal ownership: 16 "I" statements vs 6 "we" statements.',
      'Clear Problem–Action–Result structure with a quantified 48% latency improvement.',
      'Steady 138 WPM pace with only 3 filler words across 13 minutes.',
    ],
    flaggedMoments: [
      {
        id: 'flag-s3-1',
        timestampSeconds: 260,
        momentType: 'question',
        label: 'Interviewer: Flagship Project Deep-Dive',
        transcriptExcerpt: 'What was the hardest trade-off you personally made on that migration?',
        aiTip: 'Strong independent answer — concise and quantified in 38 seconds.',
        slideIndex: 1,
        recoverySuccessful: true,
      },
    ],
    goals: ['explain_contribution', 'handle_followups', 'fewer_fillers'],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'sample-session-4',
    setupId: 'setup-2',
    title: 'Software Engineer Behavioral Interview (Coached)',
    practiceType: 'interview',
    venue: 'interview_room',
    coachedMode: true,
    hintUsed: true,
    durationSeconds: 840,
    timeLimitMinutes: 15,
    wpm: 162,
    fillerCount: 8,
    fillerBreakdown: { um: 3, like: 3, basically: 2 },
    eyeContactZones: { left: 14, centre: 72, right: 14 },
    topicsCovered: 3,
    topicsTotal: 4,
    iCount: 7,
    weCount: 14,
    transcript:
      'Um, on that project we basically rebuilt the API, like we worked together so our latency improved. Actually, we shipped it in Q2.',
    recommendations: [
      'You used "we" (14) twice as often as "I" (7) — clarify what you personally built.',
      'Pace ran fast at 162 WPM; pause for a breath before stating your Result metric.',
      'Retry this interview in Independent Mode (without PAR hints) to verify retention.',
    ],
    flaggedMoments: [
      {
        id: 'flag-s4-1',
        timestampSeconds: 145,
        momentType: 'we_ownership',
        label: 'Used “we” instead of “I” ownership',
        transcriptExcerpt: 'Um, on that project we basically rebuilt the API, like we worked together.',
        aiTip: 'Replace "we rebuilt" with "I designed and implemented" to highlight your role.',
        slideIndex: 1,
      },
      {
        id: 'flag-s4-2',
        timestampSeconds: 310,
        momentType: 'hint_used',
        label: 'PAR hint used (Flagship Project Deep-Dive)',
        transcriptExcerpt: 'Opened Coached PAR prompt during pause.',
        aiTip: 'Try answering this theme again without opening the hint.',
        slideIndex: 1,
      },
    ],
    goals: ['explain_contribution', 'handle_followups', 'slow_down'],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
]

function writeLocalSessions(records: SessionRecord[]): void {
  try {
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(records))
  } catch {
    // Ignore storage access errors
  }
}

export function loadUserTargets(): UserTargets {
  try {
    const raw = localStorage.getItem(TARGETS_STORAGE_KEY)
    if (!raw) return DEFAULT_USER_TARGETS
    const parsed = JSON.parse(raw) as Partial<UserTargets>
    return {
      wpmMin: parsed.wpmMin ?? DEFAULT_USER_TARGETS.wpmMin,
      wpmMax: parsed.wpmMax ?? DEFAULT_USER_TARGETS.wpmMax,
      maxFillers: parsed.maxFillers ?? DEFAULT_USER_TARGETS.maxFillers,
      weeklySessions: parsed.weeklySessions ?? DEFAULT_USER_TARGETS.weeklySessions,
    }
  } catch {
    return DEFAULT_USER_TARGETS
  }
}

export function saveUserTargets(targets: UserTargets): void {
  try {
    localStorage.setItem(TARGETS_STORAGE_KEY, JSON.stringify(targets))
  } catch {
    // Ignore
  }
}

export async function fetchAllSessions(userId?: string): Promise<SessionRecord[]> {
  const local = loadRecordedSessions()

  if (supabase && userId && !userId.startsWith('demo-')) {
    const { data: sessionRows, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40)

    if (!error && sessionRows && sessionRows.length > 0) {
      const ids = sessionRows.map((r) => String(r.id))
      const { data: flagRows } = await supabase
        .from('flagged_moments')
        .select('*')
        .in('session_id', ids)
        .order('timestamp_seconds', { ascending: true })

      const flagsBySession = new Map<string, FlaggedMoment[]>()
      for (const row of flagRows ?? []) {
        const sid = String(row.session_id)
        const list = flagsBySession.get(sid) ?? []
        list.push({
          id: String(row.id),
          timestampSeconds: Number(row.timestamp_seconds ?? 0),
          momentType: row.moment_type,
          label: String(row.label ?? ''),
          transcriptExcerpt: row.transcript_excerpt ?? undefined,
          aiTip: row.ai_tip ?? undefined,
          recoverySuccessful:
            typeof row.recovery_successful === 'boolean' ? row.recovery_successful : undefined,
        })
        flagsBySession.set(sid, list)
      }

      const mapped: SessionRecord[] = sessionRows.map((row) => ({
        id: String(row.id),
        setupId: row.setup_id ?? undefined,
        title: String(row.title ?? 'VR Session'),
        practiceType: (row.practice_type ?? 'presentation') as PracticeType,
        venue: 'lecture_hall' as VenueType,
        coachedMode: Boolean(row.coached_mode),
        hintUsed: Boolean(row.hint_used),
        durationSeconds: Number(row.duration_seconds ?? 0),
        timeLimitMinutes: 15,
        wpm: Number(row.wpm ?? 135),
        fillerCount: Number(row.filler_count ?? 0),
        fillerBreakdown: (row.filler_breakdown as Record<string, number>) ?? {},
        eyeContactZones: (row.eye_contact_zones as {
          left: number
          centre: number
          right: number
        }) ?? { left: 25, centre: 50, right: 25 },
        topicsCovered: Number(row.topics_covered ?? 0),
        topicsTotal: Math.max(1, Number(row.topics_total ?? 1)),
        iCount: 0,
        weCount: 0,
        transcript: String(row.transcript ?? ''),
        recommendations: Array.isArray(row.recommendations)
          ? (row.recommendations as string[])
          : [],
        flaggedMoments: flagsBySession.get(String(row.id)) ?? [],
        goals: [],
        createdAt: String(row.created_at ?? new Date().toISOString()),
      }))

      // Merge any newer local sessions not yet in DB
      const merged = [
        ...mapped,
        ...local.filter((item) => !mapped.some((m) => m.id === item.id)),
      ]
      return merged
    }
  }

  if (local.length > 0) {
    // Combine real recorded sessions with starter samples for rich comparison/trends
    const combined = [
      ...local,
      ...SAMPLE_SESSION_RECORDS.filter((s) => !local.some((l) => l.id === s.id)),
    ]
    return combined
  }

  return SAMPLE_SESSION_RECORDS
}

export async function renameSessionRecord(
  userId: string | undefined,
  sessionId: string,
  newTitle: string,
  currentList: SessionRecord[],
): Promise<SessionRecord[]> {
  const trimmed = newTitle.trim()
  if (!trimmed) return currentList

  const updated = currentList.map((item) =>
    item.id === sessionId ? { ...item, title: trimmed } : item,
  )
  writeLocalSessions(updated)

  if (supabase && userId && !userId.startsWith('demo-') && UUID_REGEX.test(sessionId)) {
    await supabase
      .from('sessions')
      .update({ title: trimmed })
      .eq('id', sessionId)
      .eq('user_id', userId)
  }

  return updated
}

export async function deleteSessionRecord(
  userId: string | undefined,
  sessionId: string,
  currentList: SessionRecord[],
): Promise<SessionRecord[]> {
  const updated = currentList.filter((item) => item.id !== sessionId)
  writeLocalSessions(updated)

  if (supabase && userId && !userId.startsWith('demo-') && UUID_REGEX.test(sessionId)) {
    await supabase.from('sessions').delete().eq('id', sessionId).eq('user_id', userId)
  }

  return updated
}

export async function deleteAllRecordings(userId: string | undefined): Promise<void> {
  writeLocalSessions([])
  if (supabase && userId && !userId.startsWith('demo-')) {
    await supabase.from('sessions').delete().eq('user_id', userId)
  }
}

export function isTargetHittingSession(record: SessionRecord, targets: UserTargets): boolean {
  const wpmOk = record.wpm >= targets.wpmMin && record.wpm <= targets.wpmMax
  const fillersOk = record.fillerCount <= targets.maxFillers
  const topicsOk =
    record.topicsTotal === 0 || record.topicsCovered / record.topicsTotal >= 0.8
  return wpmOk && fillersOk && topicsOk
}

export function hasTwoConsecutiveTargetHits(
  sessions: SessionRecord[],
  targets: UserTargets,
): boolean {
  if (sessions.length < 2) return false
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  return (
    isTargetHittingSession(sorted[0], targets) && isTargetHittingSession(sorted[1], targets)
  )
}

export function buildSetupFromRecord(
  record: SessionRecord,
  raiseDifficulty = false,
): SessionSetup {
  const behaviour: AudienceBehaviour = raiseDifficulty ? 'challenging' : 'attentive'
  const interruptionLevel: InterruptionLevel = raiseDifficulty ? 'high' : 'medium'

  const topicCount = Math.max(1, record.topicsTotal)
  const topics = Array.from({ length: topicCount }, (_, idx) => ({
    id: `topic-retry-${idx + 1}`,
    title:
      idx === 0
        ? record.title
        : `Section ${idx + 1} — ${record.title.slice(0, 28)}`,
    brief: idx === 0,
  }))

  return {
    id: record.setupId ?? `setup-from-${record.id}`,
    title: record.title,
    practiceType: record.practiceType,
    venue: record.venue,
    audienceBehaviour: behaviour,
    interruptionLevel,
    followUps: true,
    questionsAtEnd: record.practiceType !== 'interview',
    unexpectedQuestions: raiseDifficulty,
    timeLimitMinutes: record.timeLimitMinutes || 10,
    oneMinWarning: true,
    coachedMode: raiseDifficulty ? false : record.coachedMode,
    goals: record.goals,
    topics,
  }
}

export function downloadUserDataExport(
  profile: UserProfile,
  savedSetups: SessionSetup[],
  sessions: SessionRecord[],
): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    profile,
    savedSetups,
    sessions,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stagera-data-export-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

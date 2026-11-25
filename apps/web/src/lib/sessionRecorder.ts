import { supabase } from './supabase'
import type {
  AppLanguage,
  FlaggedMoment,
  GazeZones,
  SessionRecord,
  SessionSetup,
} from '../types/stagera'

const LOCAL_SESSIONS_KEY = 'stagera_recorded_sessions_v1'
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface BuildSessionRecordInput {
  sessionId: string
  setup: SessionSetup
  language: AppLanguage
  durationSeconds: number
  wpm: number
  fillerCount: number
  fillerBreakdown: Record<string, number>
  eyeContactZones: GazeZones
  topicsCovered: number
  topicsTotal: number
  iCount: number
  weCount: number
  hintUsed: boolean
  transcript: string
  flaggedMoments: FlaggedMoment[]
}

export function generateRecommendations(
  input: BuildSessionRecordInput,
): string[] {
  const recs: string[] = []
  const isFr = input.language === 'fr'

  if (input.wpm > 160) {
    recs.push(
      isFr
        ? `Votre débit moyen (${input.wpm} m/min) était rapide. Visez 120–150 m/min en marquant une pause d’une seconde entre chaque idée clé.`
        : `Your average pace (${input.wpm} WPM) ran fast. Aim for 120–150 WPM by adding a 1-second pause after key points.`,
    )
  } else if (input.wpm > 0 && input.wpm < 110) {
    recs.push(
      isFr
        ? `Votre débit (${input.wpm} m/min) était un peu lent. Dynamisez vos transitions pour rester entre 120 et 150 m/min.`
        : `Your pace (${input.wpm} WPM) was slightly slow. Tighten transitions to stay in the energetic 120–150 WPM range.`,
    )
  } else {
    recs.push(
      isFr
        ? `Bon rythme vocal (${input.wpm || 135} m/min). Maintenez cette cadence régulière lors des relances.`
        : `Strong speaking cadence (${input.wpm || 135} WPM). Keep this steady rhythm even during follow-up questions.`,
    )
  }

  if (input.fillerCount > 3) {
    const topWord = Object.entries(input.fillerBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0]
    recs.push(
      isFr
        ? `Vous avez utilisé ${input.fillerCount} tics de langage${topWord ? ` (surtout « ${topWord} »)` : ''}. Remplacez-les par un court silence.`
        : `You used ${input.fillerCount} filler words${topWord ? ` (most often "${topWord}")` : ''}. Replace them with a clean silent breath.`,
    )
  } else {
    recs.push(
      isFr
        ? `Très peu de tics de langage (${input.fillerCount}). Vos phrases restent nettes et faciles à suivre.`
        : `Low filler count (${input.fillerCount}). Your phrasing stayed crisp and easy for the audience to follow.`,
    )
  }

  const { left, centre, right } = input.eyeContactZones
  if (left < 15 || right < 15) {
    recs.push(
      isFr
        ? `Équilibrez davantage votre contact visuel (Gauche ${left}%, Centre ${centre}%, Droite ${right}%) en balayant les côtés de la salle.`
        : `Balance eye contact across the room (Left ${left}%, Centre ${centre}%, Right ${right}%) by sweeping both side zones.`,
    )
  } else {
    recs.push(
      isFr
        ? `Bonne répartition du regard dans la salle (Gauche ${left}%, Centre ${centre}%, Droite ${right}%).`
        : `Well-balanced room gaze distribution (Left ${left}%, Centre ${centre}%, Right ${right}%).`,
    )
  }

  if (input.setup.practiceType === 'interview' && input.weCount > input.iCount) {
    recs.push(
      isFr
        ? `Vous avez dit « nous » (${input.weCount}) plus souvent que « je » (${input.iCount}). Mettez en avant votre contribution personnelle.`
        : `You used "we" (${input.weCount}) more than "I" (${input.iCount}). Highlight your personal ownership with "I" statements.`,
    )
  }

  if (input.topicsCovered < input.topicsTotal) {
    recs.push(
      isFr
        ? `Vous avez couvert ${input.topicsCovered}/${input.topicsTotal} sujets prévus. Gardez un œil sur le panneau privé pour ne rien sauter.`
        : `You covered ${input.topicsCovered}/${input.topicsTotal} planned topics. Glance at the private outline to cover every section.`,
    )
  }

  return recs.slice(0, 4)
}

export function buildSessionRecord(input: BuildSessionRecordInput): SessionRecord {
  return {
    id: input.sessionId,
    setupId: input.setup.id,
    title: input.setup.title,
    practiceType: input.setup.practiceType,
    venue: input.setup.venue,
    coachedMode: input.setup.coachedMode,
    hintUsed: input.hintUsed,
    durationSeconds: input.durationSeconds,
    timeLimitMinutes: input.setup.timeLimitMinutes,
    wpm: input.wpm,
    fillerCount: input.fillerCount,
    fillerBreakdown: input.fillerBreakdown,
    eyeContactZones: input.eyeContactZones,
    topicsCovered: input.topicsCovered,
    topicsTotal: input.topicsTotal,
    iCount: input.iCount,
    weCount: input.weCount,
    transcript: input.transcript,
    recommendations: generateRecommendations(input),
    flaggedMoments: input.flaggedMoments,
    goals: input.setup.goals,
    createdAt: new Date().toISOString(),
  }
}

export function loadRecordedSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SessionRecord[]) : []
  } catch {
    return []
  }
}

function writeLocalSession(record: SessionRecord): void {
  try {
    const existing = loadRecordedSessions()
    const next = [record, ...existing.filter((item) => item.id !== record.id)].slice(0, 50)
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage errors
  }
}

export async function saveSessionSnapshot(
  userId: string,
  record: SessionRecord,
): Promise<void> {
  writeLocalSession(record)

  if (!supabase || userId.startsWith('demo-') || !UUID_REGEX.test(record.id)) {
    return
  }

  const setupId = record.setupId && UUID_REGEX.test(record.setupId) ? record.setupId : null

  const { error } = await supabase.from('sessions').upsert({
    id: record.id,
    user_id: userId,
    setup_id: setupId,
    title: record.title,
    practice_type: record.practiceType,
    coached_mode: record.coachedMode,
    hint_used: record.hintUsed,
    duration_seconds: record.durationSeconds,
    wpm: record.wpm,
    filler_count: record.fillerCount,
    filler_breakdown: record.fillerBreakdown,
    eye_contact_zones: record.eyeContactZones,
    topics_covered: record.topicsCovered,
    topics_total: record.topicsTotal,
    transcript: record.transcript,
    recommendations: record.recommendations,
  })

  if (!error && record.flaggedMoments.length > 0) {
    await supabase.from('flagged_moments').upsert(
      record.flaggedMoments.map((m) => ({
        id: UUID_REGEX.test(m.id) ? m.id : crypto.randomUUID(),
        session_id: record.id,
        user_id: userId,
        timestamp_seconds: m.timestampSeconds,
        moment_type: m.momentType,
        label: m.label,
        transcript_excerpt: m.transcriptExcerpt ?? null,
        ai_tip: m.aiTip ?? null,
        recovery_successful: m.recoverySuccessful ?? null,
      })),
    )
  }
}

export function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session-${Date.now().toString(36)}`
}

export class OptionalAudioRecorder {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private ownsStream = false
  private chunks: Blob[] = []

  async start(existingStream?: MediaStream | null): Promise<boolean> {
    if (typeof MediaRecorder === 'undefined') {
      return false
    }
    try {
      let stream = existingStream && existingStream.active ? existingStream : null
      this.ownsStream = false

      if (!stream) {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          return false
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        this.ownsStream = true
      }

      this.stream = stream
      const recorder = new MediaRecorder(stream)
      this.chunks = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data)
      }
      recorder.start(30000) // 30s timeslice for auto-save chunks (NFR-08)
      this.recorder = recorder
      return true
    } catch {
      return false
    }
  }

  stop(): Blob | null {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        // Ignore
      }
    }
    if (this.stream && this.ownsStream) {
      this.stream.getTracks().forEach((t) => t.stop())
    }
    this.stream = null
    this.ownsStream = false
    this.recorder = null
    if (this.chunks.length === 0) return null
    return new Blob(this.chunks, { type: 'audio/webm' })
  }
}

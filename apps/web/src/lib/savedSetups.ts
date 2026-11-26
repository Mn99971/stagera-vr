import { STARTER_SAVED_SETUPS } from './auth'
import { supabase } from './supabase'
import type {
  AudienceBehaviour,
  InterruptionLevel,
  InterviewContext,
  PracticeType,
  SessionSetup,
  Topic,
  VenueType,
} from '../types/stagera'

const LOCAL_SETUPS_KEY = 'stagera_saved_setups_v1'

interface SavedSetupRow {
  id: string
  user_id: string
  title: string
  practice_type: PracticeType
  venue: VenueType
  audience_behaviour: AudienceBehaviour
  interruption_level: InterruptionLevel
  follow_ups: boolean
  questions_at_end: boolean
  unexpected_questions: boolean
  time_limit_minutes: number
  one_min_warning: boolean
  coached_mode: boolean
  session_goals: string[] | null
  topics: Topic[] | null
  interview_context?: InterviewContext | null
}

function mapRowToSetup(row: SavedSetupRow, localFallback?: SessionSetup): SessionSetup {
  return {
    id: row.id,
    title: row.title,
    practiceType: row.practice_type,
    venue: row.venue,
    audienceBehaviour: row.audience_behaviour,
    interruptionLevel: row.interruption_level,
    followUps: row.follow_ups,
    questionsAtEnd: row.questions_at_end,
    unexpectedQuestions: row.unexpected_questions,
    timeLimitMinutes: row.time_limit_minutes,
    oneMinWarning: row.one_min_warning,
    coachedMode: row.coached_mode,
    goals: row.session_goals ?? [],
    topics: Array.isArray(row.topics) ? row.topics : [],
    interviewContext: row.interview_context ?? localFallback?.interviewContext,
  }
}

function readLocalSetups(): SessionSetup[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_SETUPS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SessionSetup[]) : null
  } catch {
    return null
  }
}

function writeLocalSetups(setups: SessionSetup[]): void {
  try {
    localStorage.setItem(LOCAL_SETUPS_KEY, JSON.stringify(setups))
  } catch {
    // Ignore storage access errors in restricted contexts
  }
}

export async function loadSavedSetups(userId: string): Promise<SessionSetup[]> {
  const local = readLocalSetups()

  if (supabase && !userId.startsWith('demo-')) {
    const { data, error } = await supabase
      .from('saved_setups')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (!error && data && data.length > 0) {
      const localById = new Map((local ?? []).map((s) => [s.id, s]))
      const mapped = (data as SavedSetupRow[]).map((row) =>
        mapRowToSetup(row, localById.get(row.id)),
      )
      writeLocalSetups(mapped)
      return mapped
    }
  }

  if (local && local.length > 0) {
    return local
  }
  return STARTER_SAVED_SETUPS
}

export async function persistSavedSetup(
  userId: string,
  setup: SessionSetup,
): Promise<SessionSetup> {
  let savedSetup: SessionSetup = {
    ...setup,
    id: setup.id ?? `setup-${Date.now().toString(36)}`,
  }

  if (supabase && !userId.startsWith('demo-')) {
    const baseRow = {
      user_id: userId,
      title: setup.title,
      practice_type: setup.practiceType,
      venue: setup.venue,
      audience_behaviour: setup.audienceBehaviour,
      interruption_level: setup.interruptionLevel,
      follow_ups: setup.followUps,
      questions_at_end: setup.questionsAtEnd,
      unexpected_questions: setup.unexpectedQuestions,
      time_limit_minutes: setup.timeLimitMinutes,
      one_min_warning: setup.oneMinWarning,
      coached_mode: setup.coachedMode,
      session_goals: setup.goals,
      topics: setup.topics,
    }

    // Try inserting with interview_context first (migration 0002), fall back cleanly to 0001 schema
    const withContext = setup.interviewContext
      ? await supabase
          .from('saved_setups')
          .insert({ ...baseRow, interview_context: setup.interviewContext })
          .select('*')
          .single()
      : null

    if (withContext && !withContext.error && withContext.data) {
      savedSetup = mapRowToSetup(withContext.data as SavedSetupRow, setup)
    } else {
      const { data, error } = await supabase
        .from('saved_setups')
        .insert(baseRow)
        .select('*')
        .single()

      if (!error && data) {
        savedSetup = mapRowToSetup(data as SavedSetupRow, setup)
      }
    }
  }

  const existing = readLocalSetups() ?? STARTER_SAVED_SETUPS
  const next = [savedSetup, ...existing.filter((item) => item.id !== savedSetup.id)]
  writeLocalSetups(next)

  return savedSetup
}

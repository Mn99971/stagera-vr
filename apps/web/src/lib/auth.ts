import { supabase } from './supabase'
import type {
  AppLanguage,
  SessionSetup,
  SessionSummary,
  UserProfile,
  WeeklyStats,
} from '../types/stagera'

const DEMO_PROFILE_KEY = 'stagera_demo_profile_v1'
const DEMO_AUTH_KEY = 'stagera_demo_authenticated_v1'
const LANG_STORAGE_KEY = 'stagera_app_language_v1'

export const isDemoMode = supabase === null

export interface AuthResult {
  userId: string
  email: string
  fullName: string
  hasProfile: boolean
  profile?: UserProfile
}

export function getStoredLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    if (saved === 'fr' || saved === 'en') return saved
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return 'en'
}

export function setStoredLanguage(lang: AppLanguage): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    // Ignore storage access errors
  }
}

function readDemoProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(DEMO_PROFILE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UserProfile
  } catch {
    return null
  }
}

function writeDemoProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(profile))
    localStorage.setItem(DEMO_AUTH_KEY, 'true')
  } catch {
    // Ignore storage access errors
  }
}

export async function restoreSession(): Promise<AuthResult | null> {
  if (supabase) {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session?.user) return null
    const user = data.session.user
    const profile = await fetchProfile(user.id, user.email ?? '')
    return {
      userId: user.id,
      email: user.email ?? '',
      fullName:
        profile?.fullName ||
        (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''),
      hasProfile: Boolean(profile),
      profile: profile ?? undefined,
    }
  }

  try {
    if (localStorage.getItem(DEMO_AUTH_KEY) !== 'true') return null
  } catch {
    return null
  }
  const demo = readDemoProfile()
  if (!demo) return null
  return {
    userId: demo.id,
    email: demo.email,
    fullName: demo.fullName,
    hasProfile: true,
    profile: demo,
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string,
): Promise<AuthResult> {
  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw new Error(error.message)
    const user = data.user
    if (!user) throw new Error('Account created. Please check your email to confirm.')
    return {
      userId: user.id,
      email: user.email ?? email,
      fullName,
      hasProfile: false,
    }
  }

  // Local demo-mode fallback when .env.local keys are not configured
  const userId = `demo-${Date.now()}`
  return {
    userId,
    email,
    fullName,
    hasProfile: false,
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const user = data.user
    const profile = await fetchProfile(user.id, user.email ?? email)
    return {
      userId: user.id,
      email: user.email ?? email,
      fullName:
        profile?.fullName ||
        (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''),
      hasProfile: Boolean(profile),
      profile: profile ?? undefined,
    }
  }

  const existing = readDemoProfile()
  if (existing && existing.email.toLowerCase() === email.toLowerCase()) {
    try {
      localStorage.setItem(DEMO_AUTH_KEY, 'true')
    } catch {
      // Ignore
    }
    return {
      userId: existing.id,
      email: existing.email,
      fullName: existing.fullName,
      hasProfile: true,
      profile: existing,
    }
  }

  // Create a ready-to-explore demo profile on log in
  const inferredName = email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const demoProfile: UserProfile = {
    id: 'demo-user-1',
    email,
    fullName: inferredName || 'Alex Rivera',
    role: 'student',
    field: 'Computer Science',
    practiceGoals: ['steady_pace', 'reduce_fillers', 'eye_contact'],
    difficulties: ['speaking_fast', 'filler_words'],
    appLanguage: getStoredLanguage(),
    keepRecordings: true,
    autoDelete30d: false,
    captionsEnabled: true,
    isDemo: true,
  }
  writeDemoProfile(demoProfile)
  return {
    userId: demoProfile.id,
    email: demoProfile.email,
    fullName: demoProfile.fullName,
    hasProfile: true,
    profile: demoProfile,
  }
}

export async function signInWithGoogle(isNewAccount: boolean): Promise<AuthResult | null> {
  if (supabase) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw new Error(error.message)
    // Browser redirects to Google OAuth
    return null
  }

  const existing = readDemoProfile()
  if (!isNewAccount && existing) {
    try {
      localStorage.setItem(DEMO_AUTH_KEY, 'true')
    } catch {
      // Ignore
    }
    return {
      userId: existing.id,
      email: existing.email,
      fullName: existing.fullName,
      hasProfile: true,
      profile: existing,
    }
  }

  if (isNewAccount) {
    return {
      userId: `demo-google-${Date.now()}`,
      email: 'alex.rivera@gmail.com',
      fullName: 'Alex Rivera',
      hasProfile: false,
    }
  }

  const demoProfile: UserProfile = {
    id: 'demo-google-user',
    email: 'alex.rivera@gmail.com',
    fullName: 'Alex Rivera',
    role: 'professional',
    field: 'Product Design',
    practiceGoals: ['steady_pace', 'handle_qa'],
    difficulties: ['nervousness', 'interruptions'],
    appLanguage: getStoredLanguage(),
    keepRecordings: true,
    autoDelete30d: false,
    captionsEnabled: true,
    isDemo: true,
  }
  writeDemoProfile(demoProfile)
  return {
    userId: demoProfile.id,
    email: demoProfile.email,
    fullName: demoProfile.fullName,
    hasProfile: true,
    profile: demoProfile,
  }
}

export async function signOutUser(): Promise<void> {
  if (supabase) {
    await supabase.auth.signOut()
  }
  try {
    localStorage.removeItem(DEMO_AUTH_KEY)
  } catch {
    // Ignore
  }
}

export async function fetchProfile(userId: string, email: string): Promise<UserProfile | null> {
  if (!supabase) {
    return readDemoProfile()
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null

  return {
    id: data.id,
    email,
    fullName: data.full_name ?? '',
    role: data.role ?? 'student',
    field: data.field ?? '',
    practiceGoals: Array.isArray(data.practice_goals) ? data.practice_goals : [],
    difficulties: Array.isArray(data.difficulties) ? data.difficulties : [],
    appLanguage: data.app_language === 'fr' ? 'fr' : 'en',
    keepRecordings: Boolean(data.keep_recordings ?? true),
    autoDelete30d: Boolean(data.auto_delete_30d ?? false),
    captionsEnabled: Boolean(data.captions_enabled ?? true),
    isDemo: false,
  }
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  setStoredLanguage(profile.appLanguage)

  if (supabase) {
    const { error } = await supabase.from('profiles').upsert({
      id: profile.id,
      full_name: profile.fullName,
      role: profile.role,
      field: profile.field || null,
      practice_goals: profile.practiceGoals,
      difficulties: profile.difficulties,
      app_language: profile.appLanguage,
      keep_recordings: profile.keepRecordings,
      auto_delete_30d: profile.autoDelete30d,
      captions_enabled: profile.captionsEnabled,
    })
    if (error) throw new Error(error.message)
    return { ...profile, isDemo: false }
  }

  const saved = { ...profile, isDemo: true }
  writeDemoProfile(saved)
  return saved
}

export const STARTER_SAVED_SETUPS: SessionSetup[] = [
  {
    id: 'setup-capstone',
    title: 'Capstone Pitch — Final Defense',
    practiceType: 'pitch',
    venue: 'lecture_hall',
    audienceBehaviour: 'attentive',
    interruptionLevel: 'low',
    followUps: true,
    questionsAtEnd: true,
    unexpectedQuestions: false,
    timeLimitMinutes: 10,
    oneMinWarning: true,
    coachedMode: true,
    goals: ['steady_pace', 'eye_contact'],
    topics: [
      { id: 't1', title: 'Problem & User Research', slideRange: '1–3', brief: false },
      { id: 't2', title: 'WebXR Architecture', slideRange: '4–6', brief: false },
      { id: 't3', title: 'Live Demo & Metrics', slideRange: '7–9', brief: false },
    ],
  },
  {
    id: 'setup-interview',
    title: 'Senior Product Engineer Interview',
    practiceType: 'interview',
    venue: 'interview_room',
    audienceBehaviour: 'challenging',
    interruptionLevel: 'medium',
    followUps: true,
    questionsAtEnd: true,
    unexpectedQuestions: true,
    timeLimitMinutes: 15,
    oneMinWarning: true,
    coachedMode: false,
    goals: ['par_structure', 'handle_qa'],
    topics: [
      { id: 't4', title: 'System Design Tradeoffs', brief: false },
      { id: 't5', title: 'Conflict Resolution (PAR)', brief: false },
    ],
  },
]

export const STARTER_SESSIONS: SessionSummary[] = [
  {
    id: 'sess-1',
    title: 'Capstone Pitch — Dry Run #2',
    practiceType: 'pitch',
    venue: 'lecture_hall',
    durationSeconds: 562,
    wpm: 138,
    fillerCount: 6,
    eyeContactPct: 78,
    topicsCovered: 3,
    topicsTotal: 3,
    createdAt: '2026-11-22T16:30:00Z',
    coachedMode: true,
  },
  {
    id: 'sess-2',
    title: 'Behavioral Interview Practice',
    practiceType: 'interview',
    venue: 'interview_room',
    durationSeconds: 780,
    wpm: 146,
    fillerCount: 9,
    eyeContactPct: 84,
    topicsCovered: 4,
    topicsTotal: 4,
    createdAt: '2026-11-20T11:15:00Z',
    coachedMode: false,
  },
]

export const STARTER_WEEKLY_STATS: WeeklyStats = {
  sessionsThisWeek: 3,
  totalMinutes: 34,
  avgWpm: 141,
  targetSessions: 4,
}

export type PracticeType = 'presentation' | 'interview' | 'pitch' | 'panel'
export type VenueType = 'classroom' | 'lecture_hall' | 'auditorium' | 'interview_room' | 'panel_room'
export type AudienceBehaviour = 'supportive' | 'attentive' | 'distracted' | 'challenging'
export type InterruptionLevel = 'none' | 'low' | 'medium' | 'high'
export type AppLanguage = 'en' | 'fr'
export type UserRole = 'student' | 'lecturer' | 'job_seeker' | 'professional'
export type CompanionScreen =
  | 'welcome'
  | 'auth'
  | 'profile_setup'
  | 'home'
  | 'new_session'
  | 'connect_headset'
export type AuthMode = 'signup' | 'login'
export type DashboardTab = 'home' | 'history' | 'progress' | 'settings'

export interface Topic {
  id: string
  title: string
  slideRange?: string
  brief: boolean
  covered?: boolean
}

export interface UploadedMaterialFile {
  id: string
  name: string
  sizeBytes: number
  extension: string
  extractedText?: string
  estimatedSlides?: number
}

export interface InterviewDetails {
  jobTitle: string
  jobDescription: string
  projectSummary: string
  cvFile: UploadedMaterialFile | null
}

export interface InterviewContext {
  jobTitle?: string
  jobDescription?: string
  projectSummary?: string
  cvFileName?: string
  cvText?: string
  cvHighlights?: string[]
}

export interface InterviewTurn {
  id: string
  role: 'interviewer' | 'candidate'
  speakerLabel: string
  speakerIndex?: number
  text: string
  timestampSeconds: number
  isFollowUp?: boolean
  coachingNote?: string
}

export interface SessionSetup {
  id?: string
  title: string
  practiceType: PracticeType
  venue: VenueType
  audienceBehaviour: AudienceBehaviour
  interruptionLevel: InterruptionLevel
  followUps: boolean
  questionsAtEnd: boolean
  unexpectedQuestions: boolean
  timeLimitMinutes: number
  oneMinWarning: boolean
  coachedMode: boolean
  goals: string[]
  topics: Topic[]
  interviewContext?: InterviewContext
}

export interface UserProfile {
  id: string
  email: string
  fullName: string
  role: UserRole
  field: string
  practiceGoals: string[]
  difficulties: string[]
  appLanguage: AppLanguage
  keepRecordings: boolean
  autoDelete30d: boolean
  captionsEnabled: boolean
  isDemo?: boolean
}

export interface SessionSummary {
  id: string
  title: string
  practiceType: PracticeType
  venue: VenueType
  durationSeconds: number
  wpm: number
  fillerCount: number
  eyeContactPct: number
  topicsCovered: number
  topicsTotal: number
  createdAt: string
  coachedMode: boolean
}

export interface WeeklyStats {
  sessionsThisWeek: number
  totalMinutes: number
  avgWpm: number
  targetSessions: number
}

export interface GazeZones {
  left: number
  centre: number
  right: number
}

export type FlaggedMomentType =
  | 'question'
  | 'skipped_slide'
  | 'long_pause'
  | 'pace_spike'
  | 'hint_used'
  | 'we_ownership'

export interface FlaggedMoment {
  id: string
  timestampSeconds: number
  momentType: FlaggedMomentType
  label: string
  transcriptExcerpt?: string
  aiTip?: string
  slideIndex?: number
  recoverySuccessful?: boolean
}

export interface AIGoalFeedbackItem {
  goal: string
  status: 'Strong' | 'Improving' | 'Needs work'
  note: string
}

export interface AIFlaggedMomentItem {
  timestamp: string
  title: string
  detail: string
  aiTip: string
}

export interface SessionAIFeedback {
  overallScore?: number
  executiveSummary?: string
  strengths?: string[]
  areasToImprove?: string[]
  quickTip: string
  topRecommendations: string[]
  goalFeedback: AIGoalFeedbackItem[]
  flaggedMoments: AIFlaggedMomentItem[]
}

export interface SessionRecord {
  id: string
  setupId?: string
  title: string
  practiceType: PracticeType
  venue: VenueType
  coachedMode: boolean
  hintUsed: boolean
  durationSeconds: number
  timeLimitMinutes: number
  wpm: number
  fillerCount: number
  fillerBreakdown: Record<string, number>
  eyeContactZones: GazeZones
  topicsCovered: number
  topicsTotal: number
  iCount: number
  weCount: number
  transcript: string
  qaTranscript?: InterviewTurn[]
  recommendations: string[]
  flaggedMoments: FlaggedMoment[]
  goals: string[]
  aiFeedback?: SessionAIFeedback
  createdAt: string
}

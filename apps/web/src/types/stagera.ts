export type PracticeType = 'presentation' | 'interview' | 'pitch' | 'panel'
export type VenueType = 'classroom' | 'lecture_hall' | 'auditorium' | 'interview_room' | 'panel_room'
export type AudienceBehaviour = 'supportive' | 'attentive' | 'distracted' | 'challenging'
export type InterruptionLevel = 'none' | 'low' | 'medium' | 'high'

export interface Topic {
  id: string
  title: string
  slideRange?: string
  brief: boolean
  covered?: boolean
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
}

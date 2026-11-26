import type { QAQuestion } from './qaEngine'
import type {
  AppLanguage,
  InterviewTurn,
  SessionSetup,
  Topic,
} from '../types/stagera'

/**
 * Returns true strictly for Single Interview & Panel Interview modes.
 * Presentation, Classroom, Lecture Hall, Auditorium, and Pitch remain presenter-led.
 */
export function isInterviewDrivenSession(setup: SessionSetup): boolean {
  return (
    setup.practiceType === 'interview' ||
    setup.venue === 'interview_room' ||
    setup.venue === 'panel_room'
  )
}

export interface DynamicInterviewTurnResult {
  question: QAQuestion
  speakerIndex: number
  acknowledgement: string
  coachingNote: string
  source: 'deepseek' | 'fallback'
}

interface InterviewApiResponse {
  speakerIndex?: number
  speakerLabel?: string
  acknowledgement?: string
  question?: string
  isFollowUp?: boolean
  topicMatched?: string
  coachingNote?: string
  source?: 'deepseek' | 'fallback'
}

const LOCAL_PANELISTS = {
  en: ['Hiring Manager', 'Technical Lead', 'Team Partner'],
  fr: ['Responsable recrutement', 'Lead technique', 'Partenaire produit'],
} as const

function buildClientFallback(params: {
  action: 'opening' | 'respond'
  setup: SessionSetup
  topics: Topic[]
  language: AppLanguage
  questionCount: number
  lastPanelistIndex?: number
  latestCandidateAnswer?: string
  slideIndex: number
}): DynamicInterviewTurnResult {
  const {
    action,
    setup,
    topics,
    language,
    questionCount,
    lastPanelistIndex,
    latestCandidateAnswer = '',
    slideIndex,
  } = params

  const isPanel = setup.venue === 'panel_room'
  const ctx = setup.interviewContext
  const role = ctx?.jobTitle || setup.title
  const cvHint = ctx?.cvHighlights?.[0] ?? ''
  const isFollowUp = action === 'respond' && setup.followUps && latestCandidateAnswer.trim().length > 15 && questionCount % 2 === 1
  const speakerIndex = isPanel
    ? action === 'opening'
      ? 0
      : isFollowUp
        ? lastPanelistIndex ?? 0
        : ((lastPanelistIndex ?? 0) + 1) % 3
    : 0
  const speakerLabel = isPanel
    ? LOCAL_PANELISTS[language][speakerIndex]
    : language === 'fr'
      ? 'Recruteur'
      : 'Interviewer'

  const topicTitle = topics[questionCount % Math.max(1, topics.length)]?.title ?? role
  const trimmedAnswer = latestCandidateAnswer.trim()

  let acknowledgement = ''
  let questionText = ''

  if (action === 'opening') {
    questionText =
      language === 'fr'
        ? cvHint
          ? `Bonjour et bienvenue pour ${role}. Sur votre CV, « ${cvHint} » a retenu notre attention — pouvez-vous vous présenter et nous en dire plus sur ce projet ?`
          : `Bonjour et bienvenue pour ${role}. Pour commencer, pouvez-vous vous présenter et expliquer ce qui vous motive pour ce poste ?`
        : cvHint
          ? `Welcome, and thanks for joining us for ${role}. Looking at your CV, "${cvHint}" stood out — could you introduce yourself and tell us more about that experience?`
          : `Welcome, and thanks for speaking with us about ${role}. To get started, could you walk us through your background and what excites you about this role?`
  } else {
    acknowledgement =
      language === 'fr' ? 'Merci pour cette réponse.' : 'Thanks for sharing that.'
    const words = trimmedAnswer.split(/\s+/).filter((w) => w.length >= 5)
    const keyword = words.find(
      (w) => !/^(about|there|their|which|would|could|should|really|these|those|where|project|working)$/i.test(w),
    )?.replace(/[^a-zA-Z0-9\u00C0-\u017F+-]/g, '')

    if (isFollowUp && keyword) {
      questionText =
        language === 'fr'
          ? `Vous avez évoqué « ${keyword} » — quelle a été votre contribution personnelle exacte et quel résultat mesurable avez-vous obtenu ?`
          : `You mentioned "${keyword}" — what was your specific personal contribution there, and what measurable outcome did you drive?`
    } else if (cvHint && questionCount <= 2) {
      questionText =
        language === 'fr'
          ? `En lien avec votre CV (« ${cvHint} »), quel a été l’arbitrage le plus difficile que vous avez dû trancher ?`
          : `Connecting back to your CV ("${cvHint}"), what was the hardest trade-off you had to make, and how did you decide?`
    } else {
      questionText =
        language === 'fr'
          ? `Concernant « ${topicTitle} », pouvez-vous donner un exemple concret avec le problème, votre action et le résultat ?`
          : `Looking at "${topicTitle}", could you walk through a concrete example covering the problem, your action, and the result?`
    }
  }

  const spokenText = acknowledgement ? `${acknowledgement} ${questionText}` : questionText

  return {
    question: {
      id: `int-${Date.now().toString(36)}-${questionCount}`,
      speakerLabel,
      text: spokenText,
      isFollowUp,
      topicTitle,
      slideIndex,
    },
    speakerIndex,
    acknowledgement,
    coachingNote:
      language === 'fr'
        ? 'Utilisez la structure Problème–Action–Résultat et mettez en avant votre rôle avec « je ».'
        : 'Use Problem–Action–Result structure and highlight personal ownership with "I" statements.',
    source: 'fallback',
  }
}

export async function requestNextInterviewQuestion(params: {
  action: 'opening' | 'respond'
  setup: SessionSetup
  topics: Topic[]
  language: AppLanguage
  questionCount: number
  lastPanelistIndex?: number
  latestCandidateAnswer?: string
  conversationHistory: InterviewTurn[]
  slideIndex: number
}): Promise<DynamicInterviewTurnResult> {
  const {
    action,
    setup,
    topics,
    language,
    questionCount,
    lastPanelistIndex,
    latestCandidateAnswer,
    conversationHistory,
    slideIndex,
  } = params

  const isPanel = setup.venue === 'panel_room'
  const fallback = buildClientFallback(params)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 9000)

  try {
    const resp = await fetch('/.netlify/functions/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        language,
        isPanel,
        interviewerStyle: setup.audienceBehaviour,
        followUpsEnabled: setup.followUps,
        sessionTitle: setup.title,
        topics: topics.map((t) => t.title),
        questionCount,
        lastPanelistIndex,
        latestCandidateAnswer,
        conversationHistory: conversationHistory.slice(-10).map((t) => ({
          role: t.role,
          speakerLabel: t.speakerLabel,
          speakerIndex: t.speakerIndex,
          text: t.text,
        })),
        interviewContext: setup.interviewContext,
      }),
      signal: controller.signal,
    })

    if (!resp.ok) return fallback
    const data = (await resp.json()) as InterviewApiResponse
    if (!data || typeof data.question !== 'string' || data.question.trim().length < 6) {
      return fallback
    }

    const ack = typeof data.acknowledgement === 'string' ? data.acknowledgement.trim() : ''
    const qText = data.question.trim()
    const fullText = ack && action === 'respond' ? `${ack} ${qText}` : qText
    const speakerIndex = isPanel
      ? Math.max(0, Math.min(2, Math.round(data.speakerIndex ?? fallback.speakerIndex)))
      : 0
    const speakerLabel =
      typeof data.speakerLabel === 'string' && data.speakerLabel.trim()
        ? data.speakerLabel.trim()
        : fallback.question.speakerLabel

    return {
      question: {
        id: `int-${Date.now().toString(36)}-${questionCount}`,
        speakerLabel,
        text: fullText,
        isFollowUp: Boolean(data.isFollowUp),
        topicTitle:
          typeof data.topicMatched === 'string' && data.topicMatched.trim()
            ? data.topicMatched.trim()
            : fallback.question.topicTitle,
        slideIndex,
      },
      speakerIndex,
      acknowledgement: ack,
      coachingNote:
        typeof data.coachingNote === 'string' && data.coachingNote.trim()
          ? data.coachingNote.trim()
          : fallback.coachingNote,
      source: data.source === 'deepseek' ? 'deepseek' : 'fallback',
    }
  } catch {
    return fallback
  } finally {
    window.clearTimeout(timeout)
  }
}

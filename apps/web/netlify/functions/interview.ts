/**
 * Netlify Function: /.netlify/functions/interview
 *
 * DeepSeek-powered dynamic interviewer for Single Interview & Panel Interview modes.
 * Generates realistic opening questions, contextual follow-ups, and probing questions
 * grounded in:
 *  1) What the candidate actually just said (conversationHistory + latestCandidateAnswer)
 *  2) The configured interview role / job description / project summary
 *  3) Extracted text from the candidate's uploaded CV
 *
 * In Panel mode, rotates questions naturally across 3 distinct panelists (indices 0, 1, 2).
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

interface ConversationTurn {
  role: 'interviewer' | 'candidate'
  speakerLabel?: string
  speakerIndex?: number
  text: string
}

interface InterviewRequestPayload {
  action?: 'opening' | 'respond'
  language?: 'en' | 'fr'
  isPanel?: boolean
  interviewerStyle?: 'supportive' | 'attentive' | 'challenging' | 'distracted'
  followUpsEnabled?: boolean
  sessionTitle?: string
  topics?: string[]
  questionCount?: number
  lastPanelistIndex?: number
  latestCandidateAnswer?: string
  conversationHistory?: ConversationTurn[]
  interviewContext?: {
    jobTitle?: string
    jobDescription?: string
    projectSummary?: string
    cvFileName?: string
    cvText?: string
    cvHighlights?: string[]
  }
}

interface InterviewResponsePayload {
  speakerIndex: number
  speakerLabel: string
  acknowledgement: string
  question: string
  isFollowUp: boolean
  topicMatched: string
  coachingNote: string
  source: 'deepseek' | 'fallback'
}

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PANELISTS = {
  en: [
    { index: 0, label: 'Hiring Manager', focus: 'role fit, personal ownership, leadership, and career progression' },
    { index: 1, label: 'Technical Lead', focus: 'architecture, CV projects, technical depth, and engineering trade-offs' },
    { index: 2, label: 'Team Partner', focus: 'cross-functional collaboration, conflict resolution, and user/business outcomes' },
  ],
  fr: [
    { index: 0, label: 'Responsable recrutement', focus: 'adéquation au poste, impact personnel et parcours' },
    { index: 1, label: 'Lead technique', focus: 'architecture, projets du CV, profondeur technique et arbitrages' },
    { index: 2, label: 'Partenaire produit', focus: 'collaboration, alignement et résultats mesurables' },
  ],
} as const

function pickNextPanelistIndex(
  isPanel: boolean,
  action: 'opening' | 'respond',
  lastIdx: number | undefined,
  questionCount: number,
  isFollowUp: boolean,
): number {
  if (!isPanel) return 0
  if (action === 'opening') return 0
  const prev = typeof lastIdx === 'number' && lastIdx >= 0 && lastIdx <= 2 ? lastIdx : 0
  if (isFollowUp && questionCount % 2 === 1) {
    return prev
  }
  return (prev + 1) % 3
}

function extractKeywordSnippet(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const words = cleaned.split(' ').filter((w) => w.length >= 4)
  const interesting = words.find(
    (w) =>
      !/^(that|this|with|from|they|have|been|were|when|what|where|about|which|there|their|would|could|should|really|just|like|also|into|then|than|some|more|very|pour|avec|dans|nous|vous|mais|plus|tout|cette)$/i.test(
        w.replace(/[^a-zA-Z\u00C0-\u017F]/g, ''),
      ),
  )
  return (interesting ?? words[0] ?? '').replace(/[^a-zA-Z0-9\u00C0-\u017F+-]/g, '')
}

function buildFallbackTurn(p: InterviewRequestPayload): InterviewResponsePayload {
  const lang = p.language === 'fr' ? 'fr' : 'en'
  const isPanel = Boolean(p.isPanel)
  const action = p.action === 'opening' ? 'opening' : 'respond'
  const qCount = Math.max(0, Number(p.questionCount ?? 0))
  const ctx = p.interviewContext ?? {}
  const role = ctx.jobTitle?.trim() || p.sessionTitle?.trim() || (lang === 'fr' ? 'ce poste' : 'this role')
  const cvHighlight = ctx.cvHighlights?.[0] || ''
  const cvSnippet = cvHighlight || (ctx.cvText ? ctx.cvText.split(/\r?\n/).find((l) => l.trim().length > 18)?.trim().slice(0, 90) ?? '' : '')
  const project = ctx.projectSummary?.trim().slice(0, 90) || ''
  const latestAnswer = (p.latestCandidateAnswer ?? '').trim()
  const answerKeyword = extractKeywordSnippet(latestAnswer)
  const topics = Array.isArray(p.topics) && p.topics.length > 0 ? p.topics : [role]
  const activeTopic = topics[qCount % topics.length] ?? role

  const shouldFollowUp =
    action === 'respond' && Boolean(p.followUpsEnabled) && latestAnswer.length > 15 && qCount % 2 === 1
  const speakerIndex = pickNextPanelistIndex(isPanel, action, p.lastPanelistIndex, qCount, shouldFollowUp)
  const speakerLabel = isPanel
    ? PANELISTS[lang][speakerIndex].label
    : lang === 'fr'
      ? 'Recruteur'
      : 'Interviewer'

  if (action === 'opening') {
    const question =
      lang === 'fr'
        ? cvSnippet
          ? `Bonjour et merci d’être avec nous pour ${role}. En parcourant votre CV, j’ai remarqué « ${cvSnippet} » — pouvez-vous vous présenter et nous expliquer comment cette expérience vous prépare à ce poste ?`
          : `Bonjour et merci de nous rejoindre pour ${role}. Pour commencer, pouvez-vous retracer votre parcours et ce qui vous motive particulièrement dans cette opportunité ?`
        : cvSnippet
          ? `Welcome, and thanks for joining us for ${role}. Looking through your CV, "${cvSnippet}" stood out — could you introduce yourself and share how that experience connects to this role?`
          : `Welcome, and thanks for speaking with us about ${role}. To get us started, could you walk us through your background and what drew you to this opportunity?`

    return {
      speakerIndex,
      speakerLabel,
      acknowledgement: '',
      question,
      isFollowUp: false,
      topicMatched: topics[0] ?? role,
      coachingNote:
        lang === 'fr'
          ? 'Structurez votre réponse en 45–60 secondes en reliant votre parcours au poste visé.'
          : 'Keep your opening crisp (45–60s) and bridge directly to the target role.',
      source: 'fallback',
    }
  }

  const usedWeHeavy =
    /\b(we|our|us)\b/i.test(latestAnswer) && !/\b(i built|i led|i designed|i owned|i implemented)\b/i.test(latestAnswer)

  let acknowledgement =
    lang === 'fr'
      ? 'Merci pour ces éléments.'
      : 'Thanks for sharing that context.'
  let question = ''

  if (lang === 'fr') {
    if (usedWeHeavy) {
      acknowledgement = 'C’est un beau projet d’équipe.'
      question = `Pour préciser votre rôle personnel${answerKeyword ? ` autour de « ${answerKeyword} »` : ''}, quelle décision ou réalisation avez-vous portée vous-même et quel résultat chiffré avez-vous obtenu ?`
    } else if (shouldFollowUp && answerKeyword) {
      acknowledgement = `Vous avez mentionné « ${answerKeyword} ».`
      question = `Quel a été le principal arbitrage ou obstacle rencontré sur cet aspect, et comment avez-vous mesuré le succès ?`
    } else if (cvSnippet && qCount <= 2) {
      question = `En revenant sur votre CV (« ${cvSnippet} »), quel défi technique ou humain avez-vous dû résoudre personnellement ?`
    } else if (project && qCount <= 3) {
      question = `À propos de votre projet clé (« ${project} »), que feriez-vous différemment aujourd’hui avec le recul ?`
    } else {
      question = `Sur le thème « ${activeTopic} », pouvez-vous détailler un exemple concret en précisant le problème, votre action personnelle et le résultat ?`
    }
  } else {
    if (usedWeHeavy) {
      acknowledgement = 'Sounds like a strong team effort.'
      question = `Zooming in on your individual ownership${answerKeyword ? ` around "${answerKeyword}"` : ''}, what specific part did you personally design or decide, and what measurable outcome followed?`
    } else if (shouldFollowUp && answerKeyword) {
      acknowledgement = `You brought up "${answerKeyword}" — that’s interesting.`
      question = `What was the hardest trade-off you had to make there, and how did you verify the result worked?`
    } else if (cvSnippet && qCount <= 2) {
      question = `Looking at your CV ("${cvSnippet}"), can you walk me through a tough challenge you personally owned on that work and the result you achieved?`
    } else if (project && qCount <= 3) {
      question = `Thinking about your flagship project ("${project}"), what was the biggest risk you had to navigate, and what would you do differently today?`
    } else {
      question = `Shifting to "${activeTopic}" — can you share a concrete example using Problem, your personal Action, and the measurable Result?`
    }
  }

  return {
    speakerIndex,
    speakerLabel,
    acknowledgement,
    question,
    isFollowUp: shouldFollowUp,
    topicMatched: activeTopic,
    coachingNote:
      lang === 'fr'
        ? 'Utilisez « je » pour clarifier votre contribution personnelle et ajoutez un chiffre clé.'
        : 'Use "I" ownership statements and anchor your answer with one concrete metric.',
    source: 'fallback',
  }
}

async function callDeepSeek(
  apiKey: string,
  systemPrompt: string,
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
        temperature: 0.55,
        max_tokens: 420,
        messages: [
          { role: 'system', content: systemPrompt },
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

  let payload: InterviewRequestPayload = {}
  try {
    const raw = event.body
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body
      : '{}'
    payload = JSON.parse(raw) as InterviewRequestPayload
  } catch {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(buildFallbackTurn({})),
    }
  }

  const fallback = buildFallbackTurn(payload)
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(fallback),
    }
  }

  const lang = payload.language === 'fr' ? 'fr' : 'en'
  const isPanel = Boolean(payload.isPanel)
  const action = payload.action === 'opening' ? 'opening' : 'respond'
  const ctx = payload.interviewContext ?? {}
  const style = payload.interviewerStyle ?? 'attentive'
  const panelists = PANELISTS[lang]

  const systemPrompt = `You are a realistic, sharp live job interviewer inside Stagera VR.
Language: ${lang === 'fr' ? 'French (fr)' : 'English (en)'}. ALL spoken output MUST be in ${lang === 'fr' ? 'French' : 'English'}.
Mode: ${
    isPanel
      ? `Panel Interview with 3 interviewers seated Left (0: ${panelists[0].label} — ${panelists[0].focus}), Center (1: ${panelists[1].label} — ${panelists[1].focus}), and Right (2: ${panelists[2].label} — ${panelists[2].focus}). Rotate naturally across panelists so all 3 participate.`
      : `1-on-1 Single Interview (speakerIndex MUST be 0, speakerLabel "${lang === 'fr' ? 'Recruteur' : 'Interviewer'}").`
  }
Interviewer tone: ${
    style === 'challenging'
      ? 'Probing, rigorous, and skeptical — respectfully challenge assumptions, ask for hard metrics and personal ownership.'
      : style === 'supportive'
        ? 'Warm, encouraging, and conversational while still asking concrete behavioral and role-relevant questions.'
        : 'Professional, attentive, and focused — ask crisp behavioral and technical follow-ups.'
  }

Respond ONLY with a valid JSON object matching this exact schema (no markdown fences):
{
  "speakerIndex": 0,
  "speakerLabel": "string",
  "acknowledgement": "brief 4-10 word natural reaction to candidate's last answer (empty string on opening)",
  "question": "1 crisp, realistic spoken interview question (max 38 words, natural conversational speech)",
  "isFollowUp": true,
  "topicMatched": "short topic label",
  "coachingNote": "1 short private coaching note on what the interviewer is testing"
}

Rules:
- Actively drive the interview forward. Never repeat a question already in conversationHistory.
- If a CV is provided, weave specific real roles, skills, or projects from the CV into your questions naturally.
- On "respond": reference specific details from latestCandidateAnswer (e.g., probe vague claims, ask about "I" vs "we" ownership, ask for metrics/trade-offs, or bridge smoothly to the next topic/CV highlight).
- Keep the spoken question natural, direct, and under 38 words so it sounds great via TTS in VR.`

  const historyLines = (payload.conversationHistory ?? [])
    .slice(-10)
    .map((turn) => `${turn.role === 'interviewer' ? turn.speakerLabel || 'Interviewer' : 'Candidate'}: ${turn.text}`)
    .join('\n')

  const userPrompt = [
    `Action: ${action}`,
    `Question number so far: ${payload.questionCount ?? 0}`,
    isPanel ? `Previous panelist index: ${payload.lastPanelistIndex ?? 'none'}` : '',
    `Follow-ups enabled: ${payload.followUpsEnabled !== false}`,
    `Target role / title: ${ctx.jobTitle || payload.sessionTitle || 'General role'}`,
    ctx.jobDescription ? `Job description:\n${ctx.jobDescription.slice(0, 1800)}` : '',
    ctx.projectSummary ? `Candidate flagship project summary:\n${ctx.projectSummary.slice(0, 1400)}` : '',
    ctx.cvText
      ? `Uploaded CV (${ctx.cvFileName || 'CV'}):\n${ctx.cvText.slice(0, 3200)}`
      : ctx.cvFileName
        ? `Uploaded CV filename: ${ctx.cvFileName} (no text extracted)`
        : 'No CV uploaded.',
    payload.topics?.length ? `Planned interview themes: ${JSON.stringify(payload.topics)}` : '',
    historyLines ? `Conversation history so far:\n${historyLines}` : 'Conversation history: (start of interview)',
    action === 'respond'
      ? `Candidate's latest answer:\n${payload.latestCandidateAnswer?.trim() || '(brief pause / no clear words captured — gently prompt or move to the next question)'}`
      : 'Generate the realistic opening interview question now.',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const rawContent = await callDeepSeek(apiKey, systemPrompt, userPrompt)
    if (!rawContent) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(fallback),
      }
    }

    const parsed = JSON.parse(rawContent) as Partial<InterviewResponsePayload>
    const rawIdx = typeof parsed.speakerIndex === 'number' ? Math.round(parsed.speakerIndex) : fallback.speakerIndex
    const speakerIndex = isPanel ? Math.max(0, Math.min(2, rawIdx)) : 0
    const speakerLabel =
      typeof parsed.speakerLabel === 'string' && parsed.speakerLabel.trim().length > 0
        ? parsed.speakerLabel.trim()
        : isPanel
          ? panelists[speakerIndex].label
          : fallback.speakerLabel

    const question =
      typeof parsed.question === 'string' && parsed.question.trim().length > 8
        ? parsed.question.trim()
        : fallback.question

    const acknowledgement =
      action === 'opening'
        ? ''
        : typeof parsed.acknowledgement === 'string'
          ? parsed.acknowledgement.trim()
          : ''

    const response: InterviewResponsePayload = {
      speakerIndex,
      speakerLabel,
      acknowledgement,
      question,
      isFollowUp: typeof parsed.isFollowUp === 'boolean' ? parsed.isFollowUp : fallback.isFollowUp,
      topicMatched:
        typeof parsed.topicMatched === 'string' && parsed.topicMatched.trim()
          ? parsed.topicMatched.trim()
          : fallback.topicMatched,
      coachingNote:
        typeof parsed.coachingNote === 'string' && parsed.coachingNote.trim()
          ? parsed.coachingNote.trim()
          : fallback.coachingNote,
      source: 'deepseek',
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    }
  } catch {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(fallback),
    }
  }
}

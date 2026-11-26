import type {
  AppLanguage,
  InterviewDetails,
  PracticeType,
  Topic,
  UploadedMaterialFile,
  VenueType,
} from '../types/stagera'

export const MAX_MATERIAL_FILE_BYTES = 25 * 1024 * 1024 // 25 MB (NFR-09)
export const MAX_SLIDE_COUNT = 50 // 50 slides (NFR-09)

export const ALLOWED_MATERIAL_EXTENSIONS = ['pptx', 'pdf', 'docx', 'txt'] as const
export const ALLOWED_CV_EXTENSIONS = ['pdf', 'docx', 'txt'] as const

export interface FileValidationResult {
  valid: boolean
  extension: string
  reason?: 'size' | 'type'
}

export interface TopicExtractionInput {
  practiceType: PracticeType
  language: AppLanguage
  files?: UploadedMaterialFile[]
  outlineText?: string
  interviewDetails?: InterviewDetails
}

function makeTopicId(index: number): string {
  return `topic-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

export function validateMaterialFile(
  file: Pick<File, 'name' | 'size'>,
  allowedExtensions: readonly string[] = ALLOWED_MATERIAL_EXTENSIONS,
): FileValidationResult {
  const extension = getFileExtension(file.name)
  if (!allowedExtensions.includes(extension)) {
    return { valid: false, extension, reason: 'type' }
  }
  if (file.size > MAX_MATERIAL_FILE_BYTES) {
    return { valid: false, extension, reason: 'size' }
  }
  return { valid: true, extension }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

export function getDefaultVenueForPracticeType(type: PracticeType): VenueType {
  switch (type) {
    case 'interview':
      return 'interview_room'
    case 'panel':
      return 'panel_room'
    case 'pitch':
      return 'classroom'
    case 'presentation':
    default:
      return 'lecture_hall'
  }
}

function humanizeFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  const cleaned = withoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\b(v\d+|final|draft|slides?|deck|presentation|cv|resume)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function parseOutlineLines(rawText: string): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^#+\s*/, '')
        .replace(/^[-*•–—]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line.length >= 3)

  const unique: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const clipped = line.length > 84 ? `${line.slice(0, 81).trimEnd()}…` : line
    const key = clipped.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(clipped)
    }
    if (unique.length >= 10) break
  }
  return unique
}

interface KeywordRule {
  pattern: RegExp
  en: string
  fr: string
}

const INTERVIEW_KEYWORD_RULES: KeywordRule[] = [
  {
    pattern: /\b(react|typescript|javascript|frontend|web|ui|ux|css|html|node|python|java|api|backend|cloud|aws|sql|architecture|system design|ml|ai|data)\b/i,
    en: 'Technical depth & architecture',
    fr: 'Expertise technique et architecture',
  },
  {
    pattern: /\b(lead|leadership|mentor|manage|manager|strategy|roadmap|stakeholder|cross-functional|director)\b/i,
    en: 'Leadership & stakeholder alignment',
    fr: 'Leadership et alignement des parties prenantes',
  },
  {
    pattern: /\b(product|customer|user|metrics|kpi|growth|experiment|a\/b|launch|research)\b/i,
    en: 'Product thinking & measurable impact',
    fr: 'Vision produit et impact mesurable',
  },
  {
    pattern: /\b(team|collaborat|agile|scrum|communication|conflict|feedback|remote)\b/i,
    en: 'Team collaboration & conflict resolution',
    fr: 'Travail d’équipe et gestion des désaccords',
  },
  {
    pattern: /\b(scale|performance|security|reliability|testing|quality|ci\/cd|devops|latency)\b/i,
    en: 'Quality, scale & engineering trade-offs',
    fr: 'Qualité, passage à l’échelle et arbitrages',
  },
  {
    pattern: /\b(finance|sales|client|account|negotiation|budget|revenue|consulting|operations)\b/i,
    en: 'Client impact & business judgment',
    fr: 'Impact client et sens des affaires',
  },
]

export function extractInterviewPreviewChips(
  details: InterviewDetails,
  language: AppLanguage,
): string[] {
  const chips: string[] = []
  const addChip = (label: string) => {
    if (!chips.some((c) => c.toLowerCase() === label.toLowerCase())) {
      chips.push(label)
    }
  }

  const title = details.jobTitle.trim()
  const jd = details.jobDescription.trim()
  const project = details.projectSummary.trim()
  const cvText = details.cvFile?.extractedText?.trim() ?? ''
  const combined = `${title} ${jd} ${project} ${cvText}`

  if (title) {
    addChip(
      language === 'fr'
        ? `Motivation pour ${title}`
        : `Role motivation: ${title}`,
    )
  } else {
    addChip(language === 'fr' ? 'Présentation et parcours' : 'Background & role fit')
  }

  for (const rule of INTERVIEW_KEYWORD_RULES) {
    if (rule.pattern.test(combined)) {
      addChip(language === 'fr' ? rule.fr : rule.en)
    }
    if (chips.length >= 4) break
  }

  if (project) {
    addChip(
      language === 'fr'
        ? 'Projet clé (méthode PAR)'
        : 'Flagship project deep-dive (PAR)',
    )
  }

  if (details.cvFile) {
    addChip(
      language === 'fr'
        ? cvText
          ? `Parcours & projets (${details.cvFile.name.replace(/\.[^.]+$/, '').slice(0, 24)})`
          : 'Parcours et réalisations du CV'
        : cvText
          ? `CV experience & projects (${details.cvFile.name.replace(/\.[^.]+$/, '').slice(0, 24)})`
          : 'CV highlights & career progression',
    )
  }

  if (chips.length < 3) {
    addChip(
      language === 'fr'
        ? 'Résolution de problèmes (PAR)'
        : 'Problem-solving & behavioral PAR',
    )
  }

  addChip(
    language === 'fr'
      ? 'Questions pour le recruteur'
      : 'Questions for the interviewer',
  )

  return chips.slice(0, 6)
}

function getStarterTopics(practiceType: PracticeType, language: AppLanguage): Topic[] {
  const enSets: Record<PracticeType, Array<{ title: string; brief?: boolean }>> = {
    presentation: [
      { title: 'Opening hook & context', brief: true },
      { title: 'Core problem & motivation' },
      { title: 'Key findings & methodology' },
      { title: 'Live example or case study' },
      { title: 'Conclusions & Q&A takeaways', brief: true },
    ],
    pitch: [
      { title: 'The problem & market pain', brief: true },
      { title: 'Solution & product value' },
      { title: 'Traction & business model' },
      { title: 'Competitive edge & team' },
      { title: 'The ask & next milestones', brief: true },
    ],
    panel: [
      { title: 'Opening stance & perspective', brief: true },
      { title: 'Key industry trends & evidence' },
      { title: 'Trade-offs & counterarguments' },
      { title: 'Practical recommendations' },
      { title: 'Closing takeaway', brief: true },
    ],
    interview: [
      { title: 'Background & role motivation', brief: true },
      { title: 'Flagship project deep-dive (PAR)' },
      { title: 'Core role skills & trade-offs' },
      { title: 'Collaboration & handling challenges' },
      { title: 'Questions for the interviewer', brief: true },
    ],
  }

  const frSets: Record<PracticeType, Array<{ title: string; brief?: boolean }>> = {
    presentation: [
      { title: 'Accroche et contexte', brief: true },
      { title: 'Problématique et enjeux' },
      { title: 'Méthode et résultats clés' },
      { title: 'Exemple concret ou étude de cas' },
      { title: 'Conclusion et questions', brief: true },
    ],
    pitch: [
      { title: 'Problème et besoin du marché', brief: true },
      { title: 'Solution et proposition de valeur' },
      { title: 'Traction et modèle économique' },
      { title: 'Avantage concurrentiel et équipe' },
      { title: 'Demande et prochaines étapes', brief: true },
    ],
    panel: [
      { title: 'Position d’ouverture et point de vue', brief: true },
      { title: 'Tendances du secteur et faits clés' },
      { title: 'Arbitrages et contre-arguments' },
      { title: 'Recommandations concrètes' },
      { title: 'Message de clôture', brief: true },
    ],
    interview: [
      { title: 'Présentation et motivation pour le poste', brief: true },
      { title: 'Projet clé en détail (méthode PAR)' },
      { title: 'Compétences clés et arbitrages' },
      { title: 'Collaboration et gestion des difficultés' },
      { title: 'Questions pour le recruteur', brief: true },
    ],
  }

  const chosen = language === 'fr' ? frSets[practiceType] : enSets[practiceType]
  return chosen.map((item, idx) => ({
    id: makeTopicId(idx),
    title: item.title,
    brief: Boolean(item.brief),
  }))
}

function attachSlideRanges(topics: Topic[], hasSlideFile: boolean): Topic[] {
  if (!hasSlideFile || topics.length === 0) return topics
  const slidesPerTopic = 2
  return topics.map((topic, idx) => {
    const start = idx * slidesPerTopic + 1
    const end = start + slidesPerTopic - 1
    return {
      ...topic,
      slideRange: start === end ? `${start}` : `${start}–${end}`,
    }
  })
}

export async function extractTopics(input: TopicExtractionInput): Promise<Topic[]> {
  const { practiceType, language, files = [], outlineText = '', interviewDetails } = input

  // Interview path (S1.6b -> S1.7)
  if (practiceType === 'interview') {
    const details: InterviewDetails = interviewDetails ?? {
      jobTitle: '',
      jobDescription: '',
      projectSummary: '',
      cvFile: null,
    }
    const chips = extractInterviewPreviewChips(details, language)
    if (chips.length === 0) {
      return getStarterTopics('interview', language)
    }

    return chips.map((chip, idx) => ({
      id: makeTopicId(idx),
      title: chip,
      brief: idx === 0 || idx === chips.length - 1,
    }))
  }

  // Presentation / Pitch / Panel path (S1.6 -> S1.7)
  const hasSlideDeck = files.some((f) => f.extension === 'pptx' || f.extension === 'pdf')

  const combinedTextParts: string[] = []
  if (outlineText.trim()) {
    combinedTextParts.push(outlineText.trim())
  }
  for (const file of files) {
    if (file.extractedText?.trim()) {
      combinedTextParts.push(file.extractedText.trim())
    }
  }

  const parsedLines = parseOutlineLines(combinedTextParts.join('\n'))
  if (parsedLines.length > 0) {
    const topics: Topic[] = parsedLines.map((line, idx) => ({
      id: makeTopicId(idx),
      title: line,
      brief: idx === 0 && parsedLines.length > 3,
    }))
    return attachSlideRanges(topics, hasSlideDeck)
  }

  // Fallback when binary files were uploaded without plain text or outline
  const starter = getStarterTopics(practiceType, language)
  if (files.length > 0) {
    const primaryTitle = humanizeFileName(files[0].name)
    if (primaryTitle) {
      starter[0] = {
        ...starter[0],
        title:
          language === 'fr'
            ? `Introduction : ${primaryTitle}`
            : `Introduction: ${primaryTitle}`,
      }
    }
    return attachSlideRanges(starter, hasSlideDeck)
  }

  return starter
}

import type { AppLanguage, SessionSetup, Topic } from '../types/stagera'

export interface QAQuestion {
  id: string
  speakerLabel: string
  text: string
  isFollowUp: boolean
  topicTitle: string
  slideIndex: number
}

export function generateAudienceQuestion(
  setup: SessionSetup,
  activeTopic: Topic | undefined,
  slideIndex: number,
  language: AppLanguage,
  askedCount: number,
): QAQuestion {
  const topicTitle = activeTopic?.title || setup.title
  const isInterview = setup.practiceType === 'interview'
  const isPitch = setup.practiceType === 'pitch'
  const isPanel = setup.practiceType === 'panel'
  const challenging = setup.audienceBehaviour === 'challenging'

  const speakerLabel = isInterview
    ? language === 'fr'
      ? 'Recruteur'
      : 'Interviewer'
    : isPanel
      ? language === 'fr'
        ? 'Modérateur du panel'
        : 'Panel Moderator'
      : isPitch
        ? language === 'fr'
          ? 'Investisseur'
          : 'Investor'
        : language === 'fr'
          ? 'Membre du public'
          : 'Audience Member'

  let text = ''

  if (language === 'fr') {
    if (isInterview) {
      const pool = [
        `À propos de « ${topicTitle} », quelle a été précisément votre contribution personnelle par rapport au reste de l’équipe ?`,
        `Quel a été le principal arbitrage technique ou organisationnel que vous avez dû trancher sur « ${topicTitle} » ?`,
        `Si vous deviez refaire « ${topicTitle} » aujourd’hui, que changeriez-vous et quel indicateur suivriez-vous ?`,
      ]
      text = pool[askedCount % pool.length]
    } else if (isPitch) {
      const pool = [
        `Concernant « ${topicTitle} », qu’est-ce qui prouve que les clients paieront pour cette solution dès cette année ?`,
        `Comment défendez-vous votre position sur « ${topicTitle} » face aux acteurs déjà établis ?`,
        `Quel est le risque numéro un lié à « ${topicTitle} » dans les six prochains mois ?`,
      ]
      text = pool[askedCount % pool.length]
    } else if (challenging) {
      const pool = [
        `Sur « ${topicTitle} », quelles données concrètes soutiennent votre conclusion face à une interprétation alternative ?`,
        `N’y a-t-il pas une limite majeure dans votre approche de « ${topicTitle} » à grande échelle ?`,
        `Comment répondez-vous aux sceptiques qui jugent « ${topicTitle} » trop coûteux à mettre en œuvre ?`,
      ]
      text = pool[askedCount % pool.length]
    } else {
      const pool = [
        `Pouvez-vous donner un exemple concret illustrant « ${topicTitle} » en pratique ?`,
        `Quel est le point le plus important à retenir de « ${topicTitle} » pour quelqu’un qui découvre le sujet ?`,
        `Comment « ${topicTitle} » s’articule-t-il avec la suite de votre présentation ?`,
      ]
      text = pool[askedCount % pool.length]
    }
  } else {
    if (isInterview) {
      const pool = [
        `Looking at "${topicTitle}", what was your specific personal contribution compared to the rest of the team?`,
        `What was the hardest trade-off you had to make on "${topicTitle}", and how did you decide?`,
        `If you had to redo "${topicTitle}" today, what would you change and what metric would you track?`,
      ]
      text = pool[askedCount % pool.length]
    } else if (isPitch) {
      const pool = [
        `On "${topicTitle}", what concrete traction proves customers will pay for this right now?`,
        `How do you defend "${topicTitle}" if an incumbent copies this feature next quarter?`,
        `What is the single biggest execution risk in "${topicTitle}" over the next six months?`,
      ]
      text = pool[askedCount % pool.length]
    } else if (challenging) {
      const pool = [
        `Regarding "${topicTitle}", what hard evidence rules out an alternative explanation?`,
        `Doesn't your approach to "${topicTitle}" hit a major bottleneck once you scale?`,
        `How do you answer critics who say "${topicTitle}" is too costly to adopt in practice?`,
      ]
      text = pool[askedCount % pool.length]
    } else {
      const pool = [
        `Could you share a concrete real-world example that illustrates "${topicTitle}"?`,
        `What is the single takeaway you want us to remember from "${topicTitle}"?`,
        `How does "${topicTitle}" connect to the next part of your talk?`,
      ]
      text = pool[askedCount % pool.length]
    }
  }

  return {
    id: `qa-${Date.now().toString(36)}-${askedCount}`,
    speakerLabel,
    text,
    isFollowUp: false,
    topicTitle,
    slideIndex,
  }
}

export function generateFollowUpQuestion(
  parent: QAQuestion,
  setup: SessionSetup,
  language: AppLanguage,
): QAQuestion {
  const isInterview = setup.practiceType === 'interview'

  const text =
    language === 'fr'
      ? isInterview
        ? `Merci. Pour approfondir sur « ${parent.topicTitle} » : quel résultat mesurable avez-vous obtenu personnellement ?`
        : `Intéressant — pour préciser sur « ${parent.topicTitle} », quelle serait la première étape concrète dès demain ?`
      : isInterview
        ? `Thanks. Following up on "${parent.topicTitle}" — what measurable result did you personally drive?`
        : `Interesting — following up on "${parent.topicTitle}", what would be the very first concrete step to put that into practice?`

  return {
    id: `qa-fu-${Date.now().toString(36)}`,
    speakerLabel:
      language === 'fr'
        ? `${parent.speakerLabel} (Relance)`
        : `${parent.speakerLabel} (Follow-up)`,
    text,
    isFollowUp: true,
    topicTitle: parent.topicTitle,
    slideIndex: parent.slideIndex,
  }
}

export function speakQuestionTTS(text: string, language: AppLanguage): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'fr' ? 'fr-FR' : 'en-US'
    utterance.rate = 1.02
    utterance.pitch = 1.0
    window.speechSynthesis.speak(utterance)
  } catch {
    // Ignore TTS errors in restricted browser environments
  }
}

export function stopTTS(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // Ignore
  }
}

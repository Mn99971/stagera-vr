import type { AppLanguage, SessionRecord, UserProfile } from '../types/stagera'

export interface ComputedReportSummary {
  overallScore: number
  scoreLabel: string
  executiveSummary: string
  strengths: string[]
  areasToImprove: string[]
}

function formatDuration(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds))
  const m = Math.floor(clamped / 60)
  const s = clamped % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function slugifyFileName(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'session'
  )
}

function venueDisplayName(venue: SessionRecord['venue'], language: AppLanguage): string {
  const map: Record<SessionRecord['venue'], { en: string; fr: string }> = {
    classroom: { en: 'Classroom (30 seats)', fr: 'Salle de classe (30 places)' },
    lecture_hall: { en: 'Lecture Hall (60 seats)', fr: 'Amphithéâtre (60 places)' },
    auditorium: { en: 'Auditorium (200 seats)', fr: 'Auditorium (200 places)' },
    interview_room: { en: 'Interview Room (1-on-1)', fr: 'Salle d’entretien (1-à-1)' },
    panel_room: { en: 'Panel Interview Room (3 panelists)', fr: 'Salle de panel (3 recruteurs)' },
  }
  return map[venue]?.[language] ?? venue
}

export function computeSessionSummary(
  record: SessionRecord,
  language: AppLanguage,
): ComputedReportSummary {
  const isFr = language === 'fr'
  const isInterview =
    record.practiceType === 'interview' ||
    record.venue === 'interview_room' ||
    record.venue === 'panel_room'

  const ai = record.aiFeedback

  let computedScore = 76
  if (record.wpm >= 120 && record.wpm <= 155) computedScore += 9
  else if (record.wpm > 0 && (record.wpm < 100 || record.wpm > 175)) computedScore -= 8
  if (record.fillerCount <= 3) computedScore += 7
  else if (record.fillerCount > 7) computedScore -= 8
  if (record.topicsTotal > 0 && record.topicsCovered / record.topicsTotal >= 0.8) {
    computedScore += 6
  }
  const { left, centre, right } = record.eyeContactZones
  if (left >= 15 && right >= 15 && centre >= 30) computedScore += 4
  if (isInterview && record.iCount > record.weCount) computedScore += 4

  const overallScore =
    typeof ai?.overallScore === 'number'
      ? Math.max(40, Math.min(99, Math.round(ai.overallScore)))
      : Math.max(45, Math.min(98, computedScore))

  const scoreLabel =
    overallScore >= 85
      ? isFr
        ? 'Excellent'
        : 'Strong'
      : overallScore >= 72
        ? isFr
          ? 'Solide'
          : 'Solid'
        : isFr
          ? 'En progrès'
          : 'Developing'

  const executiveSummary =
    ai?.executiveSummary && ai.executiveSummary.trim().length > 12
      ? ai.executiveSummary.trim()
      : isFr
        ? `Session « ${record.title} » réalisée en ${formatDuration(record.durationSeconds)} (${venueDisplayName(record.venue, 'fr')}). Votre débit moyen était de ${record.wpm} mots/min avec ${record.fillerCount} tic${record.fillerCount > 1 ? 's' : ''} de langage et ${record.topicsCovered}/${record.topicsTotal} points couverts.`
        : `Completed "${record.title}" in ${formatDuration(record.durationSeconds)} inside ${venueDisplayName(record.venue, 'en')}. You spoke at an average pace of ${record.wpm} WPM with ${record.fillerCount} detected filler word${record.fillerCount === 1 ? '' : 's'} and covered ${record.topicsCovered} of ${record.topicsTotal} planned topics.`

  const strengths: string[] =
    ai?.strengths && ai.strengths.length > 0
      ? ai.strengths
      : [
          record.wpm >= 115 && record.wpm <= 155
            ? isFr
              ? `Rythme vocal maîtrisé à ${record.wpm} mots/min (cible : 120–150).`
              : `Steady delivery cadence at ${record.wpm} WPM (within the 120–150 WPM clarity window).`
            : isFr
              ? `Durée de pratique engagée (${formatDuration(record.durationSeconds)}) dans des conditions réalistes.`
              : `Committed ${formatDuration(record.durationSeconds)} of live VR rehearsal under realistic room conditions.`,
          record.fillerCount <= 3
            ? isFr
              ? `Expression fluide avec seulement ${record.fillerCount} tic(s) de langage.`
              : `Clean verbal delivery with only ${record.fillerCount} filler word${record.fillerCount === 1 ? '' : 's'} detected.`
            : isFr
              ? `Couverture structurée : ${record.topicsCovered}/${record.topicsTotal} sujets abordés.`
              : `Structured progression across ${record.topicsCovered}/${record.topicsTotal} planned topics.`,
          isInterview && record.iCount >= record.weCount && record.iCount > 0
            ? isFr
              ? `Bon leadership personnel (« je » : ${record.iCount} vs « nous » : ${record.weCount}).`
              : `Clear personal ownership ("I": ${record.iCount} vs "we": ${record.weCount}).`
            : isFr
              ? `Répartition du regard : Gauche ${left}%, Centre ${centre}%, Droite ${right}%.`
              : `Audience gaze coverage: Left ${left}%, Centre ${centre}%, Right ${right}%.`,
        ]

  const topFiller = Object.entries(record.fillerBreakdown).sort((a, b) => b[1] - a[1])[0]
  const areasToImprove: string[] =
    ai?.areasToImprove && ai.areasToImprove.length > 0
      ? ai.areasToImprove
      : [
          record.wpm > 155
            ? isFr
              ? `Ralentir légèrement de ${record.wpm} vers 130–150 mots/min en marquant des pauses d’une seconde.`
              : `Slow down slightly from ${record.wpm} WPM toward 130–150 WPM using intentional 1-second pauses.`
            : record.wpm > 0 && record.wpm < 115
              ? isFr
                ? `Dynamiser le débit de ${record.wpm} vers 125–145 mots/min lors des transitions.`
                : `Lift energy from ${record.wpm} WPM toward 125–145 WPM with tighter transitions.`
              : isFr
                ? 'Ajouter une courte pause avant vos chiffres et messages clés pour renforcer l’impact.'
                : 'Add a brief beat before key metrics and takeaways to amplify authority.',
          record.fillerCount > 3 && topFiller
            ? isFr
              ? `Réduire « ${topFiller[0]} » (${topFiller[1]}×) en remplaçant les hésitations par un silence bref.`
              : `Cut "${topFiller[0]}" (${topFiller[1]}×) by replacing verbal hesitations with a silent breath.`
            : isInterview && record.weCount > record.iCount
              ? isFr
                ? `Privilégier « je » (${record.iCount}) plutôt que « nous » (${record.weCount}) pour clarifier votre rôle.`
                : `Shift from "we" (${record.weCount}) to "I" (${record.iCount}) to highlight your individual ownership.`
              : isFr
                ? 'Équilibrer davantage le balayage visuel vers les zones latérales de la salle.'
                : 'Sweep gaze slightly longer toward Left and Right room zones during key points.',
        ]

  return {
    overallScore,
    scoreLabel,
    executiveSummary,
    strengths,
    areasToImprove,
  }
}

export async function exportSessionReportPdf(
  record: SessionRecord,
  language: AppLanguage,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const isFr = language === 'fr'
  const summary = computeSessionSummary(record, language)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 44
  const contentWidth = pageWidth - margin * 2
  let y = 0

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 54) {
      doc.addPage()
      y = 48
    }
  }

  // Brand Header Banner
  doc.setFillColor(15, 23, 42) // #0f172a
  doc.rect(0, 0, pageWidth, 108, 'F')
  doc.setFillColor(20, 184, 166) // #14b8a6 accent bar
  doc.rect(0, 108, pageWidth, 4, 'F')

  doc.setTextColor(94, 234, 212)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(
    isFr ? 'STAGERA VR · RAPPORT DE SESSION' : 'STAGERA VR · SESSION COACHING REPORT',
    margin,
    34,
  )

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  const titleLines = doc.splitTextToSize(record.title, contentWidth - 96)
  doc.text(titleLines.slice(0, 2), margin, 60)

  const formattedDate = new Date(record.createdAt).toLocaleDateString(
    isFr ? 'fr-FR' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' },
  )
  doc.setTextColor(203, 213, 225)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(
    `${venueDisplayName(record.venue, language)}  ·  ${formattedDate}  ·  ${record.coachedMode ? (isFr ? 'Mode coaché' : 'Coached Mode') : isFr ? 'Mode autonome' : 'Independent Mode'}`,
    margin,
    92,
  )

  // Overall Score Pill in Header
  doc.setFillColor(15, 118, 110)
  doc.roundedRect(pageWidth - margin - 78, 24, 78, 62, 10, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text(`${summary.overallScore}`, pageWidth - margin - 39, 54, { align: 'center' })
  doc.setFontSize(8.5)
  doc.setTextColor(204, 251, 241)
  doc.text(summary.scoreLabel.toUpperCase(), pageWidth - margin - 39, 72, { align: 'center' })

  y = 132

  // Executive Summary Box
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(15, 23, 42)
  doc.text(isFr ? 'Synthèse de la session' : 'Executive Summary', margin, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const execLines = doc.splitTextToSize(summary.executiveSummary, contentWidth - 24)
  const execBoxH = execLines.length * 14 + 20
  doc.setFillColor(241, 245, 249)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(margin, y, contentWidth, execBoxH, 6, 6, 'FD')
  doc.setTextColor(30, 41, 59)
  doc.text(execLines, margin + 12, y + 18)
  y += execBoxH + 18

  // Key Metrics 4-Card Row
  ensureSpace(74)
  const cardGap = 10
  const cardW = (contentWidth - cardGap * 3) / 4
  const metrics = [
    {
      label: isFr ? 'DÉBIT' : 'PACE',
      value: `${record.wpm} WPM`,
      sub: isFr ? 'Cible 120–150' : 'Target 120–150',
    },
    {
      label: isFr ? 'TICS DE LANGAGE' : 'FILLER WORDS',
      value: `${record.fillerCount}`,
      sub:
        Object.entries(record.fillerBreakdown)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([w, c]) => `${w} (${c})`)
          .join(', ') || (isFr ? 'Aucun' : 'None'),
    },
    {
      label: isFr ? 'SUJETS COUVERTS' : 'TOPICS COVERED',
      value: `${record.topicsCovered} / ${record.topicsTotal}`,
      sub: `${record.eyeContactZones.left}% L · ${record.eyeContactZones.centre}% C · ${record.eyeContactZones.right}% R`,
    },
    {
      label: isFr ? 'DURÉE' : 'DURATION',
      value: formatDuration(record.durationSeconds),
      sub: `/ ${record.timeLimitMinutes}:00 min`,
    },
  ]

  metrics.forEach((m, idx) => {
    const x = margin + idx * (cardW + cardGap)
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, cardW, 64, 6, 6, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(m.label, x + 10, y + 17)
    doc.setFontSize(15)
    doc.setTextColor(15, 23, 42)
    doc.text(m.value, x + 10, y + 38)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(71, 85, 105)
    doc.text(m.sub.slice(0, 26), x + 10, y + 53)
  })
  y += 82

  // Strengths & Areas to Improve
  const drawBulletSection = (
    title: string,
    items: string[],
    accentRgb: [number, number, number],
  ) => {
    if (items.length === 0) return
    ensureSpace(44)
    doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2])
    doc.rect(margin, y - 10, 4, 14, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(15, 23, 42)
    doc.text(title, margin + 12, y)
    y += 14

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(30, 41, 59)
    for (const item of items) {
      const lines = doc.splitTextToSize(`•  ${item}`, contentWidth - 12)
      ensureSpace(lines.length * 14 + 6)
      doc.text(lines, margin + 8, y)
      y += lines.length * 14 + 4
    }
    y += 10
  }

  drawBulletSection(
    isFr ? 'Points forts' : 'Key Strengths',
    summary.strengths,
    [16, 185, 129],
  )
  drawBulletSection(
    isFr ? 'Axes d’amélioration' : 'Areas to Improve',
    summary.areasToImprove,
    [245, 158, 11],
  )

  // Recommendations
  const recs =
    record.recommendations.length > 0
      ? record.recommendations
      : record.aiFeedback?.topRecommendations ?? []
  if (recs.length > 0) {
    ensureSpace(44)
    doc.setFillColor(29, 78, 216)
    doc.rect(margin, y - 10, 4, 14, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(15, 23, 42)
    doc.text(isFr ? 'Recommandations prioritaires' : 'Actionable Recommendations', margin + 12, y)
    y += 14

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(30, 41, 59)
    recs.forEach((rec, idx) => {
      const lines = doc.splitTextToSize(`${idx + 1}.  ${rec}`, contentWidth - 12)
      ensureSpace(lines.length * 14 + 6)
      doc.text(lines, margin + 8, y)
      y += lines.length * 14 + 5
    })
    y += 10
  }

  // Goal-First Feedback (if present)
  if (record.aiFeedback?.goalFeedback && record.aiFeedback.goalFeedback.length > 0) {
    ensureSpace(44)
    doc.setFillColor(15, 118, 110)
    doc.rect(margin, y - 10, 4, 14, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(15, 23, 42)
    doc.text(isFr ? 'Évaluation des objectifs' : 'Goal-by-Goal Coaching', margin + 12, y)
    y += 14

    for (const g of record.aiFeedback.goalFeedback) {
      const noteLines = doc.splitTextToSize(g.note, contentWidth - 16)
      ensureSpace(noteLines.length * 13 + 22)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(15, 23, 42)
      doc.text(`${g.goal}  [${g.status}]`, margin + 8, y)
      y += 13
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(71, 85, 105)
      doc.text(noteLines, margin + 8, y)
      y += noteLines.length * 13 + 7
    }
    y += 6
  }

  // Interview Q&A Breakdown (if present)
  if (record.qaTranscript && record.qaTranscript.length > 0) {
    ensureSpace(50)
    doc.setFillColor(67, 56, 202)
    doc.rect(margin, y - 10, 4, 14, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(15, 23, 42)
    doc.text(isFr ? 'Déroulé Q&R de l’entretien' : 'Interview Q&A Breakdown', margin + 12, y)
    y += 16

    for (const turn of record.qaTranscript) {
      const prefix = `[${formatDuration(turn.timestampSeconds)}] ${turn.speakerLabel}`
      const textLines = doc.splitTextToSize(turn.text, contentWidth - 22)
      const noteLines = turn.coachingNote
        ? doc.splitTextToSize(`Coach tip: ${turn.coachingNote}`, contentWidth - 22)
        : []
      const blockH = 16 + textLines.length * 13 + (noteLines.length ? noteLines.length * 12 + 4 : 0)
      ensureSpace(blockH + 10)

      doc.setFillColor(turn.role === 'interviewer' ? 239 : 248, turn.role === 'interviewer' ? 246 : 250, turn.role === 'interviewer' ? 255 : 252)
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(margin, y - 10, contentWidth, blockH + 8, 5, 5, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(turn.role === 'interviewer' ? 29 : 15, turn.role === 'interviewer' ? 78 : 118, turn.role === 'interviewer' ? 216 : 110)
      doc.text(prefix, margin + 10, y + 3)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(30, 41, 59)
      doc.text(textLines, margin + 10, y + 17)

      if (noteLines.length > 0) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8.5)
        doc.setTextColor(100, 116, 139)
        doc.text(noteLines, margin + 10, y + 17 + textLines.length * 13 + 2)
      }
      y += blockH + 16
    }
  }

  // Flagged Moments
  if (record.flaggedMoments.length > 0) {
    ensureSpace(44)
    doc.setFillColor(217, 119, 6)
    doc.rect(margin, y - 10, 4, 14, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(15, 23, 42)
    doc.text(isFr ? 'Moments clés signalés' : 'Flagged Moments', margin + 12, y)
    y += 14

    for (const m of record.flaggedMoments.slice(0, 8)) {
      const tipLines = m.aiTip ? doc.splitTextToSize(m.aiTip, contentWidth - 16) : []
      ensureSpace(22 + tipLines.length * 13)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(15, 23, 42)
      doc.text(`[${formatDuration(m.timestampSeconds)}]  ${m.label}`, margin + 8, y)
      y += 13
      if (tipLines.length > 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(71, 85, 105)
        doc.text(tipLines, margin + 8, y)
        y += tipLines.length * 12 + 6
      }
    }
  }

  // Transcript Excerpt
  if (record.transcript && record.transcript.trim().length > 0) {
    ensureSpace(50)
    doc.setFillColor(100, 116, 139)
    doc.rect(margin, y - 10, 4, 14, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(15, 23, 42)
    doc.text(isFr ? 'Transcription de la session' : 'Session Transcript', margin + 12, y)
    y += 14

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(51, 65, 85)
    const transcriptLines = doc.splitTextToSize(record.transcript.slice(0, 3500), contentWidth - 8)
    for (const line of transcriptLines) {
      ensureSpace(14)
      doc.text(line, margin + 4, y)
      y += 13
    }
  }

  // Page Footers
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, pageHeight - 36, pageWidth - margin, pageHeight - 36)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(100, 116, 139)
    doc.text('Stagera VR · AI Speaking & Interview Coaching', margin, pageHeight - 22)
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - margin, pageHeight - 22, {
      align: 'right',
    })
  }

  const datePart = new Date(record.createdAt).toISOString().slice(0, 10)
  doc.save(`stagera-report-${slugifyFileName(record.title)}-${datePart}.pdf`)
}

export async function exportAllSessionsSummaryPdf(
  profile: UserProfile,
  sessions: SessionRecord[],
  language: AppLanguage,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const isFr = language === 'fr'
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 44
  const contentWidth = pageWidth - margin * 2
  let y = 0

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 50) {
      doc.addPage()
      y = 48
    }
  }

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 96, 'F')
  doc.setFillColor(20, 184, 166)
  doc.rect(0, 96, pageWidth, 4, 'F')

  doc.setTextColor(94, 234, 212)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('STAGERA VR · PROGRESS PORTFOLIO', margin, 32)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(19)
  doc.text(
    isFr ? `Rapport de progression — ${profile.fullName}` : `Coaching Progress Report — ${profile.fullName}`,
    margin,
    58,
  )
  doc.setTextColor(203, 213, 225)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(
    `${profile.email}  ·  ${sessions.length} ${isFr ? 'sessions' : 'sessions'}  ·  ${new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-US')}`,
    margin,
    80,
  )

  y = 124

  if (sessions.length === 0) {
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(11)
    doc.text(isFr ? 'Aucune session enregistrée.' : 'No recorded sessions yet.', margin, y)
  } else {
    for (const rec of sessions.slice(0, 20)) {
      const summary = computeSessionSummary(rec, language)
      const execLines = doc.splitTextToSize(summary.executiveSummary, contentWidth - 24)
      const cardH = 54 + execLines.length * 13
      ensureSpace(cardH + 14)

      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(203, 213, 225)
      doc.roundedRect(margin, y, contentWidth, cardH, 6, 6, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11.5)
      doc.setTextColor(15, 23, 42)
      doc.text(rec.title.slice(0, 62), margin + 12, y + 20)

      doc.setFontSize(11)
      doc.setTextColor(15, 118, 110)
      doc.text(`${summary.overallScore}/100`, pageWidth - margin - 12, y + 20, { align: 'right' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text(
        `${new Date(rec.createdAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US')}  ·  ${rec.wpm} WPM  ·  ${rec.fillerCount} ${isFr ? 'tics' : 'fillers'}  ·  ${formatDuration(rec.durationSeconds)}`,
        margin + 12,
        y + 35,
      )

      doc.setTextColor(51, 65, 85)
      doc.setFontSize(9.5)
      doc.text(execLines, margin + 12, y + 51)
      y += cardH + 12
    }
  }

  doc.save(`stagera-progress-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}

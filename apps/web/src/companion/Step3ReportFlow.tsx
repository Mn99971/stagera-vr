import { useEffect, useState } from 'react'
import { buildSetupFromRecord } from '../lib/sessionStore'
import type {
  AppLanguage,
  FlaggedMoment,
  SessionRecord,
  SessionSetup,
} from '../types/stagera'
import { AttemptComparisonScreen } from './AttemptComparisonScreen'
import { FlaggedMomentsScreen } from './FlaggedMomentsScreen'
import { MomentReplayScreen } from './MomentReplayScreen'
import { SessionReportScreen } from './SessionReportScreen'

interface Step3ReportFlowProps {
  record: SessionRecord
  allSessions: SessionRecord[]
  language: AppLanguage
  onLaunchVRWithSetup: (setup: SessionSetup) => void
}

type ReportView = 'report' | 'timeline' | 'replay' | 'compare'

export function Step3ReportFlow({
  record,
  allSessions,
  language,
  onLaunchVRWithSetup,
}: Step3ReportFlowProps) {
  const [view, setView] = useState<ReportView>('report')
  const [selectedMoment, setSelectedMoment] = useState<FlaggedMoment | null>(null)

  useEffect(() => {
    setView('report')
    setSelectedMoment(null)
  }, [record.id])

  const handleOpenReplay = (moment: FlaggedMoment) => {
    setSelectedMoment(moment)
    setView('replay')
  }

  return (
    <section className="stage-card" aria-label={record.title}>
      {view === 'report' && (
        <SessionReportScreen
          record={record}
          language={language}
          onOpenTimeline={() => setView('timeline')}
          onOpenMomentReplay={handleOpenReplay}
          onOpenCompare={() => setView('compare')}
          onTryAgain={() => onLaunchVRWithSetup(buildSetupFromRecord(record, false))}
          onRaiseDifficulty={() => onLaunchVRWithSetup(buildSetupFromRecord(record, true))}
        />
      )}

      {view === 'timeline' && (
        <FlaggedMomentsScreen
          record={record}
          language={language}
          onBack={() => setView('report')}
          onSelectMoment={handleOpenReplay}
        />
      )}

      {view === 'replay' && selectedMoment && (
        <MomentReplayScreen
          record={record}
          moment={selectedMoment}
          language={language}
          onBack={() => setView('timeline')}
          onRepeatInVR={(rec, moment) => {
            const setup = buildSetupFromRecord(rec, false)
            if (typeof moment.slideIndex === 'number' && setup.topics[moment.slideIndex]) {
              // Put target moment topic first so VR starts directly on that moment
              const reordered = [
                setup.topics[moment.slideIndex],
                ...setup.topics.filter((_, idx) => idx !== moment.slideIndex),
              ]
              onLaunchVRWithSetup({ ...setup, topics: reordered })
            } else {
              onLaunchVRWithSetup(setup)
            }
          }}
        />
      )}

      {view === 'compare' && (
        <AttemptComparisonScreen
          current={record}
          allSessions={allSessions}
          language={language}
          onBack={() => setView('report')}
        />
      )}
    </section>
  )
}

import { useMemo, useState } from 'react'
import { translations } from '../lib/i18n'
import type { AppLanguage, PracticeType, SessionRecord } from '../types/stagera'

interface SessionHistoryScreenProps {
  sessions: SessionRecord[]
  language: AppLanguage
  onOpenReport: (record: SessionRecord) => void
  onRenameSession: (sessionId: string, newTitle: string) => Promise<void>
  onDeleteSession: (sessionId: string) => Promise<void>
}

export function SessionHistoryScreen({
  sessions,
  language,
  onOpenReport,
  onRenameSession,
  onDeleteSession,
}: SessionHistoryScreenProps) {
  const homeT = translations[language].home
  const t = translations[language].step3.history
  const progressT = translations[language].step3.progress

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<PracticeType | 'all'>('all')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions
      .filter((s) => (typeFilter === 'all' ? true : s.practiceType === typeFilter))
      .filter((s) => (!q ? true : s.title.toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [query, sessions, typeFilter])

  return (
    <>
      <h1 className="screen-title">{homeT.historyTitle}</h1>
      <p className="screen-subtitle">{homeT.historySubtitle}</p>

      <div className="history-filters">
        <input
          id="history-search-input"
          type="search"
          className="text-input"
          value={query}
          placeholder={t.searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          id="history-type-filter"
          className="text-input filter-select"
          aria-label={progressT.filterAllTypes}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as PracticeType | 'all')}
        >
          <option value="all">{progressT.filterAllTypes}</option>
          {(['presentation', 'interview', 'pitch', 'panel'] as const).map((pt) => (
            <option key={pt} value={pt}>
              {homeT.practiceTypes[pt]}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="dash-card">
          <p className="setting-desc">{t.emptyHistory}</p>
        </div>
      ) : (
        <div className="setup-list">
          {filtered.map((s) => {
            const isRenaming = renamingId === s.id
            const isDeleting = confirmDeleteId === s.id
            return (
              <div key={s.id} className="dash-card" style={{ marginBottom: 0 }}>
                {isRenaming ? (
                  <div className="history-rename-row">
                    <input
                      type="text"
                      className="text-input"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-small"
                      onClick={() => {
                        void onRenameSession(s.id, renameDraft).then(() => setRenamingId(null))
                      }}
                    >
                      {t.saveNameBtn}
                    </button>
                    <button
                      type="button"
                      className="btn-small-ghost"
                      onClick={() => setRenamingId(null)}
                    >
                      {t.cancelBtn}
                    </button>
                  </div>
                ) : (
                  <div className="dash-card-header">
                    <h2 className="dash-card-title">{s.title}</h2>
                    <span className="dash-card-meta">{s.wpm} WPM</span>
                  </div>
                )}

                <div className="setup-row-sub" style={{ marginBottom: 10 }}>
                  <span>{homeT.practiceTypes[s.practiceType]}</span>
                  <span>·</span>
                  <span>{homeT.venues[s.venue]}</span>
                  <span>·</span>
                  <span>
                    {s.fillerCount} {homeT.metricFillers.toLowerCase()}
                  </span>
                  {s.coachedMode && <span className="tag-coached">{homeT.coachedTag}</span>}
                </div>

                <div className="history-card-actions">
                  <button
                    type="button"
                    className="btn-small"
                    onClick={() => onOpenReport(s)}
                  >
                    {homeT.viewReport}
                  </button>
                  <button
                    type="button"
                    className="btn-small-ghost"
                    onClick={() => {
                      setRenamingId(s.id)
                      setRenameDraft(s.title)
                      setConfirmDeleteId(null)
                    }}
                  >
                    {t.renameBtn}
                  </button>

                  {isDeleting ? (
                    <button
                      type="button"
                      className="btn-remove-inline"
                      onClick={() => {
                        void onDeleteSession(s.id).then(() => setConfirmDeleteId(null))
                      }}
                    >
                      {t.confirmDeleteBtn}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-remove-inline"
                      onClick={() => setConfirmDeleteId(s.id)}
                    >
                      {t.deleteBtn}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

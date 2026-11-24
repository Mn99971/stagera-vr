import { useMemo, useState } from 'react'
import { translations } from '../lib/i18n'
import {
  buildSetupFromRecord,
  hasTwoConsecutiveTargetHits,
  loadUserTargets,
  saveUserTargets,
  type UserTargets,
} from '../lib/sessionStore'
import type {
  AppLanguage,
  PracticeType,
  SessionRecord,
  SessionSetup,
} from '../types/stagera'

interface ProgressDashboardScreenProps {
  sessions: SessionRecord[]
  language: AppLanguage
  onRaiseDifficulty: (setup: SessionSetup) => void
}

type DateRangeFilter = '7d' | '30d' | 'all'

function TrendSvgChart({
  title,
  values,
  unit,
  color,
}: {
  title: string
  values: number[]
  unit: string
  color: string
}) {
  const width = 320
  const height = 84
  const padX = 16
  const padY = 14
  const minVal = Math.min(...values, 0)
  const maxVal = Math.max(...values, minVal + 1)
  const range = Math.max(1, maxVal - minVal)

  const points = values.map((v, idx) => {
    const x =
      values.length === 1
        ? width / 2
        : padX + (idx / (values.length - 1)) * (width - padX * 2)
    const y = height - padY - ((v - minVal) / range) * (height - padY * 2)
    return { x, y, v }
  })

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const latest = values[values.length - 1] ?? 0

  return (
    <div className="trend-chart-card">
      <div className="dash-card-header" style={{ marginBottom: 6 }}>
        <span className="dash-card-title" style={{ fontSize: 13.5 }}>
          {title}
        </span>
        <span className="wizard-type-pill">
          {latest} {unit}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="trend-svg"
        role="img"
        aria-label={`${title}: ${values.join(', ')}`}
      >
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke="#cbd5e1"
          strokeWidth="1"
        />
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polyline}
          />
        )}
        {points.map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r="4" fill={color} />
        ))}
      </svg>
    </div>
  )
}

export function ProgressDashboardScreen({
  sessions,
  language,
  onRaiseDifficulty,
}: ProgressDashboardScreenProps) {
  const homeT = translations[language].home
  const t = translations[language].step3.progress

  const [typeFilter, setTypeFilter] = useState<PracticeType | 'all'>('all')
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all')
  const [targets, setTargets] = useState<UserTargets>(() => loadUserTargets())
  const [savedToast, setSavedToast] = useState(false)

  const filtered = useMemo(() => {
    const now = Date.now()
    return sessions
      .filter((s) => (typeFilter === 'all' ? true : s.practiceType === typeFilter))
      .filter((s) => {
        if (dateRange === 'all') return true
        const ageMs = now - new Date(s.createdAt).getTime()
        return dateRange === '7d' ? ageMs <= 7 * 86400000 : ageMs <= 30 * 86400000
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [dateRange, sessions, typeFilter])

  const readyForNextLevel = useMemo(
    () => hasTwoConsecutiveTargetHits(filtered, targets),
    [filtered, targets],
  )

  const latestSession = filtered[filtered.length - 1] ?? sessions[0] ?? null

  const handleSaveTargets = () => {
    saveUserTargets(targets)
    setSavedToast(true)
    window.setTimeout(() => setSavedToast(false), 2000)
  }

  return (
    <>
      <h1 className="screen-title">{homeT.progressTitle}</h1>
      <p className="screen-subtitle">{homeT.progressSubtitle}</p>

      {/* Auto-suggested harder level nudge after 2 consecutive target-hitting sessions (FR-25) */}
      {readyForNextLevel && latestSession && (
        <div id="progress-level-up-nudge" className="level-up-nudge" role="status">
          <div>
            <strong>{t.nudgeTitle}</strong>
            <p>{t.nudgeDesc}</p>
          </div>
          <button
            id="progress-raise-difficulty-btn"
            type="button"
            className="btn-small"
            onClick={() => onRaiseDifficulty(buildSetupFromRecord(latestSession, true))}
          >
            {t.nudgeCta}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="filter-row">
        <select
          id="progress-type-filter"
          className="text-input filter-select"
          aria-label={t.filterAllTypes}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as PracticeType | 'all')}
        >
          <option value="all">{t.filterAllTypes}</option>
          {(['presentation', 'interview', 'pitch', 'panel'] as const).map((pt) => (
            <option key={pt} value={pt}>
              {homeT.practiceTypes[pt]}
            </option>
          ))}
        </select>

        <div className="range-pills" role="group">
          {(
            [
              { id: '7d', label: t.range7d },
              { id: '30d', label: t.range30d },
              { id: 'all', label: t.rangeAll },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              className={`range-pill-btn ${dateRange === r.id ? 'active' : ''}`}
              onClick={() => setDateRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Trend Charts */}
      {filtered.length === 0 ? (
        <div className="dash-card">
          <p className="setting-desc">{t.noMatchingSessions}</p>
        </div>
      ) : (
        <div className="trend-charts-stack">
          <TrendSvgChart
            title={t.chartWpm}
            values={filtered.map((s) => s.wpm)}
            unit="WPM"
            color="#1d4ed8"
          />
          <TrendSvgChart
            title={t.chartFillers}
            values={filtered.map((s) => s.fillerCount)}
            unit=""
            color="#d97706"
          />
          <TrendSvgChart
            title={t.chartTopics}
            values={filtered.map((s) =>
              Math.round((s.topicsCovered / Math.max(1, s.topicsTotal)) * 100),
            )}
            unit="%"
            color="#0f766e"
          />
        </div>
      )}

      {/* Editable Personal Targets */}
      <div className="dash-card" style={{ marginBottom: 0 }}>
        <div className="dash-card-header">
          <h2 className="dash-card-title">{t.targetsTitle}</h2>
          {savedToast && <span className="tag-coached">{t.targetsSaved}</span>}
        </div>
        <div className="targets-grid">
          <label className="target-field">
            <span>{t.targetWpmMin}</span>
            <input
              type="number"
              min={80}
              max={180}
              className="text-input"
              value={targets.wpmMin}
              onChange={(e) =>
                setTargets((prev) => ({ ...prev, wpmMin: Number(e.target.value) || 120 }))
              }
            />
          </label>
          <label className="target-field">
            <span>{t.targetWpmMax}</span>
            <input
              type="number"
              min={100}
              max={220}
              className="text-input"
              value={targets.wpmMax}
              onChange={(e) =>
                setTargets((prev) => ({ ...prev, wpmMax: Number(e.target.value) || 150 }))
              }
            />
          </label>
          <label className="target-field">
            <span>{t.targetMaxFillers}</span>
            <input
              type="number"
              min={0}
              max={30}
              className="text-input"
              value={targets.maxFillers}
              onChange={(e) =>
                setTargets((prev) => ({ ...prev, maxFillers: Number(e.target.value) || 0 }))
              }
            />
          </label>
          <label className="target-field">
            <span>{t.targetWeekly}</span>
            <input
              type="number"
              min={1}
              max={14}
              className="text-input"
              value={targets.weeklySessions}
              onChange={(e) =>
                setTargets((prev) => ({ ...prev, weeklySessions: Number(e.target.value) || 1 }))
              }
            />
          </label>
        </div>
        <button
          id="progress-save-targets-btn"
          type="button"
          className="btn-secondary"
          style={{ marginTop: 12 }}
          onClick={handleSaveTargets}
        >
          {t.saveTargetsBtn}
        </button>
      </div>
    </>
  )
}

import { useState } from 'react'
import { getGreeting, translations } from '../lib/i18n'
import type {
  AppLanguage,
  DashboardTab,
  SessionRecord,
  SessionSetup,
  UserProfile,
} from '../types/stagera'
import { LanguageToggle } from './LanguageToggle'
import { PrivacySettingsScreen } from './PrivacySettingsScreen'
import { ProgressDashboardScreen } from './ProgressDashboardScreen'
import { SessionHistoryScreen } from './SessionHistoryScreen'

interface HomeDashboardProps {
  profile: UserProfile
  language: AppLanguage
  savedSetups: SessionSetup[]
  sessions: SessionRecord[]
  onLanguageChange: (lang: AppLanguage) => void
  onUpdateProfile: (profile: UserProfile) => Promise<void>
  onEditProfile: () => void
  onStartNewSession: () => void
  onLaunchVR: (setup: SessionSetup) => void
  onLaunchDirectVR: (setup: SessionSetup) => void
  onOpenReport: (record?: SessionRecord) => void
  onRenameSession: (sessionId: string, newTitle: string) => Promise<void>
  onDeleteSession: (sessionId: string) => Promise<void>
  onDeleteAllRecordings: () => Promise<void>
  onSignOut: () => void
}

export function HomeDashboard({
  profile,
  language,
  savedSetups,
  sessions,
  onLanguageChange,
  onUpdateProfile,
  onEditProfile,
  onStartNewSession,
  onLaunchVR,
  onLaunchDirectVR,
  onOpenReport,
  onRenameSession,
  onDeleteSession,
  onDeleteAllRecordings,
  onSignOut,
}: HomeDashboardProps) {
  const t = translations[language].home
  const profileT = translations[language].profile
  const [activeTab, setActiveTab] = useState<DashboardTab>('home')

  const firstName = profile.fullName.trim().split(/\s+/)[0] || profile.email.split('@')[0]
  const lastSession = sessions[0] ?? null
  const totalMinutes = Math.round(
    sessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60,
  )
  const avgWpm =
    sessions.length > 0
      ? Math.round(sessions.reduce((acc, s) => acc + s.wpm, 0) / sessions.length)
      : 0

  return (
    <>
      <section className="companion-screen companion-screen--with-nav" aria-label="Home Dashboard">
        <div className="screen-header">
          <div className="stagera-brand">
            <span className="stagera-brand-mark" aria-hidden="true">
              S
            </span>
            <span>Stagera</span>
          </div>
          <LanguageToggle language={language} onChange={onLanguageChange} idPrefix="home-lang" />
        </div>

        {activeTab === 'home' && (
          <>
            <div className="dashboard-greeting">
              <h1>
                {getGreeting(language)}, {firstName}
              </h1>
              <p>
                {profileT.roles[profile.role].label}
                {profile.field ? ` · ${profile.field}` : ''} — {t.subtitle}
              </p>
            </div>

            <button
              id="home-new-session-btn"
              type="button"
              className="btn-primary"
              onClick={onStartNewSession}
            >
              <span>+ {t.newSession}</span>
            </button>

            <div className="stats-strip" aria-label={t.weeklyTitle}>
              <div className="stat-tile">
                <span className="stat-value">{sessions.length}</span>
                <span className="stat-label">{t.weeklySessions}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-value">
                  {totalMinutes} {t.minUnit}
                </span>
                <span className="stat-label">{t.weeklyMinutes}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-value">{avgWpm}</span>
                <span className="stat-label">{t.weeklyAvgWpm}</span>
              </div>
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <h2 className="dash-card-title">{t.savedSetupsTitle}</h2>
                <span className="dash-card-meta">
                  {savedSetups.length} {t.savedSetupsCount}
                </span>
              </div>
              <div className="setup-list">
                {savedSetups.map((setup) => (
                  <div key={setup.id ?? setup.title} className="setup-row">
                    <div className="setup-row-info">
                      <p className="setup-row-title">{setup.title}</p>
                      <div className="setup-row-sub">
                        <span>{t.venues[setup.venue]}</span>
                        <span>·</span>
                        <span>
                          {setup.timeLimitMinutes} {t.minUnit}
                        </span>
                        {setup.coachedMode && <span className="tag-coached">{t.coachedTag}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-small"
                      onClick={() => onLaunchVR(setup)}
                    >
                      {t.launchVr}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="dash-card" style={{ marginBottom: 0 }}>
              <div className="dash-card-header">
                <h2 className="dash-card-title">{t.lastSessionTitle}</h2>
                {lastSession && (
                  <span className="dash-card-meta">
                    {new Date(lastSession.createdAt).toLocaleDateString(
                      language === 'fr' ? 'fr-FR' : 'en-US',
                      { month: 'short', day: 'numeric' },
                    )}
                  </span>
                )}
              </div>

              {lastSession ? (
                <>
                  <p className="setup-row-title" style={{ whiteSpace: 'normal' }}>
                    {lastSession.title}
                  </p>
                  <div className="setup-row-sub">
                    <span>{t.practiceTypes[lastSession.practiceType]}</span>
                    <span>·</span>
                    <span>{t.venues[lastSession.venue]}</span>
                  </div>

                  <div className="metrics-grid">
                    <div className="metric-box">
                      <span className="metric-box-label">{t.metricWpm}</span>
                      <span className="metric-box-value">{lastSession.wpm}</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-box-label">{t.metricFillers}</span>
                      <span className="metric-box-value">{lastSession.fillerCount}</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-box-label">{t.metricEyeContact}</span>
                      <span className="metric-box-value">
                        {lastSession.eyeContactZones.centre}%
                      </span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-box-label">{t.metricTopics}</span>
                      <span className="metric-box-value">
                        {lastSession.topicsCovered}/{lastSession.topicsTotal}
                      </span>
                    </div>
                  </div>

                  <button
                    id="home-view-report-btn"
                    type="button"
                    className="btn-secondary"
                    onClick={() => onOpenReport(lastSession)}
                  >
                    {t.viewReport}
                  </button>
                </>
              ) : (
                <p className="screen-subtitle" style={{ marginBottom: 0 }}>
                  {t.noSessionsYet}
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <SessionHistoryScreen
            sessions={sessions}
            language={language}
            onOpenReport={(rec) => onOpenReport(rec)}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressDashboardScreen
            sessions={sessions}
            language={language}
            onRaiseDifficulty={onLaunchDirectVR}
          />
        )}

        {activeTab === 'settings' && (
          <PrivacySettingsScreen
            profile={profile}
            language={language}
            savedSetups={savedSetups}
            sessions={sessions}
            onLanguageChange={onLanguageChange}
            onUpdateProfile={onUpdateProfile}
            onEditProfile={onEditProfile}
            onDeleteAllRecordings={onDeleteAllRecordings}
            onSignOut={onSignOut}
          />
        )}
      </section>

      <nav className="bottom-nav" aria-label="Companion navigation">
        {(
          [
            {
              id: 'home' as const,
              label: t.navHome,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 10.5L12 3l9 7.5" />
                  <path d="M5 9.5V20h14V9.5" />
                </svg>
              ),
            },
            {
              id: 'history' as const,
              label: t.navHistory,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              ),
            },
            {
              id: 'progress' as const,
              label: t.navProgress,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 19h16" />
                  <path d="M7 15v-4" />
                  <path d="M12 15V7" />
                  <path d="M17 15v-6" />
                </svg>
              ),
            },
            {
              id: 'settings' as const,
              label: t.navSettings,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              ),
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            id={`bottom-nav-${tab.id}`}
            type="button"
            className={`bottom-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}

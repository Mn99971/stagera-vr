import { useState } from 'react'
import { translations } from '../lib/i18n'
import { exportAllSessionsSummaryPdf } from '../lib/reportExport'
import { downloadUserDataExport } from '../lib/sessionStore'
import type {
  AppLanguage,
  SessionRecord,
  SessionSetup,
  UserProfile,
} from '../types/stagera'
import { LanguageToggle } from './LanguageToggle'

interface PrivacySettingsScreenProps {
  profile: UserProfile
  language: AppLanguage
  savedSetups: SessionSetup[]
  sessions: SessionRecord[]
  onLanguageChange: (lang: AppLanguage) => void
  onUpdateProfile: (profile: UserProfile) => Promise<void>
  onEditProfile: () => void
  onDeleteAllRecordings: () => Promise<void>
  onSignOut: () => void
}

export function PrivacySettingsScreen({
  profile,
  language,
  savedSetups,
  sessions,
  onLanguageChange,
  onUpdateProfile,
  onEditProfile,
  onDeleteAllRecordings,
  onSignOut,
}: PrivacySettingsScreenProps) {
  const homeT = translations[language].home
  const profileT = translations[language].profile
  const t = translations[language].step3.privacy
  const isFr = language === 'fr'

  const [exportToast, setExportToast] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deletedNotice, setDeletedNotice] = useState(false)

  const handleToggleSetting = (
    key: 'captionsEnabled' | 'keepRecordings' | 'autoDelete30d',
  ) => {
    void onUpdateProfile({
      ...profile,
      [key]: !profile[key],
    })
  }

  const estimatedKb = Math.max(
    12,
    Math.round(
      (JSON.stringify(sessions).length + JSON.stringify(savedSetups).length) / 1024 +
        sessions.length * 42,
    ),
  )

  return (
    <>
      <h1 className="screen-title">{homeT.settingsTitle}</h1>

      <div className="dash-card">
        <div className="dash-card-header">
          <h2 className="dash-card-title">{homeT.settingsAccount}</h2>
          {profile.isDemo && <span className="tag-coached">{homeT.settingsDemoBadge}</span>}
        </div>
        <p className="setup-row-title">{profile.fullName}</p>
        <p className="setting-desc" style={{ marginBottom: 12 }}>
          {profile.email} · {profileT.roles[profile.role].label}
        </p>
        <button
          id="settings-edit-profile-btn"
          type="button"
          className="btn-small-ghost"
          onClick={onEditProfile}
        >
          {homeT.settingsEditProfile}
        </button>
      </div>

      {/* Privacy & Accessibility Toggles */}
      <div className="dash-card">
        <div className="setting-row">
          <div>
            <p className="setting-title">{homeT.settingsLanguage}</p>
          </div>
          <LanguageToggle
            language={language}
            onChange={onLanguageChange}
            idPrefix="settings-lang"
          />
        </div>

        <div className="setting-row">
          <div>
            <p className="setting-title">{homeT.settingsCaptions}</p>
            <p className="setting-desc">{homeT.settingsCaptionsDesc}</p>
          </div>
          <button
            id="settings-toggle-captions"
            type="button"
            role="switch"
            aria-checked={profile.captionsEnabled}
            className={`toggle-switch ${profile.captionsEnabled ? 'on' : ''}`}
            onClick={() => handleToggleSetting('captionsEnabled')}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="setting-row">
          <div>
            <p className="setting-title">{homeT.settingsKeepRecordings}</p>
            <p className="setting-desc">{homeT.settingsKeepRecordingsDesc}</p>
          </div>
          <button
            id="settings-toggle-recordings"
            type="button"
            role="switch"
            aria-checked={profile.keepRecordings}
            className={`toggle-switch ${profile.keepRecordings ? 'on' : ''}`}
            onClick={() => handleToggleSetting('keepRecordings')}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="setting-row">
          <div>
            <p className="setting-title">{homeT.settingsAutoDelete}</p>
            <p className="setting-desc">{homeT.settingsAutoDeleteDesc}</p>
          </div>
          <button
            id="settings-toggle-autodelete"
            type="button"
            role="switch"
            aria-checked={profile.autoDelete30d}
            className={`toggle-switch ${profile.autoDelete30d ? 'on' : ''}`}
            onClick={() => handleToggleSetting('autoDelete30d')}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <p className="privacy-security-note">{t.securityNote}</p>
      </div>

      {/* Storage Summary, Data Export & 24h Permanent Deletion (FR-27, NFR-06) */}
      <div className="dash-card">
        <h2 className="dash-card-title" style={{ marginBottom: 10 }}>
          {t.storageTitle}
        </h2>
        <div className="stats-strip" style={{ margin: '0 0 14px' }}>
          <div className="stat-tile">
            <span className="stat-value">{sessions.length}</span>
            <span className="stat-label">{t.storageSessions}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{savedSetups.length}</span>
            <span className="stat-label">{t.storageSetups}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-value">{estimatedKb} KB</span>
            <span className="stat-label">{t.storageSize}</span>
          </div>
        </div>

        <div className="privacy-actions-stack">
          <button
            id="settings-export-data-btn"
            type="button"
            className="btn-primary"
            disabled={exportingPdf}
            onClick={() => {
              setExportingPdf(true)
              void exportAllSessionsSummaryPdf(profile, sessions, language)
                .then(() => {
                  setExportToast(true)
                  window.setTimeout(() => setExportToast(false), 2600)
                })
                .finally(() => setExportingPdf(false))
            }}
          >
            {exportingPdf
              ? isFr
                ? 'Génération du PDF…'
                : 'Generating PDF…'
              : exportToast
                ? isFr
                  ? '✓ Rapport PDF téléchargé'
                  : '✓ PDF report downloaded'
                : isFr
                  ? 'Exporter mes rapports (PDF)'
                  : 'Export Session Reports (PDF)'}
          </button>

          <button
            id="settings-export-json-dev-btn"
            type="button"
            className="link-btn"
            style={{ alignSelf: 'center', fontSize: 12, opacity: 0.7 }}
            onClick={() => downloadUserDataExport(profile, savedSetups, sessions)}
          >
            {isFr ? 'Sauvegarde brute (JSON développeur)' : 'Developer raw backup (JSON)'}
          </button>

          {!confirmDeleteAll ? (
            <button
              id="settings-delete-all-btn"
              type="button"
              className="btn-danger-outline"
              onClick={() => setConfirmDeleteAll(true)}
            >
              {t.deleteAllBtn}
            </button>
          ) : (
            <div className="privacy-confirm-box" role="alert">
              <strong>{t.deleteConfirmTitle}</strong>
              <p>{t.deleteConfirmDesc}</p>
              <div className="privacy-confirm-actions">
                <button
                  id="settings-confirm-delete-all-btn"
                  type="button"
                  className="btn-remove-inline"
                  onClick={() => {
                    void onDeleteAllRecordings().then(() => {
                      setConfirmDeleteAll(false)
                      setDeletedNotice(true)
                    })
                  }}
                >
                  {t.deleteConfirmAction}
                </button>
                <button
                  type="button"
                  className="btn-small-ghost"
                  onClick={() => setConfirmDeleteAll(false)}
                >
                  {translations[language].step3.history.cancelBtn}
                </button>
              </div>
            </div>
          )}

          {deletedNotice && (
            <div className="preflight-success-banner" role="status">
              {t.deleteDoneNotice}
            </div>
          )}
        </div>
      </div>

      <button id="settings-signout-btn" type="button" className="btn-secondary" onClick={onSignOut}>
        {homeT.settingsSignOut}
      </button>
    </>
  )
}

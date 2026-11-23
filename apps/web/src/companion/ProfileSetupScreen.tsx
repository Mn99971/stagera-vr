import { useState, type FormEvent } from 'react'
import { translations } from '../lib/i18n'
import type { AppLanguage, UserProfile, UserRole } from '../types/stagera'
import { LanguageToggle } from './LanguageToggle'

interface ProfileSetupScreenProps {
  language: AppLanguage
  initialProfile: UserProfile
  onLanguageChange: (lang: AppLanguage) => void
  onSaveProfile: (profile: UserProfile) => Promise<void>
  onCancel?: () => void
}

const ROLES: UserRole[] = ['student', 'lecturer', 'job_seeker', 'professional']

export function ProfileSetupScreen({
  language,
  initialProfile,
  onLanguageChange,
  onSaveProfile,
  onCancel,
}: ProfileSetupScreenProps) {
  const t = translations[language].profile
  const [role, setRole] = useState<UserRole>(initialProfile.role)
  const [field, setField] = useState(initialProfile.field)
  const [goals, setGoals] = useState<string[]>(initialProfile.practiceGoals)
  const [difficulties, setDifficulties] = useState<string[]>(initialProfile.difficulties)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleItem = (list: string[], id: string, setter: (next: string[]) => void) => {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSaveProfile({
        ...initialProfile,
        role,
        field: field.trim(),
        practiceGoals: goals,
        difficulties,
        appLanguage: language,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="companion-screen" aria-labelledby="profile-heading">
      <div className="screen-header">
        {onCancel ? (
          <button id="profile-cancel-btn" type="button" className="back-btn" onClick={onCancel}>
            <span aria-hidden="true">←</span> {translations[language].auth.back}
          </button>
        ) : (
          <span className="step-kicker">{t.stepLabel}</span>
        )}
        <LanguageToggle language={language} onChange={onLanguageChange} idPrefix="profile-lang" />
      </div>

      <h1 id="profile-heading" className="screen-title">
        {t.heading}
      </h1>
      <p className="screen-subtitle">{t.subtitle}</p>

      <form onSubmit={handleSubmit}>
        <div className="field-group" style={{ marginBottom: 18 }}>
          <div className="section-label">
            <span>{t.languageLabel}</span>
            <LanguageToggle
              language={language}
              onChange={onLanguageChange}
              idPrefix="profile-inline-lang"
            />
          </div>
        </div>

        <p className="section-label">{t.roleLabel}</p>
        <div className="role-grid" role="radiogroup" aria-label={t.roleLabel}>
          {ROLES.map((r) => {
            const isSelected = role === r
            return (
              <button
                key={r}
                id={`profile-role-${r}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`role-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setRole(r)}
              >
                <span className="role-card-title">{t.roles[r].label}</span>
                <span className="role-card-desc">{t.roles[r].desc}</span>
              </button>
            )
          })}
        </div>

        <div className="field-group" style={{ marginBottom: 18 }}>
          <label htmlFor="profile-field" className="field-label">
            <span>{t.fieldLabel}</span>
            <span className="field-optional">{t.fieldOptional}</span>
          </label>
          <input
            id="profile-field"
            type="text"
            className="text-input"
            placeholder={t.fieldPlaceholder}
            value={field}
            onChange={(e) => setField(e.target.value)}
          />
        </div>

        <p className="section-label">{t.goalsLabel}</p>
        <p className="section-hint">{t.goalsHint}</p>
        <div className="chip-list" role="group" aria-label={t.goalsLabel}>
          {t.goalOptions.map((opt) => {
            const selected = goals.includes(opt.id)
            return (
              <button
                key={opt.id}
                id={`profile-goal-${opt.id}`}
                type="button"
                aria-pressed={selected}
                className={`chip-btn ${selected ? 'selected' : ''}`}
                onClick={() => toggleItem(goals, opt.id, setGoals)}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <p className="section-label">{t.difficultiesLabel}</p>
        <p className="section-hint">{t.difficultiesHint}</p>
        <div className="chip-list" role="group" aria-label={t.difficultiesLabel}>
          {t.difficultyOptions.map((opt) => {
            const selected = difficulties.includes(opt.id)
            return (
              <button
                key={opt.id}
                id={`profile-diff-${opt.id}`}
                type="button"
                aria-pressed={selected}
                className={`chip-btn ${selected ? 'selected' : ''}`}
                onClick={() => toggleItem(difficulties, opt.id, setDifficulties)}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {error && (
          <div className="error-alert" role="alert" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button id="profile-save-btn" type="submit" className="btn-primary" disabled={saving}>
          {saving ? t.saving : t.saveContinue}
        </button>
      </form>
    </section>
  )
}

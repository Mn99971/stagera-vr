import { useState, type FormEvent } from 'react'
import {
  isDemoMode,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  type AuthResult,
} from '../lib/auth'
import { translations } from '../lib/i18n'
import type { AppLanguage, AuthMode } from '../types/stagera'
import { LanguageToggle } from './LanguageToggle'

interface AuthScreenProps {
  language: AppLanguage
  mode: AuthMode
  onLanguageChange: (lang: AppLanguage) => void
  onModeChange: (mode: AuthMode) => void
  onBack: () => void
  onAuthSuccess: (result: AuthResult) => void
}

export function AuthScreen({
  language,
  mode,
  onLanguageChange,
  onModeChange,
  onBack,
  onAuthSuccess,
}: AuthScreenProps) {
  const t = translations[language].auth
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError(t.errEmailRequired)
      return
    }
    if (password.length < 6) {
      setError(t.errPasswordShort)
      return
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError(t.errNameRequired)
      return
    }

    setLoading(true)
    try {
      const result =
        mode === 'signup'
          ? await signUpWithEmail(trimmedEmail, password, fullName.trim())
          : await signInWithEmail(trimmedEmail, password)
      onAuthSuccess(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setLoading(true)
    try {
      const result = await signInWithGoogle(mode === 'signup')
      if (result) {
        onAuthSuccess(result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="companion-screen" aria-labelledby="auth-heading">
      <div className="screen-header">
        <button id="auth-back-btn" type="button" className="back-btn" onClick={onBack}>
          <span aria-hidden="true">←</span> {t.back}
        </button>
        <LanguageToggle language={language} onChange={onLanguageChange} idPrefix="auth-lang" />
      </div>

      <div className="segmented-tabs" role="tablist" aria-label="Authentication mode">
        <button
          id="auth-tab-signup"
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          className={`segmented-tab ${mode === 'signup' ? 'active' : ''}`}
          onClick={() => {
            setError(null)
            onModeChange('signup')
          }}
        >
          {t.signupTab}
        </button>
        <button
          id="auth-tab-login"
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={`segmented-tab ${mode === 'login' ? 'active' : ''}`}
          onClick={() => {
            setError(null)
            onModeChange('login')
          }}
        >
          {t.loginTab}
        </button>
      </div>

      <h1 id="auth-heading" className="screen-title">
        {mode === 'signup' ? t.signupHeading : t.loginHeading}
      </h1>
      <p className="screen-subtitle">{mode === 'signup' ? t.signupSubtitle : t.loginSubtitle}</p>

      {isDemoMode && (
        <div className="demo-banner" role="status">
          <strong>{t.demoBannerTitle}</strong>
          <p>{t.demoBannerDesc}</p>
        </div>
      )}

      <button
        id="auth-google-btn"
        type="button"
        className="btn-secondary"
        disabled={loading}
        onClick={handleGoogle}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
          />
        </svg>
        <span>{t.continueWithGoogle}</span>
      </button>

      <div className="divider">{t.orEmail}</div>

      <form className="form-stack" onSubmit={handleSubmit} noValidate>
        {mode === 'signup' && (
          <div className="field-group">
            <label htmlFor="auth-fullname" className="field-label">
              {t.fullNameLabel}
            </label>
            <input
              id="auth-fullname"
              type="text"
              className="text-input"
              autoComplete="name"
              placeholder={t.fullNamePlaceholder}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        )}

        <div className="field-group">
          <label htmlFor="auth-email" className="field-label">
            {t.emailLabel}
          </label>
          <input
            id="auth-email"
            type="email"
            className="text-input"
            autoComplete="email"
            placeholder={t.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label htmlFor="auth-password" className="field-label">
            {t.passwordLabel}
          </label>
          <div className="password-wrap">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              className="text-input"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder={t.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? t.hidePassword : t.showPassword}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-alert" role="alert">
            {error}
          </div>
        )}

        <button id="auth-submit-btn" type="submit" className="btn-primary" disabled={loading}>
          {loading ? t.submitting : mode === 'signup' ? t.createAccountCta : t.loginCta}
        </button>
      </form>

      <div className="auth-switch-row">
        {mode === 'signup' ? (
          <>
            {t.switchToLoginPrompt}{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setError(null)
                onModeChange('login')
              }}
            >
              {t.switchToLoginLink}
            </button>
          </>
        ) : (
          <>
            {t.switchToSignupPrompt}{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setError(null)
                onModeChange('signup')
              }}
            >
              {t.switchToSignupLink}
            </button>
          </>
        )}
      </div>
    </section>
  )
}

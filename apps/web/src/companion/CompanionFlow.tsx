import { useEffect, useState } from 'react'
import {
  isDemoMode,
  restoreSession,
  saveProfile,
  setStoredLanguage,
  signOutUser,
  STARTER_SAVED_SETUPS,
  STARTER_SESSIONS,
  STARTER_WEEKLY_STATS,
  type AuthResult,
} from '../lib/auth'
import type {
  AppLanguage,
  AuthMode,
  CompanionScreen,
  UserProfile,
  VenueType,
} from '../types/stagera'
import { AuthScreen } from './AuthScreen'
import { HomeDashboard } from './HomeDashboard'
import { ProfileSetupScreen } from './ProfileSetupScreen'
import { WelcomeScreen } from './WelcomeScreen'

interface CompanionFlowProps {
  language: AppLanguage
  onLanguageChange: (lang: AppLanguage) => void
  onLaunchVR: (venue: VenueType) => void
  onOpenReport: () => void
}

function createDraftProfile(auth: AuthResult, language: AppLanguage): UserProfile {
  return {
    id: auth.userId,
    email: auth.email,
    fullName: auth.fullName || auth.email.split('@')[0],
    role: 'student',
    field: '',
    practiceGoals: ['steady_pace', 'reduce_fillers'],
    difficulties: [],
    appLanguage: language,
    keepRecordings: true,
    autoDelete30d: false,
    captionsEnabled: true,
    isDemo: isDemoMode,
  }
}

export function CompanionFlow({
  language,
  onLanguageChange,
  onLaunchVR,
  onOpenReport,
}: CompanionFlowProps) {
  const [screen, setScreen] = useState<CompanionScreen>('welcome')
  const [authMode, setAuthMode] = useState<AuthMode>('signup')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)

  useEffect(() => {
    let active = true
    void restoreSession().then((restored) => {
      if (!active || !restored) return
      if (restored.hasProfile && restored.profile) {
        setProfile(restored.profile)
        onLanguageChange(restored.profile.appLanguage)
        setScreen('home')
      } else {
        setProfile(createDraftProfile(restored, language))
        setScreen('profile_setup')
      }
    })
    return () => {
      active = false
    }
    // Run once on mount to restore persisted auth state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLanguageChange = (nextLang: AppLanguage) => {
    setStoredLanguage(nextLang)
    onLanguageChange(nextLang)
    if (profile) {
      const updated = { ...profile, appLanguage: nextLang }
      setProfile(updated)
      if (screen === 'home') {
        void saveProfile(updated)
      }
    }
  }

  const handleAuthSuccess = (result: AuthResult) => {
    if (result.hasProfile && result.profile) {
      setProfile(result.profile)
      onLanguageChange(result.profile.appLanguage)
      setScreen('home')
    } else {
      setProfile(createDraftProfile(result, language))
      setEditingProfile(false)
      setScreen('profile_setup')
    }
  }

  const handleSaveProfile = async (nextProfile: UserProfile) => {
    const saved = await saveProfile(nextProfile)
    setProfile(saved)
    setEditingProfile(false)
    setScreen('home')
  }

  const handleUpdateProfile = async (nextProfile: UserProfile) => {
    const saved = await saveProfile(nextProfile)
    setProfile(saved)
  }

  const handleSignOut = async () => {
    await signOutUser()
    setProfile(null)
    setEditingProfile(false)
    setScreen('welcome')
  }

  return (
    <div className="companion-container">
      {screen === 'welcome' && (
        <WelcomeScreen
          language={language}
          onLanguageChange={handleLanguageChange}
          onGetStarted={() => {
            setAuthMode('signup')
            setScreen('auth')
          }}
          onAlreadyHaveAccount={() => {
            setAuthMode('login')
            setScreen('auth')
          }}
        />
      )}

      {screen === 'auth' && (
        <AuthScreen
          language={language}
          mode={authMode}
          onLanguageChange={handleLanguageChange}
          onModeChange={setAuthMode}
          onBack={() => setScreen('welcome')}
          onAuthSuccess={handleAuthSuccess}
        />
      )}

      {screen === 'profile_setup' && profile && (
        <ProfileSetupScreen
          language={language}
          initialProfile={profile}
          onLanguageChange={handleLanguageChange}
          onSaveProfile={handleSaveProfile}
          onCancel={
            editingProfile
              ? () => {
                  setEditingProfile(false)
                  setScreen('home')
                }
              : undefined
          }
        />
      )}

      {screen === 'home' && profile && (
        <HomeDashboard
          profile={profile}
          language={language}
          savedSetups={STARTER_SAVED_SETUPS}
          sessions={STARTER_SESSIONS}
          weeklyStats={STARTER_WEEKLY_STATS}
          onLanguageChange={handleLanguageChange}
          onUpdateProfile={handleUpdateProfile}
          onEditProfile={() => {
            setEditingProfile(true)
            setScreen('profile_setup')
          }}
          onLaunchVR={onLaunchVR}
          onOpenReport={onOpenReport}
          onSignOut={() => void handleSignOut()}
        />
      )}
    </div>
  )
}

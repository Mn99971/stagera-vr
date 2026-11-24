import { useEffect, useState } from 'react'
import {
  isDemoMode,
  restoreSession,
  saveProfile,
  setStoredLanguage,
  signOutUser,
  STARTER_SAVED_SETUPS,
  type AuthResult,
} from '../lib/auth'
import { loadSavedSetups, persistSavedSetup } from '../lib/savedSetups'
import type {
  AppLanguage,
  AuthMode,
  CompanionScreen,
  SessionRecord,
  SessionSetup,
  UserProfile,
} from '../types/stagera'
import { AuthScreen } from './AuthScreen'
import { ConnectHeadsetScreen } from './ConnectHeadsetScreen'
import { HomeDashboard } from './HomeDashboard'
import { ProfileSetupScreen } from './ProfileSetupScreen'
import { SessionWizard } from './SessionWizard'
import { WelcomeScreen } from './WelcomeScreen'

interface CompanionFlowProps {
  language: AppLanguage
  sessions: SessionRecord[]
  onLanguageChange: (lang: AppLanguage) => void
  onLaunchVR: (setup: SessionSetup) => void
  onOpenReport: (record?: SessionRecord) => void
  onRenameSession: (sessionId: string, newTitle: string) => Promise<void>
  onDeleteSession: (sessionId: string) => Promise<void>
  onDeleteAllRecordings: () => Promise<void>
  onUserChange?: (userId: string | undefined) => void
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
  sessions,
  onLanguageChange,
  onLaunchVR,
  onOpenReport,
  onRenameSession,
  onDeleteSession,
  onDeleteAllRecordings,
  onUserChange,
}: CompanionFlowProps) {
  const [screen, setScreen] = useState<CompanionScreen>('welcome')
  const [authMode, setAuthMode] = useState<AuthMode>('signup')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [savedSetups, setSavedSetups] = useState<SessionSetup[]>(STARTER_SAVED_SETUPS)
  const [pairingSetup, setPairingSetup] = useState<SessionSetup | null>(null)

  useEffect(() => {
    let active = true
    void restoreSession().then((restored) => {
      if (!active || !restored) return
      if (restored.hasProfile && restored.profile) {
        setProfile(restored.profile)
        onUserChange?.(restored.profile.id)
        onLanguageChange(restored.profile.appLanguage)
        setScreen('home')
      } else {
        setProfile(createDraftProfile(restored, language))
        onUserChange?.(restored.userId)
        setScreen('profile_setup')
      }
    })
    return () => {
      active = false
    }
    // Run once on mount to restore persisted auth state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!profile?.id) return
    let active = true
    void loadSavedSetups(profile.id).then((loaded) => {
      if (active) setSavedSetups(loaded)
    })
    return () => {
      active = false
    }
  }, [profile?.id])

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
    onUserChange?.(result.userId)
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
    onUserChange?.(undefined)
    setEditingProfile(false)
    setPairingSetup(null)
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
          savedSetups={savedSetups}
          sessions={sessions}
          onLanguageChange={handleLanguageChange}
          onUpdateProfile={handleUpdateProfile}
          onEditProfile={() => {
            setEditingProfile(true)
            setScreen('profile_setup')
          }}
          onStartNewSession={() => setScreen('new_session')}
          onLaunchVR={(setup) => {
            setPairingSetup(setup)
            setScreen('connect_headset')
          }}
          onLaunchDirectVR={onLaunchVR}
          onOpenReport={onOpenReport}
          onRenameSession={onRenameSession}
          onDeleteSession={onDeleteSession}
          onDeleteAllRecordings={onDeleteAllRecordings}
          onSignOut={() => void handleSignOut()}
        />
      )}

      {screen === 'new_session' && profile && (
        <SessionWizard
          language={language}
          profile={profile}
          onLanguageChange={handleLanguageChange}
          onCancel={() => setScreen('home')}
          onCompleteSetup={async (setup, sendToHeadset) => {
            const saved = await persistSavedSetup(profile.id, setup)
            setSavedSetups((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)])
            if (sendToHeadset) {
              setPairingSetup(saved)
              setScreen('connect_headset')
            } else {
              setScreen('home')
            }
          }}
        />
      )}

      {screen === 'connect_headset' && profile && pairingSetup && (
        <ConnectHeadsetScreen
          language={language}
          userId={profile.id}
          setup={pairingSetup}
          onLanguageChange={handleLanguageChange}
          onBack={() => setScreen('home')}
          onLaunchLocalVR={(setup) => onLaunchVR(setup)}
        />
      )}
    </div>
  )
}

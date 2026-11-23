import { useState } from 'react'
import { VRStage } from './vr/VRStage'
import type { VenueType } from './types/stagera'

export function App() {
  const [step, setStep] = useState<'setup' | 'vr' | 'report'>('setup')
  const [venue, setVenue] = useState<VenueType>('lecture_hall')

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Stagera VR</h1>
        <nav style={{ display: 'flex', gap: 8 }}>
          {(['setup', 'vr', 'report'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStep(tab)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #334155',
                background: step === tab ? '#2563eb' : '#1e293b',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              {tab === 'setup' ? 'Step 1: Setup' : tab === 'vr' ? 'Step 2: VR Stage' : 'Step 3: Report'}
            </button>
          ))}
        </nav>
      </header>

      {step === 'setup' && (
        <section style={{ background: '#1e293b', padding: 20, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Session Setup (Companion View)</h2>
          <label style={{ display: 'block', marginBottom: 12 }}>
            Venue:&nbsp;
            <select
              value={venue}
              onChange={(e) => setVenue(e.target.value as VenueType)}
              style={{ padding: 8, borderRadius: 6 }}
            >
              <option value="classroom">Classroom (30 seats)</option>
              <option value="lecture_hall">Lecture Hall (60 seats)</option>
              <option value="auditorium">Auditorium (200 seats)</option>
              <option value="interview_room">Interview Room (1 interviewer)</option>
              <option value="panel_room">Panel Room (3 interviewers)</option>
            </select>
          </label>
          <button
            onClick={() => setStep('vr')}
            style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer' }}
          >
            Launch VR Preview →
          </button>
        </section>
      )}

      {step === 'vr' && <VRStage venue={venue} />}

      {step === 'report' && (
        <section style={{ background: '#1e293b', padding: 20, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Session Report (Step 3 Placeholder)</h2>
          <p>Wire up Supabase sessions, WPM/filler metrics, eye-contact zones, and flagged moments timeline here.</p>
        </section>
      )}
    </main>
  )
}

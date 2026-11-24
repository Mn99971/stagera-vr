import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import * as THREE from 'three'
import { translations } from '../lib/i18n'
import type {
  AppLanguage,
  AudienceBehaviour,
  SessionSetup,
  Topic,
  VenueType,
} from '../types/stagera'
import { PauseMenu } from './PauseMenu'
import { PresenterHUD } from './PresenterHUD'
import { VRLobbyCheck } from './VRLobbyCheck'

const xrStore = createXRStore()

interface SeatTransform {
  x: number
  y: number
  z: number
  yaw: number
  phase: number
  isDistracted: boolean
  isNodder: boolean
}

function computeVenueSeats(venue: VenueType): SeatTransform[] {
  const seats: SeatTransform[] = []

  if (venue === 'interview_room') {
    seats.push({
      x: 0,
      y: 0.9,
      z: -2.6,
      yaw: 0,
      phase: 0.4,
      isDistracted: false,
      isNodder: true,
    })
    return seats
  }

  if (venue === 'panel_room') {
    const xs = [-1.4, 0, 1.4]
    xs.forEach((x, idx) => {
      seats.push({
        x,
        y: 0.9,
        z: -2.9 + (idx === 1 ? -0.15 : 0),
        yaw: -x * 0.14,
        phase: idx * 1.7,
        isDistracted: false,
        isNodder: idx !== 2,
      })
    })
    return seats
  }

  const config =
    venue === 'classroom'
      ? { count: 30, cols: 6, spacingX: 1.05, spacingZ: 1.25, startZ: -3.4, rise: 0.04, curve: 0.0 }
      : venue === 'lecture_hall'
        ? { count: 60, cols: 10, spacingX: 1.02, spacingZ: 1.25, startZ: -3.6, rise: 0.22, curve: 0.03 }
        : { count: 200, cols: 20, spacingX: 0.96, spacingZ: 1.2, startZ: -4.2, rise: 0.25, curve: 0.045 }

  for (let i = 0; i < config.count; i++) {
    const row = Math.floor(i / config.cols)
    const col = i % config.cols
    const centeredCol = col - (config.cols - 1) / 2
    const x = centeredCol * config.spacingX
    const curveOffset = Math.abs(centeredCol) * Math.abs(centeredCol) * config.curve
    const z = config.startZ - row * config.spacingZ - curveOffset
    const y = 0.78 + row * config.rise
    const yaw = Math.atan2(-x, 2.2 - z) * 0.55

    // Deterministic pseudo-random flags (40% distracted pool, 70% supportive nodders)
    const hash = (i * 2654435761) >>> 0
    const isDistracted = hash % 10 < 4
    const isNodder = hash % 10 < 7

    seats.push({
      x,
      y,
      z,
      yaw,
      phase: (i * 0.67) % (Math.PI * 2),
      isDistracted,
      isNodder,
    })
  }

  return seats
}

interface InstancedAudienceProps {
  venue: VenueType
  behaviour: AudienceBehaviour
  isPaused: boolean
  handRaisedIndex: number | null
}

function InstancedAudience({
  venue,
  behaviour,
  isPaused,
  handRaisedIndex,
}: InstancedAudienceProps) {
  const seats = useMemo(() => computeVenueSeats(venue), [venue])
  const count = seats.length

  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const headRef = useRef<THREE.InstancedMesh>(null)
  const phoneRef = useRef<THREE.InstancedMesh>(null)
  const handRef = useRef<THREE.InstancedMesh>(null)

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const simTimeRef = useRef(0)

  const distractedIndices = useMemo(
    () =>
      behaviour === 'distracted'
        ? seats.map((s, idx) => (s.isDistracted ? idx : -1)).filter((idx) => idx >= 0)
        : [],
    [behaviour, seats],
  )

  // Initial placement & per-frame subtle behaviour animation (frozen when paused)
  const applyTransforms = useCallback(
    (t: number) => {
      if (!bodyRef.current || !headRef.current) return

      for (let i = 0; i < count; i++) {
        const s = seats[i]

        // Body posture
        let bodyLeanX = 0
        if (behaviour === 'challenging') {
          bodyLeanX = -0.09
        } else if (behaviour === 'supportive') {
          bodyLeanX = 0.05
        }
        dummy.position.set(s.x, s.y, s.z)
        dummy.rotation.set(bodyLeanX, s.yaw, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        bodyRef.current.setMatrixAt(i, dummy.matrix)

        // Head animation driven by audience behaviour
        let headPitch = 0
        let headYaw = s.yaw
        let headRoll = 0

        if (behaviour === 'supportive' && s.isNodder) {
          headPitch = Math.sin(t * 2.2 + s.phase) * 0.12
        } else if (behaviour === 'attentive') {
          headYaw = s.yaw + Math.sin(t * 0.65 + s.phase) * 0.09
          headPitch = Math.sin(t * 0.9 + s.phase) * 0.03
        } else if (behaviour === 'distracted' && s.isDistracted) {
          headPitch = 0.42 + Math.sin(t * 1.1 + s.phase) * 0.04
          headYaw = s.yaw + (i % 2 === 0 ? 0.35 : -0.35)
        } else if (behaviour === 'challenging') {
          headRoll = i % 2 === 0 ? 0.11 : -0.11
          headPitch = -0.06 + Math.sin(t * 0.7 + s.phase) * 0.03
        }

        dummy.position.set(s.x, s.y + 0.56, s.z)
        dummy.rotation.set(headPitch, headYaw, headRoll)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        headRef.current.setMatrixAt(i, dummy.matrix)
      }

      bodyRef.current.instanceMatrix.needsUpdate = true
      headRef.current.instanceMatrix.needsUpdate = true

      // Glowing phones for distracted audience members (30-50%)
      if (phoneRef.current && distractedIndices.length > 0) {
        for (let k = 0; k < distractedIndices.length; k++) {
          const s = seats[distractedIndices[k]]
          dummy.position.set(s.x, s.y + 0.16, s.z + 0.34)
          dummy.rotation.set(-0.55, s.yaw, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          phoneRef.current.setMatrixAt(k, dummy.matrix)
        }
        phoneRef.current.instanceMatrix.needsUpdate = true
      }

      // Discrete raised hand cue
      if (handRef.current) {
        if (handRaisedIndex !== null && handRaisedIndex < count) {
          const s = seats[handRaisedIndex]
          dummy.position.set(s.x + 0.32, s.y + 0.72 + Math.sin(t * 3) * 0.04, s.z + 0.08)
          dummy.rotation.set(0, 0, -0.15)
          dummy.scale.set(1, 1, 1)
        } else {
          dummy.position.set(0, -10, 0)
          dummy.scale.set(0.001, 0.001, 0.001)
        }
        dummy.updateMatrix()
        handRef.current.setMatrixAt(0, dummy.matrix)
        handRef.current.instanceMatrix.needsUpdate = true
      }
    },
    [behaviour, count, distractedIndices, dummy, handRaisedIndex, seats],
  )

  useEffect(() => {
    applyTransforms(simTimeRef.current)
  }, [applyTransforms])

  useFrame((_, delta) => {
    if (isPaused) return
    simTimeRef.current += Math.min(delta, 0.05)
    applyTransforms(simTimeRef.current)
  })

  const bodyColor =
    venue === 'interview_room' || venue === 'panel_room'
      ? '#334155'
      : behaviour === 'supportive'
        ? '#475569'
        : behaviour === 'challenging'
          ? '#3b4252'
          : '#526075'

  return (
    <group>
      {/* Torso instances */}
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.22, 0.56, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.85} />
      </instancedMesh>

      {/* Head instances */}
      <instancedMesh ref={headRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.17, 10, 10]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
      </instancedMesh>

      {/* Phone glow instances when distracted */}
      {distractedIndices.length > 0 && (
        <instancedMesh
          ref={phoneRef}
          args={[undefined, undefined, distractedIndices.length]}
          frustumCulled={false}
        >
          <boxGeometry args={[0.12, 0.2, 0.02]} />
          <meshStandardMaterial
            color="#93c5fd"
            emissive="#60a5fa"
            emissiveIntensity={1.6}
          />
        </instancedMesh>
      )}

      {/* Discrete raised hand indicator */}
      <instancedMesh ref={handRef} args={[undefined, undefined, 1]} frustumCulled={false}>
        <capsuleGeometry args={[0.06, 0.34, 4, 6]} />
        <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.4} />
      </instancedMesh>
    </group>
  )
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
      if (lines.length >= maxLines - 1) break
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  return lines
}

function useSlideCanvasTexture(
  sessionTitle: string,
  activeTopic: Topic | undefined,
  nextTopic: Topic | undefined,
  slideIndex: number,
  totalSlides: number,
  isInterview: boolean,
  variant: 'projector' | 'confidence',
  remainingSeconds: number,
  briefLabel: string,
  nextUpLabel: string,
): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isConfidence = variant === 'confidence'
    ctx.fillStyle = isConfidence ? '#0f172a' : '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Top accent bar
    ctx.fillStyle = isConfidence ? '#0f766e' : '#1d4ed8'
    ctx.fillRect(0, 0, canvas.width, 14)

    // Header metadata
    ctx.fillStyle = isConfidence ? '#94a3b8' : '#475569'
    ctx.font = 'bold 28px Inter, system-ui, sans-serif'
    const counter = `${isInterview ? 'Question' : 'Slide'} ${slideIndex + 1} / ${Math.max(1, totalSlides)}`
    ctx.fillText(counter, 48, 70)

    if (isConfidence) {
      const mins = Math.floor(Math.max(0, remainingSeconds) / 60)
      const secs = Math.max(0, remainingSeconds) % 60
      const clock = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      ctx.fillStyle = remainingSeconds <= 60 ? '#fbbf24' : '#38bdf8'
      ctx.textAlign = 'right'
      ctx.font = 'bold 38px monospace'
      ctx.fillText(clock, canvas.width - 48, 72)
      ctx.textAlign = 'left'
    } else {
      ctx.textAlign = 'right'
      ctx.fillText(sessionTitle.slice(0, 32), canvas.width - 48, 70)
      ctx.textAlign = 'left'
    }

    // Active topic headline
    ctx.fillStyle = isConfidence ? '#f8fafc' : '#0f172a'
    ctx.font = '800 54px Inter, system-ui, sans-serif'
    const headline = activeTopic?.title || sessionTitle
    const lines = wrapCanvasText(ctx, headline, canvas.width - 96, 3)
    lines.forEach((line, i) => {
      ctx.fillText(line, 48, 170 + i * 68)
    })

    // Brief badge
    if (activeTopic?.brief) {
      ctx.fillStyle = '#0f766e'
      ctx.fillRect(48, 385, 130, 42)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px Inter, system-ui, sans-serif'
      ctx.fillText(briefLabel.toUpperCase(), 70, 414)
    }

    // Next up cue on confidence screen
    if (isConfidence && nextTopic) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '600 26px Inter, system-ui, sans-serif'
      ctx.fillText(`${nextUpLabel}: ${nextTopic.title.slice(0, 48)}`, 48, 466)
    }

    texture.needsUpdate = true
  }, [
    activeTopic,
    briefLabel,
    isInterview,
    nextTopic,
    nextUpLabel,
    remainingSeconds,
    sessionTitle,
    slideIndex,
    texture,
    totalSlides,
    variant,
  ])

  useEffect(() => {
    return () => texture.dispose()
  }, [texture])

  return texture
}

function VenueArchitecture({ venue }: { venue: VenueType }) {
  if (venue === 'interview_room') {
    return (
      <group>
        {/* Warm office floor & backdrop */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]}>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color="#27272a" roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.2, -5.2]}>
          <planeGeometry args={[10, 4.8]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        {/* Executive interview desk */}
        <mesh position={[0, 0.72, -1.7]}>
          <boxGeometry args={[2.6, 0.08, 1.0]} />
          <meshStandardMaterial color="#78350f" roughness={0.6} />
        </mesh>
        <mesh position={[-1.15, 0.36, -1.7]}>
          <boxGeometry args={[0.1, 0.72, 0.85]} />
          <meshStandardMaterial color="#451a03" />
        </mesh>
        <mesh position={[1.15, 0.36, -1.7]}>
          <boxGeometry args={[0.1, 0.72, 0.85]} />
          <meshStandardMaterial color="#451a03" />
        </mesh>
        {/* Interviewer laptop on desk */}
        <mesh position={[0.35, 0.78, -1.85]} rotation={[-0.2, 0.15, 0]}>
          <boxGeometry args={[0.36, 0.02, 0.24]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      </group>
    )
  }

  if (venue === 'panel_room') {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2.5]}>
          <planeGeometry args={[14, 14]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.3, -5.8]}>
          <planeGeometry args={[12, 5]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        {/* Wide panel table */}
        <mesh position={[0, 0.72, -2.0]}>
          <boxGeometry args={[4.6, 0.1, 0.95]} />
          <meshStandardMaterial color="#334155" roughness={0.6} />
        </mesh>
        {/* 3 Nameplates */}
        {[-1.4, 0, 1.4].map((x) => (
          <mesh key={x} position={[x, 0.82, -1.62]}>
            <boxGeometry args={[0.42, 0.12, 0.05]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        ))}
      </group>
    )
  }

  const floorWidth = venue === 'auditorium' ? 36 : venue === 'lecture_hall' ? 22 : 16
  const floorDepth = venue === 'auditorium' ? 34 : venue === 'lecture_hall' ? 22 : 16
  const floorColor =
    venue === 'classroom' ? '#292524' : venue === 'lecture_hall' ? '#1e293b' : '#171726'

  return (
    <group>
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -floorDepth / 2 + 4]}>
        <planeGeometry args={[floorWidth, floorDepth]} />
        <meshStandardMaterial color={floorColor} roughness={0.92} />
      </mesh>

      {/* Stage apron for auditorium & lecture hall */}
      {venue !== 'classroom' && (
        <mesh position={[0, 0.08, 1.3]}>
          <boxGeometry args={[venue === 'auditorium' ? 14 : 9, 0.16, 3.2]} />
          <meshStandardMaterial color="#334155" roughness={0.75} />
        </mesh>
      )}

      {/* Presenter lectern */}
      <mesh position={[-1.1, 0.55, 1.15]}>
        <boxGeometry args={[0.62, 1.1, 0.45]} />
        <meshStandardMaterial color="#475569" roughness={0.7} />
      </mesh>

      {/* Stepped risers for lecture hall & auditorium */}
      {(venue === 'lecture_hall' || venue === 'auditorium') &&
        Array.from({ length: venue === 'auditorium' ? 10 : 6 }, (_, row) => (
          <mesh
            key={row}
            position={[0, 0.11 + row * (venue === 'auditorium' ? 0.25 : 0.22), -3.8 - row * 1.22]}
          >
            <boxGeometry args={[venue === 'auditorium' ? 22 : 12, 0.22, 1.18]} />
            <meshStandardMaterial color="#1e293b" roughness={0.9} />
          </mesh>
        ))}
    </group>
  )
}

function XRTriggerBridge({
  isPaused,
  onPrevSlide,
  onNextSlide,
}: {
  isPaused: boolean
  onPrevSlide: () => void
  onNextSlide: () => void
}) {
  const { gl } = useThree()

  useEffect(() => {
    const xr = gl.xr
    let attachedSession: XRSession | null = null

    const onSelectStart = (event: XRInputSourceEvent) => {
      if (isPaused) return
      if (event.inputSource.handedness === 'left') {
        onPrevSlide()
      } else {
        onNextSlide()
      }
    }

    const onSessionStart = () => {
      const session = xr.getSession()
      if (session) {
        attachedSession = session
        session.addEventListener('selectstart', onSelectStart)
      }
    }

    const onSessionEnd = () => {
      if (attachedSession) {
        attachedSession.removeEventListener('selectstart', onSelectStart)
        attachedSession = null
      }
    }

    xr.addEventListener('sessionstart', onSessionStart)
    xr.addEventListener('sessionend', onSessionEnd)
    onSessionStart()

    return () => {
      xr.removeEventListener('sessionstart', onSessionStart)
      xr.removeEventListener('sessionend', onSessionEnd)
      onSessionEnd()
    }
  }, [gl, isPaused, onNextSlide, onPrevSlide])

  return null
}

interface VRStageProps {
  setup: SessionSetup
  language?: AppLanguage
  captionsEnabled?: boolean
  onBackToPreFlight?: () => void
  onEndSession?: () => void
}

export function VRStage({
  setup,
  language = 'en',
  captionsEnabled = true,
  onBackToPreFlight,
  onEndSession,
}: VRStageProps) {
  const hudT = translations[language].vr.hud

  const topics: Topic[] = useMemo(() => {
    if (setup.topics.length > 0) return setup.topics
    return [
      {
        id: 'default-topic-1',
        title: setup.title,
        brief: false,
      },
    ]
  }, [setup.title, setup.topics])

  const totalLimitSeconds = Math.max(60, setup.timeLimitMinutes * 60)

  const [inLobby, setInLobby] = useState(true)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [coveredIds, setCoveredIds] = useState<Set<string>>(() =>
    topics[0] ? new Set([topics[0].id]) : new Set(),
  )
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [panelVisible, setPanelVisible] = useState(true)
  const [hintUsed, setHintUsed] = useState(false)
  const [liveCaption, setLiveCaption] = useState(hudT.captionReady)
  const [handRaisedIndex, setHandRaisedIndex] = useState<number | null>(null)

  const remainingSeconds = Math.max(0, totalLimitSeconds - elapsedSeconds)
  const isInterview = setup.practiceType === 'interview'

  // Session timer (freezes in lobby and when paused)
  useEffect(() => {
    if (inLobby || isPaused) return
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [inLobby, isPaused])

  // Discrete raised hand interruption cue when interruptionLevel !== 'none'
  useEffect(() => {
    if (inLobby || isPaused || setup.interruptionLevel === 'none') {
      setHandRaisedIndex(null)
      return
    }
    const intervalSec =
      setup.interruptionLevel === 'high'
        ? 18
        : setup.interruptionLevel === 'medium'
          ? 28
          : 42
    if (elapsedSeconds > 0 && elapsedSeconds % intervalSec === 0) {
      const seatCount =
        setup.venue === 'interview_room'
          ? 1
          : setup.venue === 'panel_room'
            ? 3
            : setup.venue === 'classroom'
              ? 30
              : setup.venue === 'lecture_hall'
                ? 60
                : 200
      setHandRaisedIndex(Math.floor(seatCount * 0.25))
      setLiveCaption(hudT.captionHandRaised)
    } else if (elapsedSeconds % intervalSec === 6) {
      setHandRaisedIndex(null)
    }
  }, [elapsedSeconds, hudT.captionHandRaised, inLobby, isPaused, setup.interruptionLevel, setup.venue])

  const goToSlide = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(topics.length - 1, nextIndex))
      setCurrentSlideIndex(clamped)
      const topic = topics[clamped]
      if (topic) {
        setCoveredIds((prev) => {
          if (prev.has(topic.id)) return prev
          const copy = new Set(prev)
          copy.add(topic.id)
          return copy
        })
      }
    },
    [topics],
  )

  const handleNextSlide = useCallback(() => {
    goToSlide(currentSlideIndex + 1)
  }, [currentSlideIndex, goToSlide])

  const handlePrevSlide = useCallback(() => {
    goToSlide(currentSlideIndex - 1)
  }, [currentSlideIndex, goToSlide])

  const handleRestartCurrentSlide = () => {
    setIsPaused(false)
    setLiveCaption(hudT.captionReady)
  }

  const handleRestartBeginning = () => {
    setCurrentSlideIndex(0)
    setElapsedSeconds(0)
    setCoveredIds(topics[0] ? new Set([topics[0].id]) : new Set())
    setHandRaisedIndex(null)
    setLiveCaption(hudT.captionReady)
    setIsPaused(false)
  }

  const activeTopic = topics[currentSlideIndex]
  const nextTopic = topics[currentSlideIndex + 1]

  const projectorTexture = useSlideCanvasTexture(
    setup.title,
    activeTopic,
    nextTopic,
    currentSlideIndex,
    topics.length,
    isInterview,
    'projector',
    remainingSeconds,
    hudT.briefTag,
    hudT.nextUpLabel,
  )

  const confidenceTexture = useSlideCanvasTexture(
    setup.title,
    activeTopic,
    nextTopic,
    currentSlideIndex,
    topics.length,
    isInterview,
    'confidence',
    remainingSeconds,
    hudT.briefTag,
    hudT.nextUpLabel,
  )

  if (inLobby) {
    return (
      <VRLobbyCheck
        setup={setup}
        language={language}
        onEnterSession={() => setInLobby(false)}
        onBackToSetups={onBackToPreFlight}
      />
    )
  }

  return (
    <div className="vr-stage-container">
      <PresenterHUD
        setup={setup}
        language={language}
        topics={topics}
        currentSlideIndex={currentSlideIndex}
        coveredIds={coveredIds}
        elapsedSeconds={elapsedSeconds}
        remainingSeconds={remainingSeconds}
        panelVisible={panelVisible}
        isPaused={isPaused}
        captionsEnabled={captionsEnabled}
        hintUsed={hintUsed}
        liveCaption={liveCaption}
        onPrevSlide={handlePrevSlide}
        onNextSlide={handleNextSlide}
        onJumpToSlide={goToSlide}
        onTogglePanel={() => setPanelVisible((prev) => !prev)}
        onTogglePause={() => setIsPaused((prev) => !prev)}
        onEnterVR={() => xrStore.enterVR()}
        onVoiceFeedback={(msg) => setLiveCaption(msg)}
      />

      {isPaused && (
        <PauseMenu
          language={language}
          coachedMode={setup.coachedMode}
          currentTopicTitle={activeTopic?.title ?? setup.title}
          panelVisible={panelVisible}
          hintUsed={hintUsed}
          onResume={() => setIsPaused(false)}
          onRestartCurrentSlide={handleRestartCurrentSlide}
          onRestartBeginning={handleRestartBeginning}
          onTogglePanel={() => setPanelVisible((prev) => !prev)}
          onUseHint={() => setHintUsed(true)}
          onEndSession={() => {
            setIsPaused(false)
            if (onEndSession) {
              onEndSession()
            } else if (onBackToPreFlight) {
              onBackToPreFlight()
            }
          }}
        />
      )}

      {/* Stationary camera at presenter eye height — zero artificial camera movement (NFR-05) */}
      <Canvas camera={{ position: [0, 1.65, 2.2], fov: 65 }} dpr={[1, 1.5]}>
        <XR store={xrStore}>
          <XRTriggerBridge
            isPaused={isPaused}
            onPrevSlide={handlePrevSlide}
            onNextSlide={handleNextSlide}
          />

          <color attach="background" args={['#0b1120']} />
          <ambientLight intensity={0.65} />
          <directionalLight position={[4, 8, 5]} intensity={1.1} />
          <pointLight position={[0, 4.2, -1]} intensity={0.6} color="#e0f2fe" />

          <VenueArchitecture venue={setup.venue} />

          {/* Main Virtual Projector Screen */}
          <mesh
            position={
              setup.venue === 'interview_room' || setup.venue === 'panel_room'
                ? [0, 2.35, -4.8]
                : [0, 3.1, -2.6]
            }
          >
            <planeGeometry
              args={
                setup.venue === 'auditorium'
                  ? [4.6, 2.3]
                  : setup.venue === 'interview_room'
                    ? [2.6, 1.3]
                    : [3.4, 1.7]
              }
            />
            <meshBasicMaterial map={projectorTexture} />
          </mesh>

          {/* Confidence Screen mounted low facing presenter */}
          <mesh position={[0, 0.52, -0.35]} rotation={[-0.45, 0, 0]}>
            <planeGeometry args={[1.45, 0.72]} />
            <meshBasicMaterial map={confidenceTexture} />
          </mesh>

          {/* Instanced audience / interviewer avatars (NFR-01: >=72 FPS up to 200 seats) */}
          <InstancedAudience
            venue={setup.venue}
            behaviour={setup.audienceBehaviour}
            isPaused={isPaused}
            handRaisedIndex={handRaisedIndex}
          />
        </XR>
      </Canvas>
    </div>
  )
}

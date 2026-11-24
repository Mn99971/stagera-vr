import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import * as THREE from 'three'
import {
  generateAudienceQuestion,
  generateFollowUpQuestion,
  speakQuestionTTS,
  stopTTS,
  type QAQuestion,
} from '../ai/qaEngine'
import {
  getSimulatedSpeechSample,
  SpeechDeliveryAnalyzer,
} from '../ai/speechAnalyzer'
import { translations } from '../lib/i18n'
import {
  buildSessionRecord,
  createSessionId,
  OptionalAudioRecorder,
  saveSessionSnapshot,
} from '../lib/sessionRecorder'
import type {
  AppLanguage,
  AudienceBehaviour,
  FlaggedMoment,
  FlaggedMomentType,
  GazeZones,
  InterruptionLevel,
  SessionRecord,
  SessionSetup,
  Topic,
  VenueType,
} from '../types/stagera'
import { PauseMenu } from './PauseMenu'
import { PresenterHUD } from './PresenterHUD'
import { VRLobbyCheck } from './VRLobbyCheck'
import { VRQuickDebrief } from './VRQuickDebrief'

const xrStore = createXRStore()

type GazeZone = 'left' | 'centre' | 'right'
type StagePhase = 'lobby' | 'active' | 'debrief'

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

function getSeatCount(venue: VenueType): number {
  switch (venue) {
    case 'interview_room':
      return 1
    case 'panel_room':
      return 3
    case 'classroom':
      return 30
    case 'lecture_hall':
      return 60
    case 'auditorium':
      return 200
  }
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

  const applyTransforms = useCallback(
    (t: number) => {
      if (!bodyRef.current || !headRef.current) return

      for (let i = 0; i < count; i++) {
        const s = seats[i]

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

      if (handRef.current) {
        if (handRaisedIndex !== null && handRaisedIndex < count) {
          const s = seats[handRaisedIndex]
          dummy.position.set(s.x + 0.32, s.y + 0.78 + Math.sin(t * 3.5) * 0.05, s.z + 0.08)
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
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.22, 0.56, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.85} />
      </instancedMesh>

      <instancedMesh ref={headRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.17, 10, 10]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
      </instancedMesh>

      {distractedIndices.length > 0 && (
        <instancedMesh
          ref={phoneRef}
          args={[undefined, undefined, distractedIndices.length]}
          frustumCulled={false}
        >
          <boxGeometry args={[0.12, 0.2, 0.02]} />
          <meshStandardMaterial color="#93c5fd" emissive="#60a5fa" emissiveIntensity={1.6} />
        </instancedMesh>
      )}

      <instancedMesh ref={handRef} args={[undefined, undefined, 1]} frustumCulled={false}>
        <capsuleGeometry args={[0.07, 0.4, 4, 6]} />
        <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.65} />
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

    ctx.fillStyle = isConfidence ? '#0f766e' : '#1d4ed8'
    ctx.fillRect(0, 0, canvas.width, 14)

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

    ctx.fillStyle = isConfidence ? '#f8fafc' : '#0f172a'
    ctx.font = '800 54px Inter, system-ui, sans-serif'
    const headline = activeTopic?.title || sessionTitle
    const lines = wrapCanvasText(ctx, headline, canvas.width - 96, 3)
    lines.forEach((line, i) => {
      ctx.fillText(line, 48, 170 + i * 68)
    })

    if (activeTopic?.brief) {
      ctx.fillStyle = '#0f766e'
      ctx.fillRect(48, 385, 130, 42)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px Inter, system-ui, sans-serif'
      ctx.fillText(briefLabel.toUpperCase(), 70, 414)
    }

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
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]}>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color="#27272a" roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.2, -5.2]}>
          <planeGeometry args={[10, 4.8]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
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
        <mesh position={[0, 0.72, -2.0]}>
          <boxGeometry args={[4.6, 0.1, 0.95]} />
          <meshStandardMaterial color="#334155" roughness={0.6} />
        </mesh>
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -floorDepth / 2 + 4]}>
        <planeGeometry args={[floorWidth, floorDepth]} />
        <meshStandardMaterial color={floorColor} roughness={0.92} />
      </mesh>

      {venue !== 'classroom' && (
        <mesh position={[0, 0.08, 1.3]}>
          <boxGeometry args={[venue === 'auditorium' ? 14 : 9, 0.16, 3.2]} />
          <meshStandardMaterial color="#334155" roughness={0.75} />
        </mesh>
      )}

      <mesh position={[-1.1, 0.55, 1.15]}>
        <boxGeometry args={[0.62, 1.1, 0.45]} />
        <meshStandardMaterial color="#475569" roughness={0.7} />
      </mesh>

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

const MAX_DESKTOP_YAW = 1.15
const MAX_DESKTOP_PITCH_UP = 0.45
const MAX_DESKTOP_PITCH_DOWN = -0.55

function DesktopMouseLook({
  isPaused,
  onXRPresentingChange,
}: {
  isPaused: boolean
  onXRPresentingChange: (presenting: boolean) => void
}) {
  const { camera, gl } = useThree()
  const yawRef = useRef(0)
  const pitchRef = useRef(0)
  const draggingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const dom = gl.domElement
    const xr = gl.xr

    const syncRotation = () => {
      if (xr.isPresenting) return
      camera.rotation.order = 'YXZ'
      camera.rotation.y = yawRef.current
      camera.rotation.x = pitchRef.current
      camera.rotation.z = 0
    }

    const onPointerDown = (e: PointerEvent) => {
      if (xr.isPresenting || isPaused || e.button !== 0) return
      draggingRef.current = true
      lastPosRef.current = { x: e.clientX, y: e.clientY }
      dom.style.cursor = 'grabbing'
      try {
        dom.setPointerCapture(e.pointerId)
      } catch {
        // Ignore
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current || xr.isPresenting || isPaused) return
      const dx = e.clientX - lastPosRef.current.x
      const dy = e.clientY - lastPosRef.current.y
      lastPosRef.current = { x: e.clientX, y: e.clientY }

      yawRef.current = Math.max(
        -MAX_DESKTOP_YAW,
        Math.min(MAX_DESKTOP_YAW, yawRef.current + dx * 0.0045),
      )
      pitchRef.current = Math.max(
        MAX_DESKTOP_PITCH_DOWN,
        Math.min(MAX_DESKTOP_PITCH_UP, pitchRef.current + dy * 0.0038),
      )
      syncRotation()
    }

    const endDrag = (e: PointerEvent) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      dom.style.cursor = 'grab'
      try {
        dom.releasePointerCapture(e.pointerId)
      } catch {
        // Ignore
      }
    }

    const onDoubleClick = () => {
      if (xr.isPresenting || isPaused) return
      yawRef.current = 0
      pitchRef.current = 0
      syncRotation()
    }

    const onSessionStart = () => {
      draggingRef.current = false
      dom.style.cursor = 'default'
      onXRPresentingChange(true)
    }

    const onSessionEnd = () => {
      dom.style.cursor = 'grab'
      onXRPresentingChange(false)
      syncRotation()
    }

    dom.style.cursor = xr.isPresenting ? 'default' : 'grab'
    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', endDrag)
    dom.addEventListener('pointercancel', endDrag)
    dom.addEventListener('dblclick', onDoubleClick)
    xr.addEventListener('sessionstart', onSessionStart)
    xr.addEventListener('sessionend', onSessionEnd)

    return () => {
      dom.style.cursor = 'default'
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', endDrag)
      dom.removeEventListener('pointercancel', endDrag)
      dom.removeEventListener('dblclick', onDoubleClick)
      xr.removeEventListener('sessionstart', onSessionStart)
      xr.removeEventListener('sessionend', onSessionEnd)
    }
  }, [camera, gl, isPaused, onXRPresentingChange])

  return null
}

/**
 * Head-Gaze Zone Tracker (FR-16): reads active camera world direction every frame
 * (works identically with Quest 3 XR headset tracking and Desktop Mouse Look).
 */
function CameraGazeTracker({
  isPaused,
  dwellRef,
  onZoneChange,
}: {
  isPaused: boolean
  dwellRef: React.MutableRefObject<{ left: number; centre: number; right: number }>
  onZoneChange: (zone: GazeZone) => void
}) {
  const { camera } = useThree()
  const dirVec = useMemo(() => new THREE.Vector3(), [])
  const lastZoneRef = useRef<GazeZone>('centre')

  useFrame((_, delta) => {
    if (isPaused) return
    const dt = Math.min(delta, 0.1)
    camera.getWorldDirection(dirVec)
    // Looking toward -Z: negative x = audience left, positive x = audience right
    const yawRad = Math.atan2(-dirVec.x, -dirVec.z)
    const zone: GazeZone = yawRad > 0.25 ? 'left' : yawRad < -0.25 ? 'right' : 'centre'
    dwellRef.current[zone] += dt

    if (zone !== lastZoneRef.current) {
      lastZoneRef.current = zone
      onZoneChange(zone)
    }
  })

  return null
}

function raiseDifficultySetup(current: SessionSetup): SessionSetup {
  const behaviourOrder: AudienceBehaviour[] = [
    'supportive',
    'attentive',
    'distracted',
    'challenging',
  ]
  const interruptionOrder: InterruptionLevel[] = ['none', 'low', 'medium', 'high']
  const nextBehaviourIdx = Math.min(
    behaviourOrder.length - 1,
    behaviourOrder.indexOf(current.audienceBehaviour) + 1,
  )
  const nextIntIdx = Math.min(
    interruptionOrder.length - 1,
    interruptionOrder.indexOf(current.interruptionLevel) + 1,
  )
  return {
    ...current,
    audienceBehaviour: behaviourOrder[nextBehaviourIdx],
    interruptionLevel: interruptionOrder[nextIntIdx],
    followUps: true,
    coachedMode: false,
  }
}

interface VRStageProps {
  setup: SessionSetup
  userId?: string
  language?: AppLanguage
  captionsEnabled?: boolean
  onBackToPreFlight?: () => void
  onEndSession?: (record: SessionRecord) => void
}

export function VRStage({
  setup: initialSetup,
  userId = 'demo-user',
  language = 'en',
  captionsEnabled = true,
  onBackToPreFlight,
  onEndSession,
}: VRStageProps) {
  const hudT = translations[language].vr.hud

  const [activeSetup, setActiveSetup] = useState<SessionSetup>(initialSetup)
  useEffect(() => {
    setActiveSetup(initialSetup)
  }, [initialSetup])

  const topics: Topic[] = useMemo(() => {
    if (activeSetup.topics.length > 0) return activeSetup.topics
    return [{ id: 'default-topic-1', title: activeSetup.title, brief: false }]
  }, [activeSetup.title, activeSetup.topics])

  const totalLimitSeconds = Math.max(60, activeSetup.timeLimitMinutes * 60)
  const isInterview = activeSetup.practiceType === 'interview'

  const [phase, setPhase] = useState<StagePhase>('lobby')
  const [sessionId, setSessionId] = useState<string>(() => createSessionId())
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
  const [gazeZone, setGazeZone] = useState<GazeZone>('centre')
  const [isXRPresenting, setIsXRPresenting] = useState(false)

  // Speech delivery, Q&A, Auto-flagging & Debrief state
  const analyzerRef = useRef<SpeechDeliveryAnalyzer>(new SpeechDeliveryAnalyzer())
  const audioRecorderRef = useRef<OptionalAudioRecorder>(new OptionalAudioRecorder())
  const gazeDwellRef = useRef<{ left: number; centre: number; right: number }>({
    left: 0,
    centre: 1,
    right: 0,
  })
  const slideEnteredAtRef = useRef<number>(0)
  const simSpeechIndexRef = useRef<number>(0)
  const qaCountRef = useRef<number>(0)

  const [liveWpm, setLiveWpm] = useState(0)
  const [liveFillers, setLiveFillers] = useState(0)
  const [flaggedMoments, setFlaggedMoments] = useState<FlaggedMoment[]>([])
  const [activeQuestion, setActiveQuestion] = useState<QAQuestion | null>(null)
  const [answerSeconds, setAnswerSeconds] = useState(0)
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null)
  const [completedRecord, setCompletedRecord] = useState<SessionRecord | null>(null)

  const remainingSeconds = Math.max(0, totalLimitSeconds - elapsedSeconds)

  const addFlag = useCallback(
    (
      momentType: FlaggedMomentType,
      label: string,
      opts?: { transcriptExcerpt?: string; aiTip?: string; slideIndex?: number },
    ) => {
      const flag: FlaggedMoment = {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `flag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        timestampSeconds: elapsedSeconds,
        momentType,
        label,
        transcriptExcerpt: opts?.transcriptExcerpt,
        aiTip: opts?.aiTip,
        slideIndex: opts?.slideIndex ?? currentSlideIndex,
      }
      setFlaggedMoments((prev) => [...prev, flag])
    },
    [currentSlideIndex, elapsedSeconds],
  )

  const computeGazeZones = useCallback((): GazeZones => {
    const { left, centre, right } = gazeDwellRef.current
    const total = Math.max(0.001, left + centre + right)
    const leftPct = Math.round((left / total) * 100)
    const rightPct = Math.round((right / total) * 100)
    const centrePct = Math.max(0, 100 - leftPct - rightPct)
    return { left: leftPct, centre: centrePct, right: rightPct }
  }, [])

  const snapshotCurrentRecord = useCallback((): SessionRecord => {
    const speech = analyzerRef.current.getSnapshot(Math.max(1, elapsedSeconds))
    return buildSessionRecord({
      sessionId,
      setup: activeSetup,
      language,
      durationSeconds: elapsedSeconds,
      wpm: speech.overallWpm,
      fillerCount: speech.fillerCount,
      fillerBreakdown: speech.fillerBreakdown,
      eyeContactZones: computeGazeZones(),
      topicsCovered: coveredIds.size,
      topicsTotal: topics.length,
      iCount: speech.iCount,
      weCount: speech.weCount,
      hintUsed,
      transcript: speech.transcript,
      flaggedMoments,
    })
  }, [
    activeSetup,
    computeGazeZones,
    coveredIds.size,
    elapsedSeconds,
    flaggedMoments,
    hintUsed,
    language,
    sessionId,
    topics.length,
  ])

  // Start optional audio recording when entering active stage; stop on exit/unmount
  useEffect(() => {
    if (phase === 'active') {
      void audioRecorderRef.current.start()
    } else {
      audioRecorderRef.current.stop()
      stopTTS()
    }
    return () => {
      audioRecorderRef.current.stop()
      stopTTS()
    }
  }, [phase])

  // Session timer & Q&A answer timer (freeze when paused or outside active phase)
  useEffect(() => {
    if (phase !== 'active' || isPaused) return
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
      setAnswerSeconds((prev) => (activeQuestion ? prev + 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [activeQuestion, isPaused, phase])

  // 30-second auto-save to Supabase `sessions` & `flagged_moments` (localStorage fallback, FR-18, NFR-08)
  useEffect(() => {
    if (phase !== 'active' || isPaused || elapsedSeconds === 0 || elapsedSeconds % 30 !== 0) {
      return
    }
    const record = snapshotCurrentRecord()
    void saveSessionSnapshot(userId, record).then(() => {
      const now = new Date()
      setLastAutoSavedAt(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
      )
    })
  }, [elapsedSeconds, isPaused, phase, snapshotCurrentRecord, userId])

  const triggerQuestion = useCallback(() => {
    const activeTopic = topics[currentSlideIndex]
    const question = generateAudienceQuestion(
      activeSetup,
      activeTopic,
      currentSlideIndex,
      language,
      qaCountRef.current,
    )
    qaCountRef.current += 1
    const seatCount = getSeatCount(activeSetup.venue)
    setHandRaisedIndex(Math.floor(seatCount * 0.25))
    setActiveQuestion(question)
    setAnswerSeconds(0)
    setLiveCaption(`${question.speakerLabel}: “${question.text}”`)
    speakQuestionTTS(question.text, language)
    addFlag('question', `${question.speakerLabel}: ${question.topicTitle}`, {
      transcriptExcerpt: question.text,
      aiTip:
        language === 'fr'
          ? 'Répondez en moins de 45 secondes avec un exemple concret, puis revenez à votre diapositive.'
          : 'Aim to answer in under 45 seconds with one concrete example, then bridge back to your slide.',
      slideIndex: currentSlideIndex,
    })
  }, [activeSetup, addFlag, currentSlideIndex, language, topics])

  // Automatic contextual Q&A interruptions at configured interruptionLevel rate
  useEffect(() => {
    if (
      phase !== 'active' ||
      isPaused ||
      activeQuestion !== null ||
      activeSetup.interruptionLevel === 'none'
    ) {
      return
    }
    const intervalSec =
      activeSetup.interruptionLevel === 'high'
        ? 35
        : activeSetup.interruptionLevel === 'medium'
          ? 55
          : 85
    if (elapsedSeconds > 0 && elapsedSeconds % intervalSec === 0) {
      triggerQuestion()
    }
  }, [activeQuestion, activeSetup.interruptionLevel, elapsedSeconds, isPaused, phase, triggerQuestion])

  const handleIngestTranscript = useCallback(
    (text: string) => {
      const result = analyzerRef.current.ingestChunk(
        text,
        elapsedSeconds,
        activeSetup.practiceType,
      )
      if (!result) return

      setLiveWpm(result.snapshot.rollingWpm)
      setLiveFillers(result.snapshot.fillerCount)
      setLiveCaption(text)

      if (result.detectedLongPause) {
        addFlag(
          'long_pause',
          language === 'fr'
            ? `Pause longue (${result.pauseDurationSeconds}s)`
            : `Long pause (${result.pauseDurationSeconds}s)`,
          {
            transcriptExcerpt: text,
            aiTip:
              language === 'fr'
                ? 'Utilisez une courte phrase de transition pour garder le fil.'
                : 'Use a brief bridging phrase to keep momentum after a pause.',
          },
        )
      }

      if (result.detectedPaceSpike) {
        addFlag(
          'pace_spike',
          language === 'fr'
            ? `Accélération du débit (${result.snapshot.rollingWpm} m/min)`
            : `Pace spike (${result.snapshot.rollingWpm} WPM)`,
          {
            transcriptExcerpt: text,
            aiTip:
              language === 'fr'
                ? 'Ralentissez légèrement et marquez une respiration entre vos phrases.'
                : 'Ease back toward 120–150 WPM by pausing briefly between key points.',
          },
        )
      }

      if (result.detectedWeOwnership) {
        addFlag(
          'we_ownership',
          language === 'fr'
            ? 'Formulation « nous » plutôt que « je »'
            : 'Used “we” instead of “I” ownership',
          {
            transcriptExcerpt: text,
            aiTip:
              language === 'fr'
                ? 'Précisez votre contribution personnelle avec « je ».'
                : 'Clarify what YOU personally built or decided using “I” statements.',
          },
        )
      }
    },
    [activeSetup.practiceType, addFlag, elapsedSeconds, language],
  )

  const handleSimulateSpeech = useCallback(() => {
    const activeTopic = topics[currentSlideIndex]
    const sample = getSimulatedSpeechSample(
      activeSetup.practiceType,
      activeTopic?.title ?? activeSetup.title,
      simSpeechIndexRef.current,
      language,
    )
    simSpeechIndexRef.current += 1
    handleIngestTranscript(sample)
  }, [activeSetup.practiceType, activeSetup.title, currentSlideIndex, handleIngestTranscript, language, topics])

  const goToSlide = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(topics.length - 1, nextIndex))
      if (clamped !== currentSlideIndex) {
        const dwellOnPrev = elapsedSeconds - slideEnteredAtRef.current
        if (dwellOnPrev < 2 && elapsedSeconds > 2) {
          const prevTopic = topics[currentSlideIndex]
          addFlag(
            'skipped_slide',
            language === 'fr'
              ? `Diapo passée rapidement : ${prevTopic?.title ?? currentSlideIndex + 1}`
              : `Quickly skipped slide: ${prevTopic?.title ?? currentSlideIndex + 1}`,
            {
              aiTip:
                language === 'fr'
                  ? 'Prenez quelques secondes pour résumer le point clé avant de changer de diapositive.'
                  : 'Spend a few seconds summarizing the core takeaway before advancing.',
              slideIndex: currentSlideIndex,
            },
          )
        }
        slideEnteredAtRef.current = elapsedSeconds
      }

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
    [addFlag, currentSlideIndex, elapsedSeconds, language, topics],
  )

  const handleNextSlide = useCallback(() => {
    goToSlide(currentSlideIndex + 1)
  }, [currentSlideIndex, goToSlide])

  const handlePrevSlide = useCallback(() => {
    goToSlide(currentSlideIndex - 1)
  }, [currentSlideIndex, goToSlide])

  const handleFinishAnswer = () => {
    if (!activeQuestion) return
    if (activeSetup.followUps && !activeQuestion.isFollowUp) {
      const followUp = generateFollowUpQuestion(activeQuestion, activeSetup, language)
      setActiveQuestion(followUp)
      setAnswerSeconds(0)
      setLiveCaption(`${followUp.speakerLabel}: “${followUp.text}”`)
      speakQuestionTTS(followUp.text, language)
    } else {
      handleReturnToSlide()
    }
  }

  const handleReturnToSlide = () => {
    stopTTS()
    setActiveQuestion(null)
    setAnswerSeconds(0)
    setHandRaisedIndex(null)
    setLiveCaption(hudT.captionReady)
  }

  const resetSessionRun = (startSlide = 0, nextSetup?: SessionSetup) => {
    if (nextSetup) setActiveSetup(nextSetup)
    const targetTopics = (nextSetup?.topics.length ? nextSetup.topics : topics)
    const safeSlide = Math.max(0, Math.min(targetTopics.length - 1, startSlide))
    analyzerRef.current.reset()
    gazeDwellRef.current = { left: 0, centre: 1, right: 0 }
    slideEnteredAtRef.current = 0
    simSpeechIndexRef.current = 0
    qaCountRef.current = 0
    setSessionId(createSessionId())
    setCurrentSlideIndex(safeSlide)
    setCoveredIds(targetTopics[safeSlide] ? new Set([targetTopics[safeSlide].id]) : new Set())
    setElapsedSeconds(0)
    setLiveWpm(0)
    setLiveFillers(0)
    setFlaggedMoments([])
    setActiveQuestion(null)
    setAnswerSeconds(0)
    setHandRaisedIndex(null)
    setHintUsed(false)
    setLastAutoSavedAt(null)
    setCompletedRecord(null)
    setLiveCaption(hudT.captionReady)
    setIsPaused(false)
    setPhase('active')
  }

  const handleEndSessionToDebrief = async () => {
    stopTTS()
    setIsPaused(false)
    const finalRecord = snapshotCurrentRecord()
    await saveSessionSnapshot(userId, finalRecord)
    setCompletedRecord(finalRecord)
    setPhase('debrief')
  }

  const activeTopic = topics[currentSlideIndex]
  const nextTopic = topics[currentSlideIndex + 1]

  const projectorTexture = useSlideCanvasTexture(
    activeSetup.title,
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
    activeSetup.title,
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

  if (phase === 'lobby') {
    return (
      <VRLobbyCheck
        setup={activeSetup}
        language={language}
        onEnterSession={() => setPhase('active')}
        onBackToSetups={onBackToPreFlight}
      />
    )
  }

  if (phase === 'debrief' && completedRecord) {
    return (
      <VRQuickDebrief
        record={completedRecord}
        language={language}
        onTryAgain={() => resetSessionRun(0)}
        onRepeatMoment={(slideIdx) => resetSessionRun(slideIdx)}
        onRaiseDifficulty={() => resetSessionRun(0, raiseDifficultySetup(activeSetup))}
        onOpenFullReport={(record) => {
          if (onEndSession) {
            onEndSession(record)
          } else if (onBackToPreFlight) {
            onBackToPreFlight()
          }
        }}
      />
    )
  }

  return (
    <div className="vr-stage-container">
      <PresenterHUD
        setup={activeSetup}
        language={language}
        topics={topics}
        currentSlideIndex={currentSlideIndex}
        coveredIds={coveredIds}
        elapsedSeconds={elapsedSeconds}
        remainingSeconds={remainingSeconds}
        liveWpm={liveWpm}
        liveFillers={liveFillers}
        panelVisible={panelVisible}
        isPaused={isPaused}
        isXRPresenting={isXRPresenting}
        captionsEnabled={captionsEnabled}
        hintUsed={hintUsed}
        liveCaption={liveCaption}
        lastAutoSavedAt={lastAutoSavedAt}
        activeQuestion={activeQuestion}
        answerSeconds={answerSeconds}
        onPrevSlide={handlePrevSlide}
        onNextSlide={handleNextSlide}
        onJumpToSlide={goToSlide}
        onTogglePanel={() => setPanelVisible((prev) => !prev)}
        onTogglePause={() => setIsPaused((prev) => !prev)}
        onEnterVR={() => xrStore.enterVR()}
        onVoiceFeedback={(msg) => setLiveCaption(msg)}
        onSpeechTranscript={handleIngestTranscript}
        onSimulateSpeech={handleSimulateSpeech}
        onTriggerQuestion={triggerQuestion}
        onFinishAnswer={handleFinishAnswer}
        onReturnToSlide={handleReturnToSlide}
      />

      {isPaused && (
        <PauseMenu
          language={language}
          coachedMode={activeSetup.coachedMode}
          currentTopicTitle={activeTopic?.title ?? activeSetup.title}
          panelVisible={panelVisible}
          hintUsed={hintUsed}
          onResume={() => setIsPaused(false)}
          onRestartCurrentSlide={() => {
            setIsPaused(false)
            setLiveCaption(hudT.captionReady)
          }}
          onRestartBeginning={() => resetSessionRun(0)}
          onTogglePanel={() => setPanelVisible((prev) => !prev)}
          onUseHint={() => {
            setHintUsed(true)
            addFlag(
              'hint_used',
              language === 'fr'
                ? `Indice PAR utilisé (${activeTopic?.title ?? activeSetup.title})`
                : `PAR hint used (${activeTopic?.title ?? activeSetup.title})`,
              {
                aiTip:
                  language === 'fr'
                    ? 'Réessayez cette question en mode autonome pour comparer vos performances.'
                    : 'Retry this question in Independent Mode to compare your delivery.',
              },
            )
          }}
          onEndSession={() => void handleEndSessionToDebrief()}
        />
      )}

      {!isXRPresenting && (
        <div id="vr-simulator-hint-bar" className="vr-simulator-bar" aria-live="polite">
          <span className="vr-simulator-gaze-pill">
            {hudT.gazeZoneLabel}:{' '}
            {gazeZone === 'left'
              ? hudT.gazeZoneLeft
              : gazeZone === 'right'
                ? hudT.gazeZoneRight
                : hudT.gazeZoneCentre}
          </span>
          <span className="vr-simulator-hint-text">{hudT.simulatorHint}</span>
        </div>
      )}

      {/* Stationary camera at presenter eye height — zero artificial camera movement in XR (NFR-05) */}
      <Canvas camera={{ position: [0, 1.65, 2.2], fov: 65 }} dpr={[1, 1.5]}>
        <XR store={xrStore}>
          <XRTriggerBridge
            isPaused={isPaused}
            onPrevSlide={handlePrevSlide}
            onNextSlide={handleNextSlide}
          />
          <DesktopMouseLook
            isPaused={isPaused}
            onXRPresentingChange={setIsXRPresenting}
          />
          <CameraGazeTracker
            isPaused={isPaused}
            dwellRef={gazeDwellRef}
            onZoneChange={setGazeZone}
          />

          <color attach="background" args={['#0b1120']} />
          <ambientLight intensity={0.65} />
          <directionalLight position={[4, 8, 5]} intensity={1.1} />
          <pointLight position={[0, 4.2, -1]} intensity={0.6} color="#e0f2fe" />

          <VenueArchitecture venue={activeSetup.venue} />

          {/* Main Virtual Projector Screen */}
          <mesh
            position={
              activeSetup.venue === 'interview_room' || activeSetup.venue === 'panel_room'
                ? [0, 2.35, -4.8]
                : [0, 3.1, -2.6]
            }
          >
            <planeGeometry
              args={
                activeSetup.venue === 'auditorium'
                  ? [4.6, 2.3]
                  : activeSetup.venue === 'interview_room'
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
            venue={activeSetup.venue}
            behaviour={activeSetup.audienceBehaviour}
            isPaused={isPaused}
            handRaisedIndex={handRaisedIndex}
          />
        </XR>
      </Canvas>
    </div>
  )
}

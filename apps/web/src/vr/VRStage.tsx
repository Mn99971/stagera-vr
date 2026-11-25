import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { XR, XROrigin, createXRStore } from '@react-three/xr'
import * as THREE from 'three'
import {
  generateAudienceQuestion,
  generateFollowUpQuestion,
  type QAQuestion,
} from '../ai/qaEngine'
import {
  getSimulatedSpeechSample,
  SpeechDeliveryAnalyzer,
} from '../ai/speechAnalyzer'
import { translations } from '../lib/i18n'
import {
  applyAIFeedbackToRecord,
  requestSessionAIFeedback,
} from '../lib/aiFeedback'
import { GroqLiveTranscriber } from '../lib/groqTranscriber'
import {
  generateHeadsetLobbyCode,
  subscribeHeadsetLobbyPairing,
} from '../lib/pairing'
import {
  buildSessionRecord,
  createSessionId,
  saveSessionSnapshot,
} from '../lib/sessionRecorder'
import { vrAudioEngine } from '../lib/vrAudioEngine'
import { vrMicManager, type VRMicSnapshot } from '../lib/vrMicManager'
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
import {
  VRDebriefPanel3D,
  VRFloatingLobby3D,
  VROneMinWarningBanner3D,
  VRPauseMenu3D,
  VRPodiumHUD,
  VRQuestionBubble3D,
  VRTeleprompterBoard,
} from './VRWorldUI'

/**
 * Pure Full VR store — explicitly disables `offerSession` (prevents `InvalidStateError`
 * on Meta Quest Browser and kills `immersive-ar`) and disables all AR-only features.
 * `bounded: undefined` enforces `requiredFeatures: ['local-floor']` so physical floor = y: 0.
 */
const xrStore = createXRStore({
  offerSession: false,
  enterGrantedSession: ['immersive-vr'],
  emulate: false,
  bounded: undefined,
  anchors: false,
  meshDetection: false,
  planeDetection: false,
  depthSensing: false,
  hitTest: false,
  domOverlay: false,
  handTracking: true,
  controller: true,
  hand: true,
})

type GazeZone = 'left' | 'centre' | 'right'
type StagePhase = 'lobby' | 'vr_lobby' | 'active' | 'debrief'

interface SeatTransform {
  x: number
  floorY: number
  z: number
  yaw: number
  phase: number
  isDistracted: boolean
  isNodder: boolean
  isNoteTaker: boolean
  jacketHex: string
  skinHex: string
}

// Warm, varied realistic everyday & professional clothing palette
const JACKET_PALETTE = [
  '#2c4a70', // warm navy
  '#4f6d5a', // sage olive
  '#7c3f4a', // muted burgundy
  '#52657a', // slate blue
  '#8c6a4a', // warm camel
  '#4b5563', // soft charcoal
  '#6b5b7b', // muted plum
  '#3f5e68', // teal slate
]

const SKIN_PALETTE = ['#e6be9e', '#d6a57a', '#c48a5b', '#8e572b', '#f2c894', '#b4784e']

/**
 * Real-world 1m = 1u seat coordinates relative to player spawn at (0, 0, 0) facing -Z.
 * Front row is 2.65m–3.45m away; seated head/eye height is 1.20m.
 */
function computeVenueSeats(venue: VenueType): SeatTransform[] {
  const seats: SeatTransform[] = []

  if (venue === 'interview_room') {
    seats.push({
      x: 0,
      floorY: 0,
      z: -2.65,
      yaw: 0,
      phase: 0.4,
      isDistracted: false,
      isNodder: true,
      isNoteTaker: true,
      jacketHex: '#2c4a70',
      skinHex: '#d6a57a',
    })
    return seats
  }

  if (venue === 'panel_room') {
    const xs = [-1.28, 0, 1.28]
    xs.forEach((x, idx) => {
      seats.push({
        x,
        floorY: 0,
        z: -2.85 + (idx === 1 ? -0.12 : 0),
        yaw: -x * 0.14,
        phase: idx * 1.7,
        isDistracted: false,
        isNodder: idx !== 2,
        isNoteTaker: idx === 0,
        jacketHex: JACKET_PALETTE[idx % JACKET_PALETTE.length],
        skinHex: SKIN_PALETTE[(idx * 2) % SKIN_PALETTE.length],
      })
    })
    return seats
  }

  const config =
    venue === 'classroom'
      ? { count: 30, cols: 6, spacingX: 1.02, spacingZ: 1.15, startZ: -2.95, rise: 0.0, curve: 0.0 }
      : venue === 'lecture_hall'
        ? { count: 60, cols: 10, spacingX: 0.96, spacingZ: 1.12, startZ: -3.15, rise: 0.18, curve: 0.018 }
        : { count: 200, cols: 20, spacingX: 0.90, spacingZ: 1.08, startZ: -3.45, rise: 0.20, curve: 0.022 }

  for (let i = 0; i < config.count; i++) {
    const row = Math.floor(i / config.cols)
    const col = i % config.cols
    const centeredCol = col - (config.cols - 1) / 2
    const x = centeredCol * config.spacingX
    const curveOffset = Math.abs(centeredCol) * Math.abs(centeredCol) * config.curve
    const z = config.startZ - row * config.spacingZ - curveOffset
    const floorY = row * config.rise
    const yaw = Math.atan2(-x, -z) * 0.65

    const hash = (i * 2654435761) >>> 0
    const isDistracted = hash % 10 < 4
    const isNodder = hash % 10 < 7
    const isNoteTaker = (hash >>> 2) % 5 === 0

    seats.push({
      x,
      floorY,
      z,
      yaw,
      phase: (i * 0.83) % (Math.PI * 2),
      isDistracted,
      isNodder,
      isNoteTaker,
      jacketHex: JACKET_PALETTE[hash % JACKET_PALETTE.length],
      skinHex: SKIN_PALETTE[(hash >>> 4) % SKIN_PALETTE.length],
    })
  }

  return seats
}

interface InstancedAudienceProps {
  seats: SeatTransform[]
  behaviour: AudienceBehaviour
  isPaused: boolean
  handRaisedIndex: number | null
}

/**
 * Organic, human-proportioned instanced audience (5 draw calls total for up to 200 seats = 72+ FPS).
 * Staggered breathing, occasional head turns toward speaker, nodding, and note-taking motions.
 */
function InstancedAudience({
  seats,
  behaviour,
  isPaused,
  handRaisedIndex,
}: InstancedAudienceProps) {
  const count = seats.length

  const chairRef = useRef<THREE.InstancedMesh>(null)
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const headRef = useRef<THREE.InstancedMesh>(null)
  const phoneRef = useRef<THREE.InstancedMesh>(null)
  const handRef = useRef<THREE.InstancedMesh>(null)

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tempColor = useMemo(() => new THREE.Color(), [])
  const simTimeRef = useRef(0)

  const distractedIndices = useMemo(
    () =>
      behaviour === 'distracted'
        ? seats.map((s, idx) => (s.isDistracted ? idx : -1)).filter((idx) => idx >= 0)
        : [],
    [behaviour, seats],
  )

  useEffect(() => {
    if (!bodyRef.current || !headRef.current || !chairRef.current) return
    for (let i = 0; i < count; i++) {
      const s = seats[i]
      tempColor.set(s.jacketHex)
      bodyRef.current.setColorAt(i, tempColor)
      tempColor.set(s.skinHex)
      headRef.current.setColorAt(i, tempColor)

      dummy.position.set(s.x, s.floorY + 0.54, s.z - 0.19)
      dummy.rotation.set(-0.08, s.yaw, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      chairRef.current.setMatrixAt(i, dummy.matrix)
    }
    if (bodyRef.current.instanceColor) bodyRef.current.instanceColor.needsUpdate = true
    if (headRef.current.instanceColor) headRef.current.instanceColor.needsUpdate = true
    chairRef.current.instanceMatrix.needsUpdate = true
  }, [count, dummy, seats, tempColor])

  const applyTransforms = useCallback(
    (t: number) => {
      if (!bodyRef.current || !headRef.current) return

      for (let i = 0; i < count; i++) {
        const s = seats[i]

        // Gentle staggered organic breathing & subtle posture shift
        const breath = Math.sin(t * 1.65 + s.phase * 1.9) * 0.011
        const postureSway = Math.sin(t * 0.42 + s.phase * 2.3) * 0.018

        let bodyLeanX = 0
        if (behaviour === 'challenging') {
          bodyLeanX = -0.07
        } else if (behaviour === 'supportive') {
          bodyLeanX = 0.05
        } else if (s.isNoteTaker) {
          bodyLeanX = 0.04 + Math.max(0, Math.sin(t * 0.35 + s.phase)) * 0.05
        }

        dummy.position.set(s.x, s.floorY + 0.78 + breath, s.z)
        dummy.rotation.set(bodyLeanX, s.yaw + postureSway, postureSway * 0.3)
        dummy.scale.set(1.16, 1.0 + breath * 0.8, 0.68)
        dummy.updateMatrix()
        bodyRef.current.setMatrixAt(i, dummy.matrix)

        // Organic staggered head motion (nodding, note-taking glances, speaker focus)
        const slowWave = Math.sin(t * 0.55 + s.phase)
        const noteGlance =
          s.isNoteTaker && Math.sin(t * 0.28 + s.phase * 1.7) > 0.65 ? 0.28 : 0

        let headPitch = noteGlance + Math.sin(t * 1.1 + s.phase) * 0.025
        let headYaw = s.yaw + slowWave * 0.075
        let headRoll = Math.sin(t * 0.38 + s.phase * 1.3) * 0.03

        if (behaviour === 'supportive' && s.isNodder) {
          headPitch += Math.sin(t * 2.1 + s.phase) * 0.095
        } else if (behaviour === 'distracted' && s.isDistracted) {
          headPitch = 0.36 + Math.sin(t * 1.1 + s.phase) * 0.04
          headYaw = s.yaw + (i % 2 === 0 ? 0.32 : -0.32) * (0.7 + 0.3 * Math.sin(t * 0.5 + s.phase))
        } else if (behaviour === 'challenging') {
          headRoll = (i % 2 === 0 ? 0.08 : -0.08) + Math.sin(t * 0.4 + s.phase) * 0.02
          headPitch = -0.04 + Math.sin(t * 0.7 + s.phase) * 0.025
        }

        dummy.position.set(s.x, s.floorY + 1.20 + breath * 1.15, s.z + 0.02)
        dummy.rotation.set(headPitch, headYaw, headRoll)
        dummy.scale.set(0.95, 1.12, 1.0)
        dummy.updateMatrix()
        headRef.current.setMatrixAt(i, dummy.matrix)
      }

      bodyRef.current.instanceMatrix.needsUpdate = true
      headRef.current.instanceMatrix.needsUpdate = true

      if (phoneRef.current && distractedIndices.length > 0) {
        for (let k = 0; k < distractedIndices.length; k++) {
          const s = seats[distractedIndices[k]]
          dummy.position.set(s.x, s.floorY + 0.86, s.z + 0.28)
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
          dummy.position.set(s.x + 0.24, s.floorY + 1.38 + Math.sin(t * 3.5) * 0.04, s.z + 0.06)
          dummy.rotation.set(0, 0, -0.14)
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

  return (
    <group>
      <instancedMesh ref={chairRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.46, 0.72, 0.09]} />
        <meshStandardMaterial color="#334155" roughness={0.85} metalness={0.05} />
      </instancedMesh>

      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.165, 0.28, 4, 10]} />
        <meshStandardMaterial color="#ffffff" roughness={0.8} metalness={0.04} />
      </instancedMesh>

      <instancedMesh ref={headRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.105, 12, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.65} />
      </instancedMesh>

      {distractedIndices.length > 0 && (
        <instancedMesh
          ref={phoneRef}
          args={[undefined, undefined, distractedIndices.length]}
          frustumCulled={false}
        >
          <boxGeometry args={[0.075, 0.14, 0.012]} />
          <meshStandardMaterial color="#93c5fd" emissive="#60a5fa" emissiveIntensity={1.5} />
        </instancedMesh>
      )}

      <instancedMesh ref={handRef} args={[undefined, undefined, 1]} frustumCulled={false}>
        <capsuleGeometry args={[0.045, 0.34, 4, 8]} />
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
  allTopics: Topic[],
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
    canvas.width = 1600
    canvas.height = 800
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [])

  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isConfidence = variant === 'confidence'
    ctx.fillStyle = isConfidence ? '#0f172a' : '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = isConfidence ? '#14b8a6' : '#1d4ed8'
    ctx.fillRect(0, 0, canvas.width, 20)

    ctx.fillStyle = isConfidence ? '#94a3b8' : '#475569'
    ctx.font = '700 36px Inter, system-ui, sans-serif'
    const counter = `${isInterview ? 'Question' : 'Slide'} ${slideIndex + 1} / ${Math.max(1, totalSlides)}`
    ctx.fillText(counter, 68, 96)

    if (isConfidence) {
      const mins = Math.floor(Math.max(0, remainingSeconds) / 60)
      const secs = Math.max(0, remainingSeconds) % 60
      const clock = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      ctx.fillStyle = remainingSeconds <= 60 ? '#fbbf24' : '#38bdf8'
      ctx.textAlign = 'right'
      ctx.font = '800 50px monospace'
      ctx.fillText(clock, canvas.width - 68, 98)
      ctx.textAlign = 'left'
    } else {
      ctx.textAlign = 'right'
      ctx.fillText(sessionTitle.slice(0, 36), canvas.width - 68, 96)
      ctx.textAlign = 'left'
    }

    ctx.fillStyle = isConfidence ? '#f8fafc' : '#0f172a'
    ctx.font = '800 72px Inter, system-ui, sans-serif'
    const headline = activeTopic?.title || sessionTitle
    const lines = wrapCanvasText(ctx, headline, canvas.width - 136, 2)
    lines.forEach((line, i) => {
      ctx.fillText(line, 68, 210 + i * 86)
    })

    // Crisp bullet points on the in-room projector screen
    if (!isConfidence) {
      const bullets = [
        activeTopic?.brief
          ? `Key takeaway: keep "${headline}" concise and focused`
          : `Core focus: walk through concrete evidence for ${headline}`,
        nextTopic
          ? `Transition bridge → ${nextTopic.title}`
          : 'Closing summary & clear call to action',
        `Section ${slideIndex + 1} of ${Math.max(1, allTopics.length)} — maintain steady eye contact across the room`,
      ]
      ctx.fillStyle = '#334155'
      ctx.font = '500 38px Inter, system-ui, sans-serif'
      bullets.forEach((bullet, idx) => {
        const y = 430 + idx * 82
        ctx.fillStyle = '#1d4ed8'
        ctx.beginPath()
        ctx.arc(82, y - 12, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#1e293b'
        ctx.fillText(bullet.slice(0, 62), 112, y)
      })
    }

    if (activeTopic?.brief) {
      ctx.fillStyle = '#0f766e'
      ctx.beginPath()
      ctx.roundRect(68, 690, 170, 56, 12)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 28px Inter, system-ui, sans-serif'
      ctx.fillText(briefLabel.toUpperCase(), 96, 728)
    }

    if (isConfidence && nextTopic) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '600 36px Inter, system-ui, sans-serif'
      ctx.fillText(`${nextUpLabel}: ${nextTopic.title.slice(0, 48)}`, 68, 728)
    }

    texture.needsUpdate = true
  }, [
    activeTopic,
    allTopics.length,
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

interface RoomDimensions {
  width: number
  depth: number
  height: number
  frontZ: number
  backZ: number
}

function getRoomDimensions(venue: VenueType): RoomDimensions {
  switch (venue) {
    case 'interview_room':
      return { width: 5.8, depth: 6.8, height: 3.5, frontZ: -4.6, backZ: 2.2 }
    case 'panel_room':
      return { width: 7.8, depth: 7.6, height: 3.6, frontZ: -5.4, backZ: 2.2 }
    case 'classroom':
      return { width: 9.6, depth: 12.0, height: 3.8, frontZ: -9.6, backZ: 2.4 }
    case 'lecture_hall':
      return { width: 13.8, depth: 14.0, height: 4.6, frontZ: -11.4, backZ: 2.6 }
    case 'auditorium':
      return { width: 22.0, depth: 19.6, height: 5.0, frontZ: -16.8, backZ: 2.8 }
  }
}

/**
 * Enclosed architectural VR Lobby chamber with crisp, zero-Z-fighting floor rings.
 */
function VRLobbyEnvironment() {
  return (
    <group>
      {/* Floor strictly at y = 0 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#1e293b" roughness={0.82} metalness={0.08} />
      </mesh>
      {/* Floor rings lifted +0.02m so zero Z-fighting ever occurs */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.42, 1.47, 64]} />
        <meshStandardMaterial color="#14b8a6" emissive="#0d9488" emissiveIntensity={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[2.45, 2.49, 64]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.6} />
      </mesh>
      {/* Bright enclosed ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4.2, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#334155" roughness={0.9} />
      </mesh>
      {/* Enclosed 4 walls */}
      <mesh position={[0, 2.1, -6]}>
        <planeGeometry args={[12, 4.2]} />
        <meshStandardMaterial color="#273449" roughness={0.88} />
      </mesh>
      <mesh position={[0, 2.1, 6]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[12, 4.2]} />
        <meshStandardMaterial color="#273449" roughness={0.88} />
      </mesh>
      <mesh position={[-6, 2.1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[12, 4.2]} />
        <meshStandardMaterial color="#273449" roughness={0.88} />
      </mesh>
      <mesh position={[6, 2.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[12, 4.2]} />
        <meshStandardMaterial color="#273449" roughness={0.88} />
      </mesh>
      {/* Overhead light halo separated -0.04m from ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4.16, -1.2]}>
        <ringGeometry args={[1.6, 1.68, 64]} />
        <meshStandardMaterial color="#f8fafc" emissive="#bae6fd" emissiveIntensity={1.0} />
      </mesh>
    </group>
  )
}

/**
 * Bright, humanized architectural room shells (all 6 sides enclosed, zero Z-fighting,
 * natural oak wood podium/floor `#9c734b`, warm off-white/slate walls, stage top at y = 0).
 */
function VenueArchitecture({ venue }: { venue: VenueType }) {
  const dim = getRoomDimensions(venue)
  const centerZ = (dim.frontZ + dim.backZ) / 2
  const isTableVenue = venue === 'interview_room' || venue === 'panel_room'

  const palette =
    venue === 'classroom' || venue === 'interview_room'
      ? {
          wall: '#dfe5ec',
          slat: '#cbd5e1',
          ceiling: '#f1f5f9',
          floor: '#b08968',
          wood: '#9c734b',
          trim: '#0f766e',
        }
      : venue === 'lecture_hall' || venue === 'panel_room'
        ? {
            wall: '#cbd5e1',
            slat: '#94a3b8',
            ceiling: '#e2e8f0',
            floor: '#8b6f56',
            wood: '#9c734b',
            trim: '#1d4ed8',
          }
        : {
            // Auditorium: warm architectural walnut wood + bright slate upper tone
            wall: '#6b4c35',
            slat: '#523826',
            ceiling: '#334155',
            floor: '#475569',
            wood: '#9c734b',
            trim: '#14b8a6',
          }

  return (
    <group>
      {/* Main Room Floor strictly at y = 0 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]}>
        <planeGeometry args={[dim.width, dim.depth]} />
        <meshStandardMaterial color={palette.floor} roughness={0.82} metalness={0.04} />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, dim.height, centerZ]}>
        <planeGeometry args={[dim.width, dim.depth]} />
        <meshStandardMaterial color={palette.ceiling} roughness={0.92} />
      </mesh>

      {/* Front Wall (behind audience) */}
      <mesh position={[0, dim.height / 2, dim.frontZ]}>
        <planeGeometry args={[dim.width, dim.height]} />
        <meshStandardMaterial color={palette.wall} roughness={0.88} />
      </mesh>

      {/* Back Wall (behind presenter) */}
      <mesh position={[0, dim.height / 2, dim.backZ]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[dim.width, dim.height]} />
        <meshStandardMaterial color={palette.wall} roughness={0.88} />
      </mesh>

      {/* Left & Right Walls */}
      <mesh position={[-dim.width / 2, dim.height / 2, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[dim.depth, dim.height]} />
        <meshStandardMaterial color={palette.wall} roughness={0.88} />
      </mesh>
      <mesh position={[dim.width / 2, dim.height / 2, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[dim.depth, dim.height]} />
        <meshStandardMaterial color={palette.wall} roughness={0.88} />
      </mesh>

      {/* Architectural Acoustic Panels separated +0.06m from Front Wall (zero Z-fighting) */}
      {[-0.32, 0, 0.32].map((ratio) => (
        <mesh
          key={ratio}
          position={[dim.width * ratio, dim.height * 0.48, dim.frontZ + 0.06]}
        >
          <boxGeometry args={[dim.width * 0.24, dim.height * 0.70, 0.06]} />
          <meshStandardMaterial color={palette.slat} roughness={0.82} />
        </mesh>
      ))}

      {/* Recessed Warm-White Ceiling Light Strips separated -0.04m from ceiling */}
      {[-dim.width * 0.24, dim.width * 0.24].map((x) => (
        <mesh key={x} position={[x, dim.height - 0.04, centerZ]}>
          <boxGeometry args={[0.16, 0.04, dim.depth * 0.72]} />
          <meshStandardMaterial
            color="#fffbeb"
            emissive="#fef3c7"
            emissiveIntensity={1.1}
            roughness={0.25}
          />
        </mesh>
      ))}

      {/* Baseboard Accent Strip separated +0.04m from Front Wall */}
      <mesh position={[0, 0.06, dim.frontZ + 0.04]}>
        <boxGeometry args={[dim.width * 0.92, 0.04, 0.03]} />
        <meshStandardMaterial color={palette.trim} roughness={0.5} />
      </mesh>

      {/* Venue-Specific Furniture & Stage Architecture */}
      {venue === 'interview_room' && (
        <group>
          {/* Soft office area rug lifted +0.02m above floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -0.9]}>
            <planeGeometry args={[3.6, 4.2]} />
            <meshStandardMaterial color="#64748b" roughness={0.94} />
          </mesh>
          {/* Natural oak interview table (0.74m tall) */}
          <mesh position={[0, 0.74, -1.85]}>
            <boxGeometry args={[2.2, 0.06, 0.88]} />
            <meshStandardMaterial color={palette.wood} roughness={0.55} />
          </mesh>
          <mesh position={[-0.95, 0.37, -1.85]}>
            <boxGeometry args={[0.08, 0.72, 0.72]} />
            <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.4} />
          </mesh>
          <mesh position={[0.95, 0.37, -1.85]}>
            <boxGeometry args={[0.08, 0.72, 0.72]} />
            <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.4} />
          </mesh>
          {/* Interviewer laptop */}
          <mesh position={[0.32, 0.79, -2.02]} rotation={[-0.18, 0.18, 0]}>
            <boxGeometry args={[0.34, 0.02, 0.23]} />
            <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.35} />
          </mesh>
          {/* Waist-height console stand */}
          <mesh position={[0, 0.48, -0.86]}>
            <cylinderGeometry args={[0.032, 0.045, 0.94, 12]} />
            <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.03, -0.86]}>
            <cylinderGeometry args={[0.20, 0.22, 0.03, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.45} roughness={0.45} />
          </mesh>
        </group>
      )}

      {venue === 'panel_room' && (
        <group>
          <mesh position={[0, 0.74, -2.05]}>
            <boxGeometry args={[4.1, 0.065, 0.88]} />
            <meshStandardMaterial color={palette.wood} roughness={0.55} />
          </mesh>
          {[-1.75, 0, 1.75].map((x) => (
            <mesh key={x} position={[x, 0.37, -2.05]}>
              <boxGeometry args={[0.09, 0.72, 0.72]} />
              <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.4} />
            </mesh>
          ))}
          {[-1.28, 0, 1.28].map((x) => (
            <mesh key={x} position={[x, 0.82, -1.66]}>
              <boxGeometry args={[0.38, 0.10, 0.04]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.4} />
            </mesh>
          ))}
          <mesh position={[0, 0.48, -0.86]}>
            <cylinderGeometry args={[0.032, 0.045, 0.94, 12]} />
            <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.02, -0.86]}>
            <cylinderGeometry args={[0.20, 0.22, 0.03, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.45} roughness={0.45} />
          </mesh>
        </group>
      )}

      {!isTableVenue && (
        <group>
          {/* Natural Oak Stage Deck: top sits flush at y = 0.00 so player NEVER sinks below floor */}
          <mesh position={[0, -0.02, -0.25]}>
            <boxGeometry
              args={[
                venue === 'auditorium' ? 12.0 : venue === 'lecture_hall' ? 8.6 : 6.4,
                0.04,
                3.4,
              ]}
            />
            <meshStandardMaterial color={palette.wood} roughness={0.6} />
          </mesh>
          {/* Stage apron edge trim separated +0.02m above floor */}
          <mesh position={[0, 0.02, -1.94]}>
            <boxGeometry
              args={[
                venue === 'auditorium' ? 12.0 : venue === 'lecture_hall' ? 8.6 : 6.4,
                0.022,
                0.045,
              ]}
            />
            <meshStandardMaterial color="#14b8a6" emissive="#0d9488" emissiveIntensity={0.85} />
          </mesh>

          {/* Natural Oak 3D Architectural Podium: 0.66m W × 1.05m H × 0.48m D at z = -0.68m */}
          <group position={[0, 0, -0.68]}>
            <mesh position={[0, 0.035, 0]}>
              <boxGeometry args={[0.64, 0.07, 0.48]} />
              <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.4} />
            </mesh>
            <mesh position={[0, 0.54, 0]}>
              <boxGeometry args={[0.56, 0.94, 0.38]} />
              <meshStandardMaterial color={palette.wood} roughness={0.54} />
            </mesh>
            {/* Front accent plate separated +0.02m from column front (-0.19 -> -0.21) */}
            <mesh position={[0, 0.56, -0.21]}>
              <boxGeometry args={[0.42, 0.72, 0.02]} />
              <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.45} />
            </mesh>
            {/* Angled 35-degree lectern top */}
            <mesh position={[0, 1.045, 0.02]} rotation={[-0.96, 0, 0]}>
              <boxGeometry args={[0.68, 0.46, 0.036]} />
              <meshStandardMaterial color="#7d5a38" roughness={0.5} />
            </mesh>
          </group>

          {/* Tiered Seating Risers for Lecture Hall & Auditorium */}
          {(venue === 'lecture_hall' || venue === 'auditorium') &&
            Array.from({ length: venue === 'auditorium' ? 10 : 6 }, (_, row) => {
              const rise = venue === 'auditorium' ? 0.20 : 0.18
              const spacingZ = venue === 'auditorium' ? 1.08 : 1.12
              const startZ = venue === 'auditorium' ? -3.45 : -3.15
              const riserHeight = Math.max(0.08, (row + 1) * rise)
              const riserWidth = venue === 'auditorium' ? 19.6 : 11.4
              return (
                <mesh
                  key={row}
                  position={[0, riserHeight / 2 - rise, startZ - row * spacingZ]}
                >
                  <boxGeometry args={[riserWidth, riserHeight, spacingZ - 0.05]} />
                  <meshStandardMaterial color="#475569" roughness={0.88} />
                </mesh>
              )
            })}
        </group>
      )}
    </group>
  )
}

/**
 * Monitors XR sessionstart (resumes mic + procedural audio), controller triggers
 * (strictly debounced 350ms, gated to phase === 'active' & !isPaused & !uiHovered),
 * and automatic low-head-height comfort lift.
 */
function XRAudioAndTriggerBridge({
  phase,
  isPaused,
  seatedHeightMode,
  uiHoveredCountRef,
  onPrevSlide,
  onNextSlide,
  onLobbyTriggerTest,
  onAutoHeightOffsetChange,
}: {
  phase: StagePhase
  isPaused: boolean
  seatedHeightMode: boolean
  uiHoveredCountRef: React.MutableRefObject<number>
  onPrevSlide: () => void
  onNextSlide: () => void
  onLobbyTriggerTest: () => void
  onAutoHeightOffsetChange: (offset: number) => void
}) {
  const { gl, camera } = useThree()
  const checkedAutoHeightRef = useRef(false)
  const lastTriggerAtRef = useRef(0)

  useFrame(() => {
    if (!gl.xr.isPresenting || seatedHeightMode || checkedAutoHeightRef.current) return
    if (camera.position.y > 0.15 && camera.position.y < 1.28) {
      checkedAutoHeightRef.current = true
      onAutoHeightOffsetChange(0.25)
    } else if (camera.position.y >= 1.28) {
      checkedAutoHeightRef.current = true
    }
  })

  useEffect(() => {
    const xr = gl.xr
    let attachedSession: XRSession | null = null

    const onSelectStart = (event: XRInputSourceEvent) => {
      // Never intercept trigger when ray is hovering any 3D UI button
      if (uiHoveredCountRef.current > 0) return

      // 350ms debounce so a single trigger pull never double-fires
      const now = performance.now()
      if (now - lastTriggerAtRef.current < 350) return
      lastTriggerAtRef.current = now

      if (phase === 'vr_lobby') {
        onLobbyTriggerTest()
        return
      }
      if (phase !== 'active' || isPaused) return

      if (event.inputSource.handedness === 'left') {
        onPrevSlide()
      } else {
        onNextSlide()
      }
    }

    const onSessionStart = () => {
      checkedAutoHeightRef.current = false
      void vrMicManager.resumeAudioContext()
      void vrAudioEngine.resume()
      const session = xr.getSession()
      if (session) {
        attachedSession = session
        session.addEventListener('selectstart', onSelectStart)
      }
    }

    const onSessionEnd = () => {
      checkedAutoHeightRef.current = false
      onAutoHeightOffsetChange(0)
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
  }, [
    gl,
    isPaused,
    onAutoHeightOffsetChange,
    onLobbyTriggerTest,
    onNextSlide,
    onPrevSlide,
    phase,
    uiHoveredCountRef,
  ])

  return null
}

/** Watches live mic level in S2.1 VR Lobby to auto-pass Step 1 ("✓ Good level") */
function LobbyMicCheckWatcher({
  active,
  alreadyPassed,
  onPass,
}: {
  active: boolean
  alreadyPassed: boolean
  onPass: () => void
}) {
  useFrame(() => {
    if (!active || alreadyPassed) return
    if (vrMicManager.sampleLevel() > 0.08) {
      onPass()
    }
  })
  return null
}

const MAX_DESKTOP_YAW = 1.15
const MAX_DESKTOP_PITCH_UP = 0.45
const MAX_DESKTOP_PITCH_DOWN = -0.62

function DesktopMouseLook({
  isPaused,
  onXRPresentingChange,
}: {
  isPaused: boolean
  onXRPresentingChange: (presenting: boolean) => void
}) {
  const { camera, gl } = useThree()
  const yawRef = useRef(0)
  const pitchRef = useRef(-0.04)
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

    syncRotation()

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
      pitchRef.current = -0.04
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
 * Head-Gaze Zone Tracker (FR-16 & S2.1 3-Dot Auto-Calibration):
 * Reads active camera world direction every frame.
 */
function CameraGazeTracker({
  isPaused,
  isVRLobby,
  dwellRef,
  onZoneChange,
  onLobbyGazeZone,
}: {
  isPaused: boolean
  isVRLobby: boolean
  dwellRef: React.MutableRefObject<{ left: number; centre: number; right: number }>
  onZoneChange: (zone: GazeZone) => void
  onLobbyGazeZone: (zone: GazeZone) => void
}) {
  const { camera } = useThree()
  const dirVec = useMemo(() => new THREE.Vector3(), [])
  const lastZoneRef = useRef<GazeZone>('centre')
  const lobbyHoldRef = useRef<{ zone: GazeZone; time: number }>({ zone: 'centre', time: 0 })

  useFrame((_, delta) => {
    if (isPaused) return
    const dt = Math.min(delta, 0.1)
    camera.getWorldDirection(dirVec)
    const yawRad = Math.atan2(-dirVec.x, -dirVec.z)
    const zone: GazeZone = yawRad > 0.25 ? 'left' : yawRad < -0.25 ? 'right' : 'centre'

    if (isVRLobby) {
      if (lobbyHoldRef.current.zone === zone) {
        lobbyHoldRef.current.time += dt
        if (lobbyHoldRef.current.time >= 0.45) {
          onLobbyGazeZone(zone)
        }
      } else {
        lobbyHoldRef.current = { zone, time: 0 }
      }
      return
    }

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
  pairingCode?: string | null
  headsetBootMode?: boolean
  onSwitchTo2DWeb?: () => void
  onBackToPreFlight?: () => void
  onEndSession?: (record: SessionRecord) => void
}

export function VRStage({
  setup: initialSetup,
  userId = 'demo-user',
  language = 'en',
  captionsEnabled = true,
  pairingCode = null,
  headsetBootMode = false,
  onSwitchTo2DWeb,
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

  const seats = useMemo(() => computeVenueSeats(activeSetup.venue), [activeSetup.venue])

  const totalLimitSeconds = Math.max(60, activeSetup.timeLimitMinutes * 60)
  const isInterview = activeSetup.practiceType === 'interview'

  const [phase, setPhase] = useState<StagePhase>(() =>
    headsetBootMode ? 'vr_lobby' : 'lobby',
  )
  const [lobbyPairingCode, setLobbyPairingCode] = useState<string>(() =>
    pairingCode && pairingCode.length === 4 ? pairingCode : generateHeadsetLobbyCode(),
  )
  const [lobbyPairingStatus, setLobbyPairingStatus] = useState<'waiting' | 'paired'>('waiting')

  // S2.1 In-VR Pre-Flight Checklist State
  const [lobbyMicPassed, setLobbyMicPassed] = useState(false)
  const [lobbyGazeCalibrated, setLobbyGazeCalibrated] = useState({
    left: false,
    centre: false,
    right: false,
  })
  const [lobbyTriggerTested, setLobbyTriggerTested] = useState(false)

  // Audio & Camera Comfort Height State
  const [musicEnabled, setMusicEnabled] = useState<boolean>(() => vrAudioEngine.isMusicEnabled())
  const [seatedHeightMode, setSeatedHeightMode] = useState(false)
  const [autoHeightOffset, setAutoHeightOffset] = useState(0)

  const [sessionId, setSessionId] = useState<string>(() => createSessionId())
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [coveredIds, setCoveredIds] = useState<Set<string>>(() => new Set())
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [panelVisible, setPanelVisible] = useState(true)
  const [desktopControlsOpen, setDesktopControlsOpen] = useState(false)
  const [hintUsed, setHintUsed] = useState(false)
  const [liveCaption, setLiveCaption] = useState(hudT.captionReady)
  const [handRaisedIndex, setHandRaisedIndex] = useState<number | null>(null)
  const [gazeZone, setGazeZone] = useState<GazeZone>('centre')
  const [isXRPresenting, setIsXRPresenting] = useState(false)
  const [xrNotice, setXrNotice] = useState<string | null>(null)
  const [micSnap, setMicSnap] = useState<VRMicSnapshot>(() => vrMicManager.getSnapshot())
  const autoEnterAttemptedRef = useRef(false)
  const oneMinWarnedRef = useRef(false)
  const distractionCounterRef = useRef(0)
  const lastSessionTransitionAtRef = useRef(0)

  useEffect(() => {
    const unsubMic = vrMicManager.subscribe(setMicSnap)
    const unsubMusic = vrAudioEngine.subscribeMusic(setMusicEnabled)
    return () => {
      unsubMic()
      unsubMusic()
      vrAudioEngine.stopAll()
    }
  }, [])

  // Manage Lobby Music, Room Ambience & Pause Muting automatically across phases
  useEffect(() => {
    if (isPaused) {
      vrAudioEngine.pauseAll()
      return
    }
    if (phase === 'vr_lobby') {
      vrAudioEngine.stopRoomAmbience()
      vrAudioEngine.startLobbyMusic()
    } else if (phase === 'active') {
      vrAudioEngine.stopLobbyMusic(0.55)
      vrAudioEngine.startRoomAmbience(activeSetup.venue)
    } else if (phase === 'debrief') {
      vrAudioEngine.stopRoomAmbience()
      vrAudioEngine.stopLobbyMusic(0.4)
      vrAudioEngine.playApplause()
    } else {
      vrAudioEngine.stopAll()
    }
  }, [activeSetup.venue, isPaused, phase])

  // Headset Boot Mode: attempt zero-click auto-entry into immersive-vr
  useEffect(() => {
    if (!headsetBootMode || autoEnterAttemptedRef.current) return
    autoEnterAttemptedRef.current = true
    const timer = window.setTimeout(() => {
      if (xrStore.getState().session) return
      void xrStore
        .enterVR()
        .then(() => {
          void vrMicManager.resumeAudioContext()
          void vrAudioEngine.resume()
        })
        .catch(() => {
          // Regular browser requires user gesture — 1-tap full-screen splash handles entry
        })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [headsetBootMode])

  // Speech delivery, Groq Whisper live STT, Q&A, Auto-flagging & Debrief state
  const analyzerRef = useRef<SpeechDeliveryAnalyzer>(new SpeechDeliveryAnalyzer())
  const groqTranscriberRef = useRef<GroqLiveTranscriber>(new GroqLiveTranscriber())
  const ingestTranscriptRef = useRef<(text: string) => void>(() => {})
  const gazeDwellRef = useRef<{ left: number; centre: number; right: number }>({
    left: 0,
    centre: 1,
    right: 0,
  })
  const uiHoveredCountRef = useRef(0)
  const slideEnteredAtRef = useRef<number>(0)
  const simSpeechIndexRef = useRef<number>(0)
  const qaCountRef = useRef<number>(0)

  const [liveWpm, setLiveWpm] = useState(0)
  const [liveWordCount, setLiveWordCount] = useState(0)
  const [liveFillers, setLiveFillers] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [flaggedMoments, setFlaggedMoments] = useState<FlaggedMoment[]>([])
  const [activeQuestion, setActiveQuestion] = useState<QAQuestion | null>(null)
  const [answerSeconds, setAnswerSeconds] = useState(0)
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null)
  const [completedRecord, setCompletedRecord] = useState<SessionRecord | null>(null)

  // Keep refs in sync for the 60ms VAD interval so it never needs to re-subscribe
  const activeQuestionRef = useRef<QAQuestion | null>(null)
  const currentSlideIndexRef = useRef(0)
  const topicsRef = useRef<Topic[]>(topics)
  const elapsedSecondsRef = useRef(0)
  activeQuestionRef.current = activeQuestion
  currentSlideIndexRef.current = currentSlideIndex
  topicsRef.current = topics
  elapsedSecondsRef.current = elapsedSeconds

  // Prevent stuck raycast hover count whenever UI screens mount/unmount
  useEffect(() => {
    uiHoveredCountRef.current = 0
  }, [phase, isPaused])

  const remainingSeconds = Math.max(0, totalLimitSeconds - elapsedSeconds)

  // S2.4 1-Minute Warning chime (fires once when hitting 60s remaining)
  useEffect(() => {
    if (
      phase === 'active' &&
      !isPaused &&
      activeSetup.oneMinWarning &&
      remainingSeconds === 60 &&
      !oneMinWarnedRef.current
    ) {
      oneMinWarnedRef.current = true
      vrAudioEngine.playOneMinuteWarning()
    }
  }, [activeSetup.oneMinWarning, isPaused, phase, remainingSeconds])

  const handleUIHoverChange = useCallback((hovered: boolean) => {
    uiHoveredCountRef.current = Math.max(0, uiHoveredCountRef.current + (hovered ? 1 : -1))
  }, [])

  const handleCalibrateGaze = useCallback((zone: GazeZone) => {
    setLobbyGazeCalibrated((prev) => {
      if (prev[zone]) return prev
      vrAudioEngine.playClick()
      return { ...prev, [zone]: true }
    })
  }, [])

  const handleEnterVR = useCallback(() => {
    setXrNotice(null)
    vrAudioEngine.unlock()
    const alreadyActive = vrMicManager.getSnapshot().status === 'active'
    const micPromise = vrMicManager.requestMicFromGesture()

    const launchImmersiveVR = async () => {
      try {
        await xrStore.enterVR()
        await vrMicManager.resumeAudioContext()
        await vrAudioEngine.resume()
      } catch {
        setXrNotice(
          language === 'fr'
            ? 'Micro autorisé — cliquez à nouveau sur « Entrer en VR » pour lancer le casque.'
            : 'Mic ready — tap "Enter VR" once more to enter headset mode.',
        )
      }
    }

    if (alreadyActive) {
      void launchImmersiveVR()
    } else {
      void Promise.race([
        micPromise,
        new Promise<void>((resolve) => window.setTimeout(resolve, 350)),
      ]).then(() => launchImmersiveVR())
    }
  }, [language])

  const handleExitVR = useCallback(() => {
    vrAudioEngine.stopAll()
    const session = xrStore.getState().session
    if (session) {
      void session.end().catch(() => {})
    }
  }, [])

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
        timestampSeconds: elapsedSecondsRef.current,
        momentType,
        label,
        transcriptExcerpt: opts?.transcriptExcerpt,
        aiTip: opts?.aiTip,
        slideIndex: opts?.slideIndex ?? currentSlideIndexRef.current,
      }
      setFlaggedMoments((prev) => [...prev, flag])
    },
    [],
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
    const vad = vrMicManager.getVADMetrics()
    const useVadFallback = speech.totalWords === 0 && vad.estimatedWords > 0
    const effectiveWpm = useVadFallback ? vad.overallWpm || vad.rollingWpm : speech.overallWpm

    return buildSessionRecord({
      sessionId,
      setup: activeSetup,
      language,
      durationSeconds: elapsedSeconds,
      wpm: effectiveWpm,
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
      vadWordCount: useVadFallback ? vad.estimatedWords : undefined,
      vadSpeakingSeconds: useVadFallback ? vad.speakingDurationSeconds : undefined,
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

  // Start/stop chunked Groq Whisper live STT cleanly on active/pause/resume/end
  // (reuses unlocked vrMicManager stream; silently falls back to local VAD if unreachable)
  useEffect(() => {
    if (phase === 'active' && !isPaused && micSnap.status === 'active') {
      groqTranscriberRef.current.start({
        language,
        onTranscript: (text) => ingestTranscriptRef.current(text),
      })
    } else {
      groqTranscriberRef.current.stop()
      if (phase !== 'active') {
        vrAudioEngine.stopSpeech()
      }
    }
    return () => {
      groqTranscriberRef.current.stop()
      if (phase !== 'active') {
        vrAudioEngine.stopSpeech()
      }
    }
  }, [isPaused, language, micSnap.status, phase])

  useEffect(() => {
    if (phase !== 'active' || isPaused) return
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
      setAnswerSeconds((prev) => (activeQuestionRef.current ? prev + 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isPaused, phase])

  // Real-Time Quest Audio VAD & Syllable Pace Tracker loop (~60ms cadence)
  // Drives live WPM, word count, speaking badge, >3.5s pause flags & auto slide coverage
  // whenever SpeechRecognition is unavailable or emits 0 words (Meta Quest Browser).
  useEffect(() => {
    if (phase !== 'active' || isPaused) {
      setIsSpeaking(false)
      return
    }
    let lastUiSync = 0
    let prevSpeaking = false

    const interval = window.setInterval(() => {
      const step = vrMicManager.stepVAD(0.06, { inQA: activeQuestionRef.current !== null })

      if (step.slideCoveredNow) {
        const currentTopic = topicsRef.current[currentSlideIndexRef.current]
        if (currentTopic) {
          setCoveredIds((prev) => {
            if (prev.has(currentTopic.id)) return prev
            const next = new Set(prev)
            next.add(currentTopic.id)
            return next
          })
        }
      }

      if (step.detectedLongPause) {
        addFlag(
          'long_pause',
          language === 'fr'
            ? `Pause longue (${step.longPauseSeconds}s)`
            : `Long pause (${step.longPauseSeconds}s)`,
          {
            aiTip:
              language === 'fr'
                ? 'Utilisez une courte phrase de transition pour garder le fil.'
                : 'Use a brief bridging phrase to keep momentum after a pause.',
          },
        )
      }

      const now = performance.now()
      const speakingChanged = step.metrics.isSpeaking !== prevSpeaking
      if (speakingChanged || now - lastUiSync >= 350) {
        prevSpeaking = step.metrics.isSpeaking
        lastUiSync = now
        setIsSpeaking(step.metrics.isSpeaking)

        const asrSnapshot = analyzerRef.current.getSnapshot(Math.max(1, elapsedSecondsRef.current))
        if (asrSnapshot.totalWords === 0) {
          const vadWpm = step.metrics.rollingWpm || step.metrics.overallWpm
          setLiveWpm(vadWpm)
          setLiveWordCount(step.metrics.estimatedWords)
        }
      }
    }, 60)

    return () => window.clearInterval(interval)
  }, [addFlag, isPaused, language, phase])

  // 30-second auto-save to Supabase (FR-18, NFR-08)
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
    const speakerIdx = qaCountRef.current
    const question = generateAudienceQuestion(
      activeSetup,
      activeTopic,
      currentSlideIndex,
      language,
      speakerIdx,
    )
    qaCountRef.current += 1
    vrMicManager.resetQASpeakingTimer()
    const seatIdx = Math.min(
      seats.length - 1,
      Math.floor(seats.length * 0.25) + (speakerIdx % Math.max(1, Math.min(5, seats.length))),
    )
    const askingSeat = seats[seatIdx]
    const pan = askingSeat ? Math.max(-0.8, Math.min(0.8, askingSeat.x / 3.2)) : 0

    setHandRaisedIndex(seatIdx)
    setActiveQuestion(question)
    setAnswerSeconds(0)
    setLiveCaption(`${question.speakerLabel}: “${question.text}”`)

    vrAudioEngine.playHandRaiseChime(pan)
    window.setTimeout(() => {
      vrAudioEngine.speakAudienceVoice(question.text, language, speakerIdx)
    }, 280)

    addFlag('question', `${question.speakerLabel}: ${question.topicTitle}`, {
      transcriptExcerpt: question.text,
      aiTip:
        language === 'fr'
          ? 'Répondez en moins de 45 secondes avec un exemple concret, puis revenez à votre diapositive.'
          : 'Aim to answer in under 45 seconds with one concrete example, then bridge back to your slide.',
      slideIndex: currentSlideIndex,
    })
  }, [activeSetup, addFlag, currentSlideIndex, language, seats, topics])

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

  // S2.4 Distracted Audience & Room Interruption Stereo SFX Engine
  useEffect(() => {
    if (phase !== 'active' || isPaused || activeQuestion !== null || elapsedSeconds === 0) {
      return
    }
    const isDistracted = activeSetup.audienceBehaviour === 'distracted'
    const cadence = isDistracted ? 18 : activeSetup.interruptionLevel === 'high' ? 24 : 38
    if (elapsedSeconds % cadence !== 0) return

    const idx = distractionCounterRef.current
    distractionCounterRef.current += 1
    const pan = idx % 2 === 0 ? -0.62 : 0.62

    const eventKind = idx % 5
    if (eventKind === 0) {
      vrAudioEngine.playPhoneBuzz(pan)
    } else if (eventKind === 1) {
      vrAudioEngine.playWhisperBurst(pan)
    } else if (eventKind === 2) {
      vrAudioEngine.playThroatClear(pan)
    } else if (eventKind === 3) {
      vrAudioEngine.playLateArrival(pan)
    } else if (isDistracted) {
      const verbalLine =
        language === 'fr'
          ? 'Excusez-moi, pouvez-vous répéter la dernière partie ?'
          : 'Sorry, can you repeat the last part?'
      setLiveCaption(`Audience: “${verbalLine}”`)
      vrAudioEngine.speakAudienceVoice(verbalLine, language, idx)
    }
  }, [
    activeQuestion,
    activeSetup.audienceBehaviour,
    activeSetup.interruptionLevel,
    elapsedSeconds,
    isPaused,
    language,
    phase,
  ])

  const handleIngestTranscript = useCallback(
    (text: string) => {
      const result = analyzerRef.current.ingestChunk(
        text,
        elapsedSecondsRef.current,
        activeSetup.practiceType,
      )
      if (!result) return

      setLiveWpm(result.snapshot.rollingWpm)
      setLiveWordCount(result.snapshot.totalWords)
      setLiveFillers(result.snapshot.fillerCount)
      setLiveCaption(text)

      // Mark current slide topic & any keyword-matched outline topic covered from real transcript
      const lowerText = text.toLowerCase()
      const currentTopic = topicsRef.current[currentSlideIndexRef.current]
      setCoveredIds((prev) => {
        let changed = false
        const copy = new Set(prev)
        if (currentTopic && !copy.has(currentTopic.id)) {
          copy.add(currentTopic.id)
          changed = true
        }
        for (const topic of topicsRef.current) {
          if (copy.has(topic.id)) continue
          const keywords = topic.title
            .toLowerCase()
            .split(/[^a-z0-9\u00C0-\u017F]+/)
            .filter((w) => w.length >= 4)
          if (keywords.some((kw) => lowerText.includes(kw))) {
            copy.add(topic.id)
            changed = true
          }
        }
        return changed ? copy : prev
      })

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
    [activeSetup.practiceType, addFlag, language],
  )
  ingestTranscriptRef.current = handleIngestTranscript

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
        const dwellOnPrev = elapsedSecondsRef.current - slideEnteredAtRef.current
        if (dwellOnPrev < 2 && elapsedSecondsRef.current > 2) {
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
        slideEnteredAtRef.current = elapsedSecondsRef.current
        vrMicManager.resetSlideSpeakingTimer()
      }
      setCurrentSlideIndex(clamped)
    },
    [addFlag, currentSlideIndex, language, topics],
  )

  const handleNextSlide = useCallback(() => {
    goToSlide(currentSlideIndex + 1)
  }, [currentSlideIndex, goToSlide])

  const handlePrevSlide = useCallback(() => {
    goToSlide(currentSlideIndex - 1)
  }, [currentSlideIndex, goToSlide])

  const handleReturnToSlide = useCallback(() => {
    vrAudioEngine.stopSpeech()
    vrMicManager.resetQASpeakingTimer()
    setActiveQuestion(null)
    setAnswerSeconds(0)
    setHandRaisedIndex(null)
    setLiveCaption(hudT.captionReady)
  }, [hudT.captionReady])

  const handleFinishAnswer = useCallback(() => {
    if (!activeQuestion) return
    if (activeSetup.followUps && !activeQuestion.isFollowUp) {
      const followUp = generateFollowUpQuestion(activeQuestion, activeSetup, language)
      vrMicManager.resetQASpeakingTimer()
      setActiveQuestion(followUp)
      setAnswerSeconds(0)
      setLiveCaption(`${followUp.speakerLabel}: “${followUp.text}”`)
      vrAudioEngine.speakAudienceVoice(followUp.text, language, qaCountRef.current)
    } else {
      handleReturnToSlide()
    }
  }, [activeQuestion, activeSetup, handleReturnToSlide, language])

  const resetSessionRun = useCallback(
    (startSlide = 0, nextSetup?: SessionSetup) => {
      // Guard against accidental double-triggers within 400ms
      const now = performance.now()
      if (now - lastSessionTransitionAtRef.current < 400) return
      lastSessionTransitionAtRef.current = now

      vrAudioEngine.unlock()
      vrAudioEngine.stopSpeech()
      vrAudioEngine.stopLobbyMusic(0.5)

      if (nextSetup) setActiveSetup(nextSetup)
      const targetTopics = nextSetup?.topics.length ? nextSetup.topics : topicsRef.current
      const safeSlide = Math.max(0, Math.min(targetTopics.length - 1, startSlide))

      analyzerRef.current.reset()
      vrMicManager.resetVADSession()
      gazeDwellRef.current = { left: 0, centre: 1, right: 0 }
      uiHoveredCountRef.current = 0
      slideEnteredAtRef.current = 0
      simSpeechIndexRef.current = 0
      qaCountRef.current = 0
      oneMinWarnedRef.current = false
      distractionCounterRef.current = 0

      setSessionId(createSessionId())
      setCurrentSlideIndex(safeSlide)
      setCoveredIds(new Set())
      setElapsedSeconds(0)
      setLiveWpm(0)
      setLiveWordCount(0)
      setLiveFillers(0)
      setIsSpeaking(false)
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
    },
    [hudT.captionReady],
  )

  // Subscribe 3D Floating VR Lobby to incoming phone pairing launches via Supabase Realtime
  useEffect(() => {
    if (phase !== 'vr_lobby') return
    setLobbyPairingStatus('waiting')
    const unsubscribe = subscribeHeadsetLobbyPairing(lobbyPairingCode, (phoneSetup) => {
      setLobbyPairingStatus('paired')
      window.setTimeout(() => {
        resetSessionRun(0, phoneSetup)
      }, 350)
    })
    return unsubscribe
  }, [lobbyPairingCode, phase, resetSessionRun])

  const [feedbackLoading, setFeedbackLoading] = useState(false)

  const handleEndSessionToDebrief = useCallback(async () => {
    groqTranscriberRef.current.stop()
    vrAudioEngine.stopSpeech()
    uiHoveredCountRef.current = 0
    setActiveQuestion(null)
    setAnswerSeconds(0)
    setHandRaisedIndex(null)
    setIsSpeaking(false)
    setIsPaused(false)

    // Immediately show S2.6 debrief metrics (never block the screen)
    const initialRecord = snapshotCurrentRecord()
    setCompletedRecord(initialRecord)
    setFeedbackLoading(true)
    setPhase('debrief')

    // Save initial snapshot right away
    void saveSessionSnapshot(userId, initialRecord)

    // Asynchronously fetch real DeepSeek V4.1-Flash coaching feedback & sync enriched record to Supabase
    const coveredSnapshot = new Set(coveredIds)
    const setupSnapshot = activeSetup
    const topicsSnapshot = topics
    void requestSessionAIFeedback(
      initialRecord,
      setupSnapshot,
      topicsSnapshot,
      coveredSnapshot,
    )
      .then(async (feedback) => {
        if (!feedback) return
        const enriched = applyAIFeedbackToRecord(initialRecord, feedback)
        setCompletedRecord((current) =>
          current && current.id === initialRecord.id ? enriched : current,
        )
        await saveSessionSnapshot(userId, enriched)
      })
      .finally(() => {
        setFeedbackLoading(false)
      })
  }, [activeSetup, coveredIds, snapshotCurrentRecord, topics, userId])

  const handleExitToLobby = useCallback(() => {
    groqTranscriberRef.current.stop()
    vrAudioEngine.stopSpeech()
    vrAudioEngine.stopRoomAmbience()
    vrMicManager.resetVADSession()
    analyzerRef.current.reset()
    uiHoveredCountRef.current = 0
    setFeedbackLoading(false)
    setCompletedRecord(null)
    setActiveQuestion(null)
    setAnswerSeconds(0)
    setHandRaisedIndex(null)
    setIsPaused(false)
    setIsSpeaking(false)
    setElapsedSeconds(0)
    setLiveWpm(0)
    setLiveWordCount(0)
    setLiveFillers(0)
    setPhase('vr_lobby')
  }, [])

  const handleUseHint = useCallback(() => {
    const activeTopic = topics[currentSlideIndex]
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
  }, [activeSetup.title, addFlag, currentSlideIndex, language, topics])

  const activeTopic = topics[currentSlideIndex]
  const nextTopic = topics[currentSlideIndex + 1]

  const projectorTexture = useSlideCanvasTexture(
    activeSetup.title,
    activeTopic,
    nextTopic,
    topics,
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
    topics,
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
        onEnterSession={() => {
          vrAudioEngine.unlock()
          void vrMicManager.requestMicFromGesture()
          setPhase('active')
        }}
        onBackToSetups={onBackToPreFlight}
      />
    )
  }

  if (phase === 'debrief' && completedRecord && !isXRPresenting && !headsetBootMode) {
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

  const dim = getRoomDimensions(activeSetup.venue)
  const isTableVenue =
    activeSetup.venue === 'interview_room' || activeSetup.venue === 'panel_room'
  const isVRLobby = phase === 'vr_lobby'

  const podiumHudPosition: [number, number, number] = isTableVenue
    ? [0, 0.97, -0.82]
    : [0, 1.08, -0.64]
  const podiumHudRotation: [number, number, number] = [-0.96, 0, 0]

  // Player Y offset: 0m standing on stage floor, +0.35m in Seated mode (or +0.25m auto-lift if tracked low)
  const playerOriginY = seatedHeightMode ? 0.35 : autoHeightOffset

  const askingSeat =
    handRaisedIndex !== null && seats[handRaisedIndex] ? seats[handRaisedIndex] : null
  const showOneMinWarning =
    phase === 'active' &&
    activeSetup.oneMinWarning &&
    remainingSeconds <= 60
  const questionsRemaining = Math.max(
    0,
    (activeSetup.interruptionLevel === 'high' ? 4 : activeSetup.interruptionLevel === 'medium' ? 3 : 2) -
      qaCountRef.current,
  )

  const handleHeadsetSplashTap = () => {
    vrAudioEngine.unlock()
    void vrMicManager.requestMicFromGesture()
    void xrStore
      .enterVR()
      .then(() => {
        void vrMicManager.resumeAudioContext()
        void vrAudioEngine.resume()
      })
      .catch(() => {
        setXrNotice(
          language === 'fr'
            ? 'Appuyez à nouveau pour entrer en VR.'
            : 'Tap once more to launch Stagera VR.',
        )
      })
  }

  return (
    <div className={`vr-stage-container ${headsetBootMode ? 'vr-stage-headset-full' : ''}`}>
      {/* Headset 1-Tap Full-Screen Dark Fallback Splash (zero flat menus or navbars) */}
      {headsetBootMode && !isXRPresenting && (
        <div
          id="vr-headset-tap-splash"
          className="vr-headset-splash"
          role="button"
          tabIndex={0}
          onClick={handleHeadsetSplashTap}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleHeadsetSplashTap()
            }
          }}
        >
          <div className="vr-headset-splash-inner">
            <span className="vr-headset-splash-mark" aria-hidden="true">
              S
            </span>
            <h1 className="vr-headset-splash-title">Stagera VR</h1>
            <p className="vr-headset-splash-prompt">
              {language === 'fr'
                ? 'Appuyez ou pressez la gâchette n’importe où pour entrer dans Stagera VR'
                : 'Tap / Pull Trigger Anywhere to Enter Stagera VR'}
            </p>
            {xrNotice && <p className="vr-headset-splash-notice">{xrNotice}</p>}
          </div>

          {onSwitchTo2DWeb && (
            <button
              id="vr-switch-2d-btn"
              type="button"
              className="vr-headset-escape-btn"
              onClick={(e) => {
                e.stopPropagation()
                onSwitchTo2DWeb()
              }}
            >
              {language === 'fr' ? 'Passer en vue web 2D' : 'Switch to 2D Web View'}
            </button>
          )}
        </div>
      )}

      {/* Browser/Desktop HUD shell */}
      {!headsetBootMode && !isXRPresenting && (
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
          desktopControlsOpen={desktopControlsOpen}
          isPaused={isPaused}
          isXRPresenting={isXRPresenting}
          captionsEnabled={captionsEnabled}
          hintUsed={hintUsed}
          liveCaption={liveCaption}
          lastAutoSavedAt={lastAutoSavedAt}
          activeQuestion={activeQuestion}
          answerSeconds={answerSeconds}
          micStatus={micSnap.status}
          xrNotice={xrNotice}
          gazeZone={gazeZone}
          onPrevSlide={handlePrevSlide}
          onNextSlide={handleNextSlide}
          onJumpToSlide={goToSlide}
          onTogglePanel={() => setPanelVisible((prev) => !prev)}
          onToggleDesktopControls={() => setDesktopControlsOpen((prev) => !prev)}
          onTogglePause={() => setIsPaused((prev) => !prev)}
          onEnterVR={handleEnterVR}
          onVoiceFeedback={(msg) => setLiveCaption(msg)}
          onSpeechTranscript={handleIngestTranscript}
          onSimulateSpeech={handleSimulateSpeech}
          onTriggerQuestion={triggerQuestion}
          onFinishAnswer={handleFinishAnswer}
          onReturnToSlide={handleReturnToSlide}
        />
      )}

      {isPaused && !headsetBootMode && !isXRPresenting && (
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
          onUseHint={handleUseHint}
          onEndSession={() => void handleEndSessionToDebrief()}
        />
      )}

      {/* Opaque Pure-VR WebGL Canvas: alpha: false kills passthrough bleed-through */}
      <Canvas
        gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 1.65, 0], fov: 62, near: 0.05, far: 80 }}
        dpr={[1, 1.5]}
        onCreated={({ gl }) => {
          gl.xr.setReferenceSpaceType('local-floor')
        }}
      >
        <XR store={xrStore}>
          {/* Standing on stage floor (y = 0) with optional Seated (+0.35m) / low-tracking comfort lift */}
          <XROrigin position={[0, playerOriginY, 0]} />

          <XRAudioAndTriggerBridge
            phase={phase}
            isPaused={isPaused}
            seatedHeightMode={seatedHeightMode}
            uiHoveredCountRef={uiHoveredCountRef}
            onPrevSlide={handlePrevSlide}
            onNextSlide={handleNextSlide}
            onLobbyTriggerTest={() => {
              vrAudioEngine.playClick()
              setLobbyTriggerTested(true)
            }}
            onAutoHeightOffsetChange={setAutoHeightOffset}
          />
          <LobbyMicCheckWatcher
            active={isVRLobby}
            alreadyPassed={lobbyMicPassed}
            onPass={() => setLobbyMicPassed(true)}
          />
          <DesktopMouseLook
            isPaused={isPaused}
            onXRPresentingChange={setIsXRPresenting}
          />
          <CameraGazeTracker
            isPaused={isPaused}
            isVRLobby={isVRLobby}
            dwellRef={gazeDwellRef}
            onZoneChange={setGazeZone}
            onLobbyGazeZone={handleCalibrateGaze}
          />

          {/* Opaque background (no dark oppressive fog!) */}
          <color
            attach="background"
            args={[isVRLobby ? '#1e293b' : activeSetup.venue === 'auditorium' ? '#334155' : '#dfe5ec']}
          />

          {/* Bright, Natural Architectural Lighting Rig */}
          <hemisphereLight args={['#f8fafc', '#94a3b8', 1.35]} />
          <ambientLight intensity={0.85} color="#ffffff" />
          <directionalLight position={[2.5, 6.0, 2.5]} intensity={1.7} color="#fff8eb" />
          <pointLight
            position={[0, isVRLobby ? 3.8 : dim.height - 0.35, -1.2]}
            intensity={2.0}
            color="#fff7e6"
            distance={18}
            decay={1.4}
          />

          {isVRLobby ? (
            <>
              <VRLobbyEnvironment />
              <VRFloatingLobby3D
                setup={activeSetup}
                selectedVenue={activeSetup.venue}
                pairingCode={lobbyPairingCode}
                pairingStatus={lobbyPairingStatus}
                micStatus={micSnap.status}
                micCheckPassed={lobbyMicPassed}
                gazeCalibrated={lobbyGazeCalibrated}
                triggerTested={lobbyTriggerTested}
                musicEnabled={musicEnabled}
                seatedHeightMode={seatedHeightMode}
                language={language}
                onCalibrateGaze={handleCalibrateGaze}
                onTestTrigger={() => setLobbyTriggerTested(true)}
                onSelectVenueAndStart={(venue) => {
                  const nextSetup: SessionSetup = { ...activeSetup, venue }
                  resetSessionRun(0, nextSetup)
                }}
                onStartPractice={() => {
                  resetSessionRun(0, activeSetup)
                }}
                onRegenerateCode={() => {
                  setLobbyPairingStatus('waiting')
                  setLobbyPairingCode(generateHeadsetLobbyCode())
                }}
                onEnableMic={() => {
                  vrAudioEngine.unlock()
                  void vrMicManager.requestMicFromGesture()
                }}
                onToggleMusic={() => vrAudioEngine.setMusicEnabled(!musicEnabled)}
                onToggleHeightMode={() => setSeatedHeightMode((prev) => !prev)}
                onHoverChange={handleUIHoverChange}
              />
            </>
          ) : (
            <>
              {/* Soft architectural ceiling fills for audience clarity */}
              <pointLight
                position={[-dim.width * 0.28, dim.height - 0.4, dim.frontZ * 0.55]}
                intensity={1.6}
                color="#f8fafc"
                distance={20}
                decay={1.5}
              />
              <pointLight
                position={[dim.width * 0.28, dim.height - 0.4, dim.frontZ * 0.55]}
                intensity={1.6}
                color="#f8fafc"
                distance={20}
                decay={1.5}
              />

              {/* Bright Enclosed Architectural Venue */}
              <VenueArchitecture venue={activeSetup.venue} />

              {/* Main Bright In-Room Projector Screen (separated +0.16m from Front Wall, face +0.03m from bezel) */}
              <group
                position={
                  isTableVenue
                    ? [0, 2.05, dim.frontZ + 0.16]
                    : [0, Math.min(dim.height - 1.15, 2.95), dim.frontZ + 0.18]
                }
              >
                <mesh position={[0, 0, 0]}>
                  <boxGeometry
                    args={
                      activeSetup.venue === 'auditorium'
                        ? [4.62, 2.36, 0.04]
                        : isTableVenue
                          ? [2.36, 1.24, 0.04]
                          : [3.38, 1.76, 0.04]
                    }
                  />
                  <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.45} />
                </mesh>
                <mesh position={[0, 0, 0.03]}>
                  <planeGeometry
                    args={
                      activeSetup.venue === 'auditorium'
                        ? [4.48, 2.24]
                        : isTableVenue
                          ? [2.24, 1.12]
                          : [3.24, 1.62]
                    }
                  />
                  <meshBasicMaterial
                    map={projectorTexture}
                    polygonOffset
                    polygonOffsetFactor={-1}
                  />
                </mesh>
              </group>

              {/* Confidence Floor Monitor at Stage Apron */}
              {!isTableVenue && (
                <group position={[0, 0.30, -1.78]} rotation={[-0.48, 0, 0]}>
                  <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[1.20, 0.64, 0.04]} />
                    <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.45} />
                  </mesh>
                  <mesh position={[0, 0, 0.03]}>
                    <planeGeometry args={[1.12, 0.56]} />
                    <meshBasicMaterial
                      map={confidenceTexture}
                      polygonOffset
                      polygonOffsetFactor={-1}
                    />
                  </mesh>
                </group>
              )}

              {/* Organic Human-Proportioned Audience / Interviewers */}
              <InstancedAudience
                seats={seats}
                behaviour={activeSetup.audienceBehaviour}
                isPaused={isPaused}
                handRaisedIndex={handRaisedIndex}
              />

              {/* S2.3 Floating Speech Bubble above asking student/interviewer */}
              {phase === 'active' && activeQuestion && askingSeat && !isPaused && (
                <VRQuestionBubble3D
                  position={[askingSeat.x, askingSeat.floorY + 1.88, askingSeat.z]}
                  question={activeQuestion}
                />
              )}

              {/* S2.4 Crisp 1-Minute Warning Banner */}
              <VROneMinWarningBanner3D
                visible={showOneMinWarning && !isPaused}
                timeUp={remainingSeconds === 0}
              />

              {/* World-Space Interactive 3D Podium Console (0.58m W × 0.36m H) */}
              {phase === 'active' && (
                <VRPodiumHUD
                  position={podiumHudPosition}
                  rotation={podiumHudRotation}
                  setup={activeSetup}
                  language={language}
                  topics={topics}
                  currentSlideIndex={currentSlideIndex}
                  elapsedSeconds={elapsedSeconds}
                  remainingSeconds={remainingSeconds}
                  liveWpm={liveWpm}
                  liveWordCount={liveWordCount}
                  liveFillers={liveFillers}
                  isSpeaking={isSpeaking}
                  captionsEnabled={captionsEnabled}
                  liveCaption={liveCaption}
                  micStatus={micSnap.status}
                  micError={micSnap.errorMessage}
                  panelVisible={panelVisible}
                  isPaused={isPaused}
                  hasActiveQuestion={activeQuestion !== null}
                  onPrevSlide={handlePrevSlide}
                  onNextSlide={handleNextSlide}
                  onToggleQA={() => {
                    if (activeQuestion) {
                      handleFinishAnswer()
                    } else {
                      triggerQuestion()
                    }
                  }}
                  onTogglePanel={() => setPanelVisible((prev) => !prev)}
                  onTogglePause={() => setIsPaused((prev) => !prev)}
                  onHoverChange={handleUIHoverChange}
                />
              )}

              {/* S2.2 / S2.2b / S2.3 Private Presenter Panel ("Only you see this") */}
              {phase === 'active' && (
                <VRTeleprompterBoard
                  visible={panelVisible}
                  setup={activeSetup}
                  language={language}
                  topics={topics}
                  currentSlideIndex={currentSlideIndex}
                  coveredIds={coveredIds}
                  elapsedSeconds={elapsedSeconds}
                  activeQuestion={activeQuestion}
                  answerSeconds={answerSeconds}
                  questionsRemaining={questionsRemaining}
                  followUpsEnabled={activeSetup.followUps}
                  onJumpToSlide={goToSlide}
                  onFinishAnswer={handleFinishAnswer}
                  onReturnToSlide={handleReturnToSlide}
                  onTogglePanel={() => setPanelVisible((prev) => !prev)}
                  onHoverChange={handleUIHoverChange}
                />
              )}

              {/* S2.5 / S2.5b Pause Menu */}
              {phase === 'active' && (
                <VRPauseMenu3D
                  visible={isPaused}
                  setup={activeSetup}
                  language={language}
                  elapsedSeconds={elapsedSeconds}
                  pairingCode={pairingCode ?? lobbyPairingCode}
                  currentTopicTitle={activeTopic?.title ?? activeSetup.title}
                  micStatus={micSnap.status}
                  panelVisible={panelVisible}
                  hintUsed={hintUsed}
                  musicEnabled={musicEnabled}
                  seatedHeightMode={seatedHeightMode}
                  isXRPresenting={isXRPresenting}
                  onSelectVenue={(venue) =>
                    setActiveSetup((prev) => ({ ...prev, venue }))
                  }
                  onRetryMic={() => void vrMicManager.requestMicFromGesture()}
                  onToggleMusic={() => vrAudioEngine.setMusicEnabled(!musicEnabled)}
                  onToggleHeightMode={() => setSeatedHeightMode((prev) => !prev)}
                  onTogglePanel={() => setPanelVisible((prev) => !prev)}
                  onUseHint={handleUseHint}
                  onResume={() => setIsPaused(false)}
                  onRestartCurrentSlide={() => {
                    vrAudioEngine.stopSpeech()
                    vrMicManager.resetSlideSpeakingTimer()
                    setIsPaused(false)
                    setLiveCaption(hudT.captionReady)
                  }}
                  onRestartBeginning={() => resetSessionRun(0)}
                  onEndSession={() => void handleEndSessionToDebrief()}
                  onExitVR={handleExitVR}
                  onHoverChange={handleUIHoverChange}
                />
              )}

              {/* S2.6 Session Complete / Quick Debrief inside VR */}
              {phase === 'debrief' && completedRecord && (isXRPresenting || headsetBootMode) && (
                <VRDebriefPanel3D
                  record={completedRecord}
                  language={language}
                  feedbackLoading={feedbackLoading}
                  onTryAgain={() => resetSessionRun(0)}
                  onRaiseDifficulty={() =>
                    resetSessionRun(0, raiseDifficultySetup(activeSetup))
                  }
                  onExitToReport={() => {
                    handleExitVR()
                    if (onEndSession) {
                      onEndSession(completedRecord)
                    } else if (onBackToPreFlight) {
                      onBackToPreFlight()
                    }
                  }}
                  onExitToLobby={handleExitToLobby}
                  onHoverChange={handleUIHoverChange}
                />
              )}
            </>
          )}
        </XR>
      </Canvas>
    </div>
  )
}

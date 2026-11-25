import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { XR, XROrigin, createXRStore } from '@react-three/xr'
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
  generateHeadsetLobbyCode,
  subscribeHeadsetLobbyPairing,
} from '../lib/pairing'
import {
  buildSessionRecord,
  createSessionId,
  OptionalAudioRecorder,
  saveSessionSnapshot,
} from '../lib/sessionRecorder'
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
  VRPauseMenu3D,
  VRPodiumHUD,
  VRTeleprompterBoard,
} from './VRWorldUI'

/**
 * Pure Full VR store — explicitly disables `offerSession` (prevents `InvalidStateError`
 * on Meta Quest Browser when entering VR via custom button and kills `immersive-ar`)
 * and disables all AR-only features (plane/mesh detection, hitTest, anchors, domOverlay).
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
  /** Seated torso base Y (floor = 0, chair seat = 0.45m, head/eye = 1.20m + row rise) */
  floorY: number
  z: number
  yaw: number
  phase: number
  isDistracted: boolean
  isNodder: boolean
  jacketHex: string
  skinHex: string
}

const JACKET_PALETTE = [
  '#334155',
  '#3b4252',
  '#1e3a5f',
  '#3f3f46',
  '#312e81',
  '#1f2937',
  '#374151',
  '#475569',
]

const SKIN_PALETTE = ['#e2b89b', '#d4a373', '#c68b59', '#8d5524', '#f1c27d', '#b87d56']

/**
 * Computes real-world 1m = 1u seat coordinates relative to player spawn at (0, 0, 0) facing -Z.
 * Front row is 2.6m–3.4m away; seated head/eye height is 1.20m (within 1.15m–1.25m).
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
      jacketHex: '#1e293b',
      skinHex: '#d4a373',
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

    seats.push({
      x,
      floorY,
      z,
      yaw,
      phase: (i * 0.67) % (Math.PI * 2),
      isDistracted,
      isNodder,
      jacketHex: JACKET_PALETTE[hash % JACKET_PALETTE.length],
      skinHex: SKIN_PALETTE[(hash >>> 4) % SKIN_PALETTE.length],
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

/**
 * Human-proportioned instanced audience (NFR-01: 4 draw calls total for up to 200 avatars).
 * Seated head/eye height = floorY + 1.20m; realistic 0.105m head radius & shouldered torso.
 */
function InstancedAudience({
  venue,
  behaviour,
  isPaused,
  handRaisedIndex,
}: InstancedAudienceProps) {
  const seats = useMemo(() => computeVenueSeats(venue), [venue])
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

  // Assign subtle varied clothing & skin tones via instanceColor (0 extra draw calls)
  useEffect(() => {
    if (!bodyRef.current || !headRef.current || !chairRef.current) return
    for (let i = 0; i < count; i++) {
      const s = seats[i]
      tempColor.set(s.jacketHex)
      bodyRef.current.setColorAt(i, tempColor)
      tempColor.set(s.skinHex)
      headRef.current.setColorAt(i, tempColor)

      // Static chair backrest behind seated avatar
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

        let bodyLeanX = 0
        if (behaviour === 'challenging') {
          bodyLeanX = -0.07
        } else if (behaviour === 'supportive') {
          bodyLeanX = 0.05
        }
        // Seated torso center at floorY + 0.78m (seat at 0.45m, shoulders at ~1.04m)
        dummy.position.set(s.x, s.floorY + 0.78, s.z)
        dummy.rotation.set(bodyLeanX, s.yaw, 0)
        dummy.scale.set(1.16, 1.0, 0.68)
        dummy.updateMatrix()
        bodyRef.current.setMatrixAt(i, dummy.matrix)

        let headPitch = 0
        let headYaw = s.yaw
        let headRoll = 0

        if (behaviour === 'supportive' && s.isNodder) {
          headPitch = Math.sin(t * 2.2 + s.phase) * 0.11
        } else if (behaviour === 'attentive') {
          headYaw = s.yaw + Math.sin(t * 0.65 + s.phase) * 0.08
          headPitch = Math.sin(t * 0.9 + s.phase) * 0.03
        } else if (behaviour === 'distracted' && s.isDistracted) {
          headPitch = 0.38 + Math.sin(t * 1.1 + s.phase) * 0.04
          headYaw = s.yaw + (i % 2 === 0 ? 0.32 : -0.32)
        } else if (behaviour === 'challenging') {
          headRoll = i % 2 === 0 ? 0.09 : -0.09
          headPitch = -0.05 + Math.sin(t * 0.7 + s.phase) * 0.03
        }

        // Seated head/eye center at floorY + 1.20m (1.15m–1.25m real-world spec)
        dummy.position.set(s.x, s.floorY + 1.20, s.z + 0.02)
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
      {/* Instanced auditorium/office chairs */}
      <instancedMesh ref={chairRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.46, 0.72, 0.09]} />
        <meshStandardMaterial color="#172033" roughness={0.88} metalness={0.08} />
      </instancedMesh>

      {/* Human-proportioned seated torsos */}
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.165, 0.28, 4, 10]} />
        <meshStandardMaterial color="#ffffff" roughness={0.82} metalness={0.05} />
      </instancedMesh>

      {/* Human-proportioned heads (radius 0.105m = ~21cm diameter) */}
      <instancedMesh ref={headRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.105, 12, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.68} />
      </instancedMesh>

      {/* Distracted smartphone glow */}
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

      {/* Raised hand for Q&A */}
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
    ctx.fillStyle = isConfidence ? '#090f1d' : '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = isConfidence ? '#14b8a6' : '#1d4ed8'
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

interface RoomDimensions {
  width: number
  depth: number
  height: number
  frontZ: number
  backZ: number
  fogNear: number
  fogFar: number
}

function getRoomDimensions(venue: VenueType): RoomDimensions {
  switch (venue) {
    case 'interview_room':
      return { width: 5.8, depth: 6.8, height: 3.5, frontZ: -4.6, backZ: 2.2, fogNear: 6, fogFar: 18 }
    case 'panel_room':
      return { width: 7.8, depth: 7.6, height: 3.6, frontZ: -5.4, backZ: 2.2, fogNear: 7, fogFar: 20 }
    case 'classroom':
      return { width: 9.6, depth: 12.0, height: 3.8, frontZ: -9.6, backZ: 2.4, fogNear: 9, fogFar: 24 }
    case 'lecture_hall':
      return { width: 13.8, depth: 14.0, height: 4.6, frontZ: -11.4, backZ: 2.6, fogNear: 11, fogFar: 28 }
    case 'auditorium':
      return { width: 22.0, depth: 19.6, height: 5.0, frontZ: -16.8, backZ: 2.8, fogNear: 14, fogFar: 36 }
  }
}

/**
 * Enclosed sleek dark VR Lobby chamber (10m × 10m × 4.2m) with subtle glowing
 * concentric floor rings so Quest users land in a rich native-feeling VR space
 * with zero passthrough bleed-through.
 */
function VRLobbyEnvironment() {
  return (
    <group>
      {/* Floor at y = 0 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#0b1120" roughness={0.85} metalness={0.12} />
      </mesh>
      {/* Subtle concentric glowing floor rings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[1.42, 1.46, 64]} />
        <meshStandardMaterial color="#14b8a6" emissive="#0d9488" emissiveIntensity={1.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[2.45, 2.48, 64]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.7} />
      </mesh>
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4.2, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#070b14" roughness={0.95} />
      </mesh>
      {/* Enclosed 4 walls */}
      <mesh position={[0, 2.1, -6]}>
        <planeGeometry args={[12, 4.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.92} />
      </mesh>
      <mesh position={[0, 2.1, 6]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[12, 4.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.92} />
      </mesh>
      <mesh position={[-6, 2.1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[12, 4.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.92} />
      </mesh>
      <mesh position={[6, 2.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[12, 4.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.92} />
      </mesh>
      {/* Soft overhead halo light ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4.15, -1.2]}>
        <ringGeometry args={[1.6, 1.66, 64]} />
        <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={0.9} />
      </mesh>
    </group>
  )
}

/**
 * Enclosed architectural room shell (floor, ceiling, 4 walls, acoustic slats,
 * recessed LED ceiling strips, stage apron trim, and real-world 1.05m podium).
 * Zero open gaps so passthrough can never bleed through in 360 degrees.
 */
function VenueArchitecture({ venue }: { venue: VenueType }) {
  const dim = getRoomDimensions(venue)
  const centerZ = (dim.frontZ + dim.backZ) / 2
  const isTableVenue = venue === 'interview_room' || venue === 'panel_room'

  const wallMat = { color: '#111827', roughness: 0.92, metalness: 0.05 }
  const slatMat = { color: '#1e293b', roughness: 0.85, metalness: 0.08 }

  return (
    <group>
      {/* Enclosed Room Shell: Floor, Ceiling, Front/Back/Left/Right Walls */}
      {/* Main Floor (y = 0 = physical floor in local-floor referenceSpace) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]}>
        <planeGeometry args={[dim.width, dim.depth]} />
        <meshStandardMaterial color="#141926" roughness={0.88} metalness={0.05} />
      </mesh>

      {/* Ceiling (enclosed overhead) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, dim.height, centerZ]}>
        <planeGeometry args={[dim.width, dim.depth]} />
        <meshStandardMaterial color="#0b1120" roughness={0.95} />
      </mesh>

      {/* Front Wall (behind audience) */}
      <mesh position={[0, dim.height / 2, dim.frontZ]}>
        <planeGeometry args={[dim.width, dim.height]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>

      {/* Back Wall (behind presenter) */}
      <mesh position={[0, dim.height / 2, dim.backZ]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[dim.width, dim.height]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>

      {/* Left Wall */}
      <mesh position={[-dim.width / 2, dim.height / 2, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[dim.depth, dim.height]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>

      {/* Right Wall */}
      <mesh position={[dim.width / 2, dim.height / 2, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[dim.depth, dim.height]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>

      {/* Architectural Acoustic Wall Panels on Front Wall */}
      {[-0.32, 0, 0.32].map((ratio) => (
        <mesh
          key={ratio}
          position={[dim.width * ratio, dim.height * 0.48, dim.frontZ + 0.04]}
        >
          <boxGeometry args={[dim.width * 0.24, dim.height * 0.72, 0.05]} />
          <meshStandardMaterial {...slatMat} />
        </mesh>
      ))}

      {/* Recessed Linear Warm-White LED Ceiling Strips */}
      {[-dim.width * 0.24, dim.width * 0.24].map((x) => (
        <mesh key={x} position={[x, dim.height - 0.02, centerZ]}>
          <boxGeometry args={[0.10, 0.03, dim.depth * 0.72]} />
          <meshStandardMaterial
            color="#fef3c7"
            emissive="#fde68a"
            emissiveIntensity={0.85}
            roughness={0.3}
          />
        </mesh>
      ))}

      {/* Subtle Emissive Teal Baseboard Accent Strip on Front Wall */}
      <mesh position={[0, 0.05, dim.frontZ + 0.03]}>
        <boxGeometry args={[dim.width * 0.92, 0.035, 0.02]} />
        <meshStandardMaterial color="#14b8a6" emissive="#0d9488" emissiveIntensity={1.1} />
      </mesh>

      {/* Venue-Specific Furniture & Stage Architecture */}
      {venue === 'interview_room' && (
        <group>
          {/* Warm wood stage/rug zone under presenter */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, -0.8]}>
            <planeGeometry args={[3.6, 4.4]} />
            <meshStandardMaterial color="#1e293b" roughness={0.92} />
          </mesh>
          {/* Interview conference table (real-world 0.74m height) */}
          <mesh position={[0, 0.74, -1.85]}>
            <boxGeometry args={[2.2, 0.06, 0.88]} />
            <meshStandardMaterial color="#4a3222" roughness={0.55} metalness={0.08} />
          </mesh>
          <mesh position={[-0.95, 0.37, -1.85]}>
            <boxGeometry args={[0.08, 0.72, 0.72]} />
            <meshStandardMaterial color="#1f2937" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0.95, 0.37, -1.85]}>
            <boxGeometry args={[0.08, 0.72, 0.72]} />
            <meshStandardMaterial color="#1f2937" roughness={0.4} metalness={0.6} />
          </mesh>
          {/* Interviewer laptop & notebook */}
          <mesh position={[0.32, 0.79, -2.02]} rotation={[-0.18, 0.18, 0]}>
            <boxGeometry args={[0.34, 0.018, 0.23]} />
            <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.35} />
          </mesh>
          {/* Sleek Waist-Height Console Stand for Presenter HUD */}
          <mesh position={[0, 0.48, -0.86]}>
            <cylinderGeometry args={[0.032, 0.045, 0.94, 12]} />
            <meshStandardMaterial color="#1f2937" metalness={0.65} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.015, -0.86]}>
            <cylinderGeometry args={[0.20, 0.22, 0.03, 16]} />
            <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.45} />
          </mesh>
        </group>
      )}

      {venue === 'panel_room' && (
        <group>
          {/* Panel table (real-world 0.74m height, 4.1m wide) */}
          <mesh position={[0, 0.74, -2.05]}>
            <boxGeometry args={[4.1, 0.065, 0.88]} />
            <meshStandardMaterial color="#4a3222" roughness={0.58} metalness={0.08} />
          </mesh>
          {[-1.75, 0, 1.75].map((x) => (
            <mesh key={x} position={[x, 0.37, -2.05]}>
              <boxGeometry args={[0.09, 0.72, 0.72]} />
              <meshStandardMaterial color="#1f2937" roughness={0.4} metalness={0.6} />
            </mesh>
          ))}
          {/* Panelist nameplates */}
          {[-1.28, 0, 1.28].map((x) => (
            <mesh key={x} position={[x, 0.82, -1.66]}>
              <boxGeometry args={[0.38, 0.10, 0.04]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.4} />
            </mesh>
          ))}
          {/* Sleek Waist-Height Console Stand */}
          <mesh position={[0, 0.48, -0.86]}>
            <cylinderGeometry args={[0.032, 0.045, 0.94, 12]} />
            <meshStandardMaterial color="#1f2937" metalness={0.65} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.015, -0.86]}>
            <cylinderGeometry args={[0.20, 0.22, 0.03, 16]} />
            <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.45} />
          </mesh>
        </group>
      )}

      {!isTableVenue && (
        <group>
          {/* Warm Wood Stage Floor Deck under Presenter (flush near y=0 so feet stay at y=0) */}
          <mesh position={[0, 0.008, -0.25]}>
            <boxGeometry args={[venue === 'auditorium' ? 12.0 : venue === 'lecture_hall' ? 8.6 : 6.4, 0.016, 3.4]} />
            <meshStandardMaterial color="#4a3222" roughness={0.62} metalness={0.06} />
          </mesh>
          {/* Emissive Teal Stage Apron Strip */}
          <mesh position={[0, 0.018, -1.94]}>
            <boxGeometry args={[venue === 'auditorium' ? 12.0 : venue === 'lecture_hall' ? 8.6 : 6.4, 0.018, 0.04]} />
            <meshStandardMaterial color="#2dd4bf" emissive="#0d9488" emissiveIntensity={1.15} />
          </mesh>

          {/* Real-World 3D Architectural Podium: 0.66m W × 1.05m H × 0.48m D at z = -0.68m */}
          <group position={[0, 0, -0.68]}>
            {/* Base plinth */}
            <mesh position={[0, 0.035, 0]}>
              <boxGeometry args={[0.64, 0.07, 0.48]} />
              <meshStandardMaterial color="#1f2937" roughness={0.45} metalness={0.55} />
            </mesh>
            {/* Main warm walnut column */}
            <mesh position={[0, 0.54, 0]}>
              <boxGeometry args={[0.56, 0.94, 0.38]} />
              <meshStandardMaterial color="#4a3222" roughness={0.56} metalness={0.08} />
            </mesh>
            {/* Front brushed metal accent plate facing audience */}
            <mesh position={[0, 0.56, -0.196]}>
              <boxGeometry args={[0.42, 0.72, 0.012]} />
              <meshStandardMaterial color="#1e293b" roughness={0.38} metalness={0.65} />
            </mesh>
            {/* Subtle glowing Stagera accent line on front of podium */}
            <mesh position={[0, 0.88, -0.204]}>
              <boxGeometry args={[0.32, 0.016, 0.01]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.2} />
            </mesh>
            {/* Angled 35-degree lectern top surface (supports VRPodiumHUD) */}
            <mesh position={[0, 1.045, 0.02]} rotation={[-0.96, 0, 0]}>
              <boxGeometry args={[0.66, 0.44, 0.036]} />
              <meshStandardMaterial color="#3b2619" roughness={0.5} metalness={0.1} />
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
                  <boxGeometry args={[riserWidth, riserHeight, spacingZ - 0.04]} />
                  <meshStandardMaterial color="#161f32" roughness={0.9} />
                </mesh>
              )
            })}
        </group>
      )}
    </group>
  )
}

/**
 * Bridges WebXR `sessionstart` (resuming AudioContext for quest mic capture)
 * and controller triggers (prev/next slide when not hovering a 3D UI button).
 */
function XRAudioAndTriggerBridge({
  isPaused,
  uiHoveredCountRef,
  onPrevSlide,
  onNextSlide,
}: {
  isPaused: boolean
  uiHoveredCountRef: React.MutableRefObject<number>
  onPrevSlide: () => void
  onNextSlide: () => void
}) {
  const { gl } = useThree()

  useEffect(() => {
    const xr = gl.xr
    let attachedSession: XRSession | null = null

    const onSelectStart = (event: XRInputSourceEvent) => {
      if (isPaused || uiHoveredCountRef.current > 0) return
      if (event.inputSource.handedness === 'left') {
        onPrevSlide()
      } else {
        onNextSlide()
      }
    }

    const onSessionStart = () => {
      // Explicitly resume AudioContext upon WebXR session entry (Quest Browser fix)
      void vrMicManager.resumeAudioContext()
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
  }, [gl, isPaused, onNextSlide, onPrevSlide, uiHoveredCountRef])

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
  const pitchRef = useRef(-0.08)
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
      pitchRef.current = -0.08
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
  pairingCode?: string | null
  /** When true (Quest / WebXR headset detected), boots straight into 3D Floating VR Lobby */
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

  const totalLimitSeconds = Math.max(60, activeSetup.timeLimitMinutes * 60)
  const isInterview = activeSetup.practiceType === 'interview'

  const [phase, setPhase] = useState<StagePhase>(() =>
    headsetBootMode ? 'vr_lobby' : 'lobby',
  )
  const [lobbyPairingCode, setLobbyPairingCode] = useState<string>(() =>
    pairingCode && pairingCode.length === 4 ? pairingCode : generateHeadsetLobbyCode(),
  )
  const [lobbyPairingStatus, setLobbyPairingStatus] = useState<'waiting' | 'paired'>('waiting')
  const [sessionId, setSessionId] = useState<string>(() => createSessionId())
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [coveredIds, setCoveredIds] = useState<Set<string>>(() =>
    topics[0] ? new Set([topics[0].id]) : new Set(),
  )
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [panelVisible, setPanelVisible] = useState(false)
  const [desktopControlsOpen, setDesktopControlsOpen] = useState(false)
  const [hintUsed, setHintUsed] = useState(false)
  const [liveCaption, setLiveCaption] = useState(hudT.captionReady)
  const [handRaisedIndex, setHandRaisedIndex] = useState<number | null>(null)
  const [gazeZone, setGazeZone] = useState<GazeZone>('centre')
  const [isXRPresenting, setIsXRPresenting] = useState(false)
  const [xrNotice, setXrNotice] = useState<string | null>(null)
  const [micSnap, setMicSnap] = useState<VRMicSnapshot>(() => vrMicManager.getSnapshot())
  const autoEnterAttemptedRef = useRef(false)

  useEffect(() => {
    return vrMicManager.subscribe(setMicSnap)
  }, [])

  // Headset Boot Mode: attempt zero-click auto-entry into immersive-vr (works in Quest WebXR PWAs);
  // if regular Quest Browser blocks it awaiting a gesture, the 1-tap dark splash handles entry.
  useEffect(() => {
    if (!headsetBootMode || autoEnterAttemptedRef.current) return
    autoEnterAttemptedRef.current = true
    const timer = window.setTimeout(() => {
      if (xrStore.getState().session) return
      void xrStore
        .enterVR()
        .then(() => vrMicManager.resumeAudioContext())
        .catch(() => {
          // Regular browser requires user gesture — 1-tap full-screen splash is already visible
        })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [headsetBootMode])

  // Subscribe 3D Floating VR Lobby to incoming phone pairing launches via Supabase Realtime
  useEffect(() => {
    if (phase !== 'vr_lobby') return
    setLobbyPairingStatus('waiting')
    const unsubscribe = subscribeHeadsetLobbyPairing(lobbyPairingCode, (phoneSetup) => {
      setLobbyPairingStatus('paired')
      setActiveSetup(phoneSetup)
      window.setTimeout(() => {
        setPhase('active')
      }, 450)
    })
    return unsubscribe
  }, [lobbyPairingCode, phase])

  // Speech delivery, Q&A, Auto-flagging & Debrief state
  const analyzerRef = useRef<SpeechDeliveryAnalyzer>(new SpeechDeliveryAnalyzer())
  const audioRecorderRef = useRef<OptionalAudioRecorder>(new OptionalAudioRecorder())
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
  const [liveFillers, setLiveFillers] = useState(0)
  const [flaggedMoments, setFlaggedMoments] = useState<FlaggedMoment[]>([])
  const [activeQuestion, setActiveQuestion] = useState<QAQuestion | null>(null)
  const [answerSeconds, setAnswerSeconds] = useState(0)
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null)
  const [completedRecord, setCompletedRecord] = useState<SessionRecord | null>(null)

  const remainingSeconds = Math.max(0, totalLimitSeconds - elapsedSeconds)

  const handleUIHoverChange = useCallback((hovered: boolean) => {
    uiHoveredCountRef.current = Math.max(0, uiHoveredCountRef.current + (hovered ? 1 : -1))
  }, [])

  /**
   * Gesture-initiated VR entry:
   * 1. Requests microphone permission & unlocks AudioContext inside the click gesture
   *    BEFORE the WebXR session takes over.
   * 2. Strictly enters `'immersive-vr'` via `xrStore.enterVR()`.
   */
  const handleEnterVR = useCallback(() => {
    setXrNotice(null)
    const alreadyActive = vrMicManager.getSnapshot().status === 'active'
    const micPromise = vrMicManager.requestMicFromGesture()

    const launchImmersiveVR = async () => {
      try {
        await xrStore.enterVR()
        await vrMicManager.resumeAudioContext()
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
      // Wait briefly if mic resolves fast (already granted), otherwise enter VR cleanly
      void Promise.race([
        micPromise,
        new Promise<void>((resolve) => window.setTimeout(resolve, 350)),
      ]).then(() => launchImmersiveVR())
    }
  }, [language])

  const handleExitVR = useCallback(() => {
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

  // Start optional audio recording reusing the gesture-acquired mic stream
  useEffect(() => {
    if (phase === 'active') {
      const existingStream = vrMicManager.getStream()
      if (existingStream) {
        void audioRecorderRef.current.start(existingStream)
      }
    } else {
      audioRecorderRef.current.stop()
      stopTTS()
    }
    return () => {
      audioRecorderRef.current.stop()
      stopTTS()
    }
  }, [phase, micSnap.status])

  // Session timer & Q&A answer timer
  useEffect(() => {
    if (phase !== 'active' || isPaused) return
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
      setAnswerSeconds((prev) => (activeQuestion ? prev + 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [activeQuestion, isPaused, phase])

  // 30-second auto-save to Supabase `sessions` & `flagged_moments` (FR-18, NFR-08)
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

  const handleReturnToSlide = useCallback(() => {
    stopTTS()
    setActiveQuestion(null)
    setAnswerSeconds(0)
    setHandRaisedIndex(null)
    setLiveCaption(hudT.captionReady)
  }, [hudT.captionReady])

  const handleFinishAnswer = useCallback(() => {
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
  }, [activeQuestion, activeSetup, handleReturnToSlide, language])

  const resetSessionRun = (startSlide = 0, nextSetup?: SessionSetup) => {
    if (nextSetup) setActiveSetup(nextSetup)
    const targetTopics = nextSetup?.topics.length ? nextSetup.topics : topics
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
        onEnterSession={() => {
          // Request mic inside the exact user click gesture before stage/VR entry
          void vrMicManager.requestMicFromGesture()
          setPhase('active')
        }}
        onBackToSetups={onBackToPreFlight}
      />
    )
  }

  // On desktop (not in XR), show the rich HTML Quick Debrief screen.
  // Inside XR, keep Canvas mounted and render VRDebriefPanel3D so we never drop the XR session!
  if (phase === 'debrief' && completedRecord && !isXRPresenting) {
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

  // Podium HUD mounted flush onto angled 35° podium top or waist-height floating console
  const podiumHudPosition: [number, number, number] = isTableVenue
    ? [0, 0.97, -0.82]
    : [0, 1.075, -0.64]
  const podiumHudRotation: [number, number, number] = [-0.96, 0, 0]

  // Direct synchronous 1-tap handler for Quest Browser fallback splash
  const handleHeadsetSplashTap = () => {
    void vrMicManager.requestMicFromGesture()
    void xrStore
      .enterVR()
      .then(() => vrMicManager.resumeAudioContext())
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

      {/* Browser/Desktop HUD shell (never shown in headsetBootMode or inside WebXR) */}
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
          {/* Player floor origin at (0, 0, 0) facing -Z; headset tracks real eye height */}
          <XROrigin position={[0, 0, 0]} />

          <XRAudioAndTriggerBridge
            isPaused={isPaused || isVRLobby}
            uiHoveredCountRef={uiHoveredCountRef}
            onPrevSlide={handlePrevSlide}
            onNextSlide={handleNextSlide}
          />
          <DesktopMouseLook
            isPaused={isPaused}
            onXRPresentingChange={setIsXRPresenting}
          />
          <CameraGazeTracker
            isPaused={isPaused || isVRLobby}
            dwellRef={gazeDwellRef}
            onZoneChange={setGazeZone}
          />

          {/* Opaque deep architectural background + atmospheric depth fog */}
          <color attach="background" args={['#090d16']} />
          <fog
            attach="fog"
            args={['#090d16', isVRLobby ? 6 : dim.fogNear, isVRLobby ? 18 : dim.fogFar]}
          />

          {/* Atmospheric Venue Lighting Rig (low draw-call, Quest 3 72+ FPS) */}
          <ambientLight intensity={0.38} color="#cbd5e1" />
          <hemisphereLight args={['#1e293b', '#0f172a', 0.28]} />
          {/* Warm overhead stage & podium spotlight */}
          <spotLight
            position={[0, isVRLobby ? 3.9 : dim.height - 0.15, isVRLobby ? -0.8 : -0.35]}
            angle={0.68}
            penumbra={0.72}
            intensity={2.8}
            color="#fff1dc"
            distance={12}
            decay={1.5}
          />

          {isVRLobby ? (
            <>
              {/* Sleek Dark Enclosed VR Lobby + Curved-Arc 3D Floating Spatial Menu */}
              <VRLobbyEnvironment />
              <VRFloatingLobby3D
                selectedVenue={activeSetup.venue}
                pairingCode={lobbyPairingCode}
                pairingStatus={lobbyPairingStatus}
                micStatus={micSnap.status}
                language={language}
                onSelectVenueAndEnter={(venue) => {
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
                onEnableMic={() => void vrMicManager.requestMicFromGesture()}
                onHoverChange={handleUIHoverChange}
              />
            </>
          ) : (
            <>
              {/* Soft cool rim lights separating audience from dark back wall */}
              <pointLight
                position={[-dim.width * 0.34, dim.height * 0.72, dim.frontZ + 1.4]}
                intensity={1.6}
                color="#60a5fa"
                distance={16}
                decay={1.8}
              />
              <pointLight
                position={[dim.width * 0.34, dim.height * 0.72, dim.frontZ + 1.4]}
                intensity={1.6}
                color="#818cf8"
                distance={16}
                decay={1.8}
              />

              {/* Enclosed Architectural Venue Geometry */}
              <VenueArchitecture venue={activeSetup.venue} />

              {/* Main Virtual Projector Screen on Front Wall */}
              <group
                position={
                  isTableVenue
                    ? [0, 2.05, dim.frontZ + 0.12]
                    : [0, Math.min(dim.height - 1.15, 2.95), dim.frontZ + 0.14]
                }
              >
                {/* Dark aluminum bezel frame */}
                <mesh position={[0, 0, -0.02]}>
                  <boxGeometry
                    args={
                      activeSetup.venue === 'auditorium'
                        ? [4.52, 2.32, 0.04]
                        : isTableVenue
                          ? [2.32, 1.22, 0.04]
                          : [3.32, 1.72, 0.04]
                    }
                  />
                  <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.6} />
                </mesh>
                <mesh>
                  <planeGeometry
                    args={
                      activeSetup.venue === 'auditorium'
                        ? [4.4, 2.2]
                        : isTableVenue
                          ? [2.2, 1.1]
                          : [3.2, 1.6]
                    }
                  />
                  <meshBasicMaterial map={projectorTexture} />
                </mesh>
              </group>

              {/* Confidence Floor Monitor at Stage Apron (for presentation venues) */}
              {!isTableVenue && (
                <group position={[0, 0.28, -1.78]} rotation={[-0.48, 0, 0]}>
                  <mesh position={[0, 0, -0.025]}>
                    <boxGeometry args={[1.18, 0.62, 0.04]} />
                    <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.5} />
                  </mesh>
                  <mesh>
                    <planeGeometry args={[1.12, 0.56]} />
                    <meshBasicMaterial map={confidenceTexture} />
                  </mesh>
                </group>
              )}

              {/* Instanced Human-Proportioned Audience / Interviewers */}
              <InstancedAudience
                venue={activeSetup.venue}
                behaviour={activeSetup.audienceBehaviour}
                isPaused={isPaused}
                handRaisedIndex={handRaisedIndex}
              />

              {/* World-Space Interactive 3D Presenter HUD mounted on Podium / Console */}
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
                  liveFillers={liveFillers}
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

              {/* World-Space Toggleable Outline & Live Q&A Console */}
              {phase === 'active' && (
                <VRTeleprompterBoard
                  visible={panelVisible}
                  language={language}
                  topics={topics}
                  currentSlideIndex={currentSlideIndex}
                  coveredIds={coveredIds}
                  activeQuestion={activeQuestion}
                  answerSeconds={answerSeconds}
                  followUpsEnabled={activeSetup.followUps}
                  onJumpToSlide={goToSlide}
                  onFinishAnswer={handleFinishAnswer}
                  onReturnToSlide={handleReturnToSlide}
                  onHoverChange={handleUIHoverChange}
                />
              )}

              {/* World-Space 3D Pause / Venue Switcher / Pairing / Exit Menu */}
              {phase === 'active' && (
                <VRPauseMenu3D
                  visible={isPaused}
                  setup={activeSetup}
                  language={language}
                  pairingCode={pairingCode ?? lobbyPairingCode}
                  currentTopicTitle={activeTopic?.title ?? activeSetup.title}
                  micStatus={micSnap.status}
                  hintUsed={hintUsed}
                  isXRPresenting={isXRPresenting}
                  onSelectVenue={(venue) =>
                    setActiveSetup((prev) => ({ ...prev, venue }))
                  }
                  onRetryMic={() => void vrMicManager.requestMicFromGesture()}
                  onUseHint={handleUseHint}
                  onResume={() => setIsPaused(false)}
                  onRestartCurrentSlide={() => {
                    setIsPaused(false)
                    setLiveCaption(hudT.captionReady)
                  }}
                  onRestartBeginning={() => resetSessionRun(0)}
                  onEndSession={() => void handleEndSessionToDebrief()}
                  onExitVR={handleExitVR}
                  onHoverChange={handleUIHoverChange}
                />
              )}

              {/* World-Space 3D Quick Debrief inside VR so finishing never kills XR */}
              {phase === 'debrief' && completedRecord && isXRPresenting && (
                <VRDebriefPanel3D
                  record={completedRecord}
                  language={language}
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

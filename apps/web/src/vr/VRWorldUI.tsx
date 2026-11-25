import { useEffect, useMemo, useRef, useState } from 'react'
import { Text } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { QAQuestion } from '../ai/qaEngine'
import { vrAudioEngine } from '../lib/vrAudioEngine'
import { vrMicManager, type VRMicStatus } from '../lib/vrMicManager'
import type {
  AppLanguage,
  SessionRecord,
  SessionSetup,
  Topic,
  VenueType,
} from '../types/stagera'

/* ==========================================================================
   Shared Geometry & Formatting Helpers (100% Uniform Scale, Zero Z-Fighting)
   ========================================================================== */

function createRoundedRectGeometry(width: number, height: number, radius: number): THREE.ShapeGeometry {
  const r = Math.min(radius, width / 2, height / 2)
  const x = -width / 2
  const y = -height / 2
  const shape = new THREE.Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + width - r, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + r)
  shape.lineTo(x + width, y + height - r)
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  shape.lineTo(x + r, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  return new THREE.ShapeGeometry(shape, 8)
}

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(clamped / 60)
  const secs = clamped % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`
}

function RoundedPanel({
  width,
  height,
  radius = 0.024,
  color,
  position = [0, 0, 0],
}: {
  width: number
  height: number
  radius?: number
  color: string
  position?: [number, number, number]
}) {
  const geo = useMemo(() => createRoundedRectGeometry(width, height, radius), [height, radius, width])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} position={position}>
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

export function playVRHoverSound(): void {
  vrAudioEngine.playHover()
}

export function playVRClickSound(): void {
  vrAudioEngine.playClick()
}

/* ==========================================================================
   Static-Position, Color-Only Hover 3D Button (Zero Z-Pop / Zero Flicker)
   ========================================================================== */

export interface VRButton3DProps {
  position: [number, number, number]
  width: number
  height: number
  label: string
  fontSize?: number
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'active'
  disabled?: boolean
  onClick: () => void
  onHoverChange?: (hovered: boolean) => void
}

const BUTTON_PALETTES = {
  primary: {
    bg: '#1d4ed8',
    hoverBg: '#2563eb',
    border: '#60a5fa',
    text: '#ffffff',
  },
  accent: {
    bg: '#0f766e',
    hoverBg: '#14b8a6',
    border: '#5eead4',
    text: '#ffffff',
  },
  active: {
    bg: '#1e3a8a',
    hoverBg: '#1d4ed8',
    border: '#38bdf8',
    text: '#e0f2fe',
  },
  danger: {
    bg: '#991b1b',
    hoverBg: '#dc2626',
    border: '#f87171',
    text: '#fee2e2',
  },
  secondary: {
    bg: '#1e293b',
    hoverBg: '#334155',
    border: '#64748b',
    text: '#f8fafc',
  },
} as const

export function VRButton3D({
  position,
  width,
  height,
  label,
  fontSize,
  variant = 'secondary',
  disabled = false,
  onClick,
  onHoverChange,
}: VRButton3DProps) {
  const [hovered, setHovered] = useState(false)
  const hoveredRef = useRef(false)

  // Clean up hover count if button unmounts while hovered
  useEffect(() => {
    return () => {
      if (hoveredRef.current) {
        hoveredRef.current = false
        onHoverChange?.(false)
      }
    }
  }, [onHoverChange])

  const backingGeo = useMemo(
    () => createRoundedRectGeometry(width, height, Math.min(0.012, height * 0.25)),
    [height, width],
  )
  const borderGeo = useMemo(
    () => createRoundedRectGeometry(width + 0.008, height + 0.008, Math.min(0.015, height * 0.28)),
    [height, width],
  )

  useEffect(() => {
    return () => {
      backingGeo.dispose()
      borderGeo.dispose()
    }
  }, [backingGeo, borderGeo])

  const palette = BUTTON_PALETTES[variant]
  const bgColor = disabled ? '#0f172a' : hovered ? palette.hoverBg : palette.bg
  const borderColor = disabled ? '#334155' : hovered ? '#ffffff' : palette.border
  const textColor = disabled ? '#64748b' : palette.text
  const computedFontSize = fontSize ?? Math.min(height * 0.42, 0.026)

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (disabled) return
    if (!hoveredRef.current) {
      hoveredRef.current = true
      setHovered(true)
      onHoverChange?.(true)
      vrAudioEngine.playHover()
    }
    document.body.style.cursor = 'pointer'
  }

  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (hoveredRef.current) {
      hoveredRef.current = false
      setHovered(false)
      onHoverChange?.(false)
    }
    document.body.style.cursor = 'auto'
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (disabled) return
    vrAudioEngine.playClick()
    onClick()
  }

  return (
    // 100% STATIC world position — NEVER shift Z on hover (kills raycast flicker!)
    <group position={position}>
      {/* Border plane behind face */}
      <mesh geometry={borderGeo} position={[0, 0, -0.004]}>
        <meshBasicMaterial color={borderColor} />
      </mesh>

      {/* Interactive button collider & face */}
      <mesh
        geometry={backingGeo}
        position={[0, 0, 0]}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <meshBasicMaterial color={bgColor} />
      </mesh>

      {/* Razor-sharp SDF Text at +0.015m */}
      <Text
        position={[0, 0, 0.015]}
        fontSize={computedFontSize}
        color={textColor}
        anchorX="center"
        anchorY="middle"
        maxWidth={width * 0.9}
        overflowWrap="break-word"
        textAlign="center"
      >
        {label}
      </Text>
    </group>
  )
}

/* ==========================================================================
   Static Segmented LED Mic VU Meter (Color-Only Updates, Zero Position/Scale)
   ========================================================================== */

const VU_SEGMENTS = 12

function StaticVUMeter({
  position,
  width,
  height,
  micStatus,
}: {
  position: [number, number, number]
  width: number
  height: number
  micStatus: VRMicStatus
}) {
  const matRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const gap = 0.006
  const segW = (width - gap * (VU_SEGMENTS - 1)) / VU_SEGMENTS

  useFrame(() => {
    const level = vrMicManager.sampleLevel()
    const litCount =
      micStatus === 'active' ? Math.round(Math.max(0, Math.min(1, level)) * VU_SEGMENTS) : 0

    for (let i = 0; i < VU_SEGMENTS; i++) {
      const mat = matRefs.current[i]
      if (!mat) continue
      if (micStatus === 'denied' || micStatus === 'unsupported') {
        mat.color.set('#7f1d1d')
      } else if (i < litCount) {
        if (i >= VU_SEGMENTS - 2) {
          mat.color.set('#f59e0b')
        } else {
          mat.color.set('#10b981')
        }
      } else {
        mat.color.set('#1e293b')
      }
    }
  })

  return (
    <group position={position}>
      {Array.from({ length: VU_SEGMENTS }, (_, i) => {
        const x = -width / 2 + segW / 2 + i * (segW + gap)
        return (
          <mesh key={i} position={[x, 0, 0]}>
            <planeGeometry args={[segW, height]} />
            <meshBasicMaterial
              ref={(el) => {
                matRefs.current[i] = el
              }}
              color="#1e293b"
            />
          </mesh>
        )
      })}
    </group>
  )
}

/* ==========================================================================
   S2.2 / S2.2b — Podium Presenter Console (0.58m W × 0.36m H)
   ========================================================================== */

export interface VRPodiumHUDProps {
  position: [number, number, number]
  rotation: [number, number, number]
  setup: SessionSetup
  language: AppLanguage
  topics: Topic[]
  currentSlideIndex: number
  elapsedSeconds: number
  remainingSeconds: number
  liveWpm: number
  liveWordCount: number
  liveFillers: number
  isSpeaking: boolean
  captionsEnabled: boolean
  liveCaption: string
  micStatus: VRMicStatus
  micError: string | null
  panelVisible: boolean
  isPaused: boolean
  hasActiveQuestion: boolean
  onPrevSlide: () => void
  onNextSlide: () => void
  onToggleQA: () => void
  onTogglePanel: () => void
  onTogglePause: () => void
  onHoverChange: (hovered: boolean) => void
}

export function VRPodiumHUD({
  position,
  rotation,
  setup,
  language,
  topics,
  currentSlideIndex,
  elapsedSeconds,
  remainingSeconds,
  liveWpm,
  liveWordCount,
  liveFillers,
  isSpeaking,
  captionsEnabled,
  liveCaption,
  micStatus,
  micError,
  panelVisible,
  isPaused,
  hasActiveQuestion,
  onPrevSlide,
  onNextSlide,
  onToggleQA,
  onTogglePanel,
  onTogglePause,
  onHoverChange,
}: VRPodiumHUDProps) {
  const totalSlides = Math.max(1, topics.length)
  const activeTopic = topics[currentSlideIndex]
  const nextTopic = topics[currentSlideIndex + 1]
  const isInterview = setup.practiceType === 'interview'

  const warnTime = setup.oneMinWarning && remainingSeconds > 0 && remainingSeconds <= 60
  const timeUp = remainingSeconds === 0
  const accentColor = timeUp ? '#ef4444' : warnTime ? '#f59e0b' : '#14b8a6'

  const voiceBadgeBg =
    micStatus === 'denied' || micStatus === 'unsupported'
      ? '#7f1d1d'
      : isSpeaking
        ? '#065f46'
        : '#1e293b'
  const voiceBadgeColor =
    micStatus === 'denied' || micStatus === 'unsupported'
      ? '#fecaca'
      : isSpeaking
        ? '#6ee7b7'
        : '#94a3b8'
  const voiceBadgeText =
    micStatus === 'denied' || micStatus === 'unsupported'
      ? 'MIC BLOCKED'
      : isSpeaking
        ? `● Speaking · ${liveWpm || 125} wpm`
        : micStatus === 'active'
          ? '● Listening...'
          : 'MIC STANDBY'

  const counterStr = isInterview
    ? `Question ${currentSlideIndex + 1} of ${totalSlides}`
    : `Slide ${currentSlideIndex + 1} / ${totalSlides}`

  const bottomLine =
    (micStatus === 'denied' || micStatus === 'unsupported') && micError
      ? `! ${micError} — open Menu to retry`
      : captionsEnabled && liveCaption
        ? truncateText(liveCaption, 62)
        : nextTopic
          ? `Next: ${truncateText(nextTopic.title, 44)}`
          : ''

  return (
    <group position={position} rotation={rotation}>
      {/* Outer Backing: exact 0.58m W × 0.36m H */}
      <RoundedPanel width={0.58} height={0.36} radius={0.018} color="#090f1d" />

      {/* Top Accent Strip (+0.015m) */}
      <mesh position={[0, 0.174, 0.015]}>
        <planeGeometry args={[0.56, 0.008]} />
        <meshBasicMaterial color={accentColor} />
      </mesh>

      {/* Row 1: REC Timer + Live Speaking / Listening Pill */}
      <Text
        position={[-0.268, 0.142, 0.015]}
        fontSize={0.023}
        color={timeUp ? '#f87171' : warnTime ? '#fbbf24' : '#38bdf8'}
        anchorX="left"
        anchorY="middle"
      >
        {`● REC ${formatClock(elapsedSeconds)} / ${setup.timeLimitMinutes}:00`}
      </Text>

      <RoundedPanel
        width={0.21}
        height={0.034}
        radius={0.01}
        color={voiceBadgeBg}
        position={[0.165, 0.142, 0.015]}
      />
      <Text
        position={[0.165, 0.142, 0.030]}
        fontSize={0.0155}
        color={voiceBadgeColor}
        anchorX="center"
        anchorY="middle"
      >
        {voiceBadgeText}
      </Text>

      {/* Row 2: Slide Counter + Live Word Count / WPM / Fillers */}
      <Text
        position={[-0.268, 0.102, 0.015]}
        fontSize={0.0165}
        color="#5eead4"
        anchorX="left"
        anchorY="middle"
      >
        {`${counterStr}  ·  ${liveWordCount} ${language === 'fr' ? 'mots' : 'words'}  ·  ${liveWpm} WPM  ·  ${liveFillers} ${language === 'fr' ? 'tics' : 'fillers'}`}
      </Text>

      {/* Row 3: Active Topic Headline */}
      <Text
        position={[-0.268, 0.048, 0.015]}
        fontSize={0.026}
        color="#f8fafc"
        anchorX="left"
        anchorY="middle"
        maxWidth={0.53}
      >
        {truncateText(activeTopic?.title ?? setup.title, 44)}
      </Text>

      {/* Row 4: Caption / Next Up Strip */}
      <RoundedPanel
        width={0.536}
        height={0.044}
        radius={0.008}
        color="#111c33"
        position={[0, -0.018, 0.015]}
      />
      <Text
        position={[-0.256, -0.018, 0.030]}
        fontSize={0.0145}
        color="#cbd5e1"
        anchorX="left"
        anchorY="middle"
        maxWidth={0.51}
      >
        {bottomLine}
      </Text>

      {/* Row 5: Static Segmented LED Mic Level Bar */}
      <Text
        position={[-0.268, -0.068, 0.015]}
        fontSize={0.012}
        color="#64748b"
        anchorX="left"
        anchorY="middle"
      >
        MIC LEVEL
      </Text>
      <StaticVUMeter
        position={[0.045, -0.068, 0.015]}
        width={0.44}
        height={0.016}
        micStatus={micStatus}
      />

      {/* Row 6: 5 Interactive Podium Buttons (+0.015m) */}
      <VRButton3D
        position={[-0.220, -0.130, 0.015]}
        width={0.102}
        height={0.048}
        label="◀ Prev"
        fontSize={0.016}
        variant="secondary"
        disabled={currentSlideIndex <= 0 || isPaused}
        onClick={onPrevSlide}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[-0.110, -0.130, 0.015]}
        width={0.102}
        height={0.048}
        label="Next ▶"
        fontSize={0.016}
        variant="primary"
        disabled={currentSlideIndex >= totalSlides - 1 || isPaused}
        onClick={onNextSlide}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0, -0.130, 0.015]}
        width={0.102}
        height={0.048}
        label={hasActiveQuestion ? '✓ Done' : 'Q&A'}
        fontSize={0.016}
        variant={hasActiveQuestion ? 'accent' : 'secondary'}
        disabled={isPaused}
        onClick={onToggleQA}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.110, -0.130, 0.015]}
        width={0.102}
        height={0.048}
        label={panelVisible ? 'Hide: B' : 'Panel: B'}
        fontSize={0.015}
        variant={panelVisible ? 'active' : 'secondary'}
        onClick={onTogglePanel}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.220, -0.130, 0.015]}
        width={0.102}
        height={0.048}
        label={isPaused ? '▶ Play' : '⏸ Menu'}
        fontSize={0.0155}
        variant={isPaused ? 'accent' : 'danger'}
        onClick={onTogglePause}
        onHoverChange={onHoverChange}
      />
    </group>
  )
}

/* ==========================================================================
   S2.2 / S2.2b / S2.3 — Private Presenter Panel ("Only you see this")
   ========================================================================== */

export interface VRTeleprompterBoardProps {
  visible: boolean
  setup: SessionSetup
  language: AppLanguage
  topics: Topic[]
  currentSlideIndex: number
  coveredIds: Set<string>
  elapsedSeconds: number
  activeQuestion: QAQuestion | null
  answerSeconds: number
  questionsRemaining: number
  followUpsEnabled: boolean
  onJumpToSlide: (idx: number) => void
  onFinishAnswer: () => void
  onReturnToSlide: () => void
  onTogglePanel: () => void
  onHoverChange: (hovered: boolean) => void
}

export function VRTeleprompterBoard({
  visible,
  setup,
  topics,
  currentSlideIndex,
  coveredIds,
  elapsedSeconds,
  activeQuestion,
  answerSeconds,
  questionsRemaining,
  followUpsEnabled,
  onJumpToSlide,
  onFinishAnswer,
  onReturnToSlide,
  onTogglePanel,
  onHoverChange,
}: VRTeleprompterBoardProps) {
  if (!visible && !activeQuestion) return null

  const isInterview = setup.practiceType === 'interview'
  const visibleTopics = topics.slice(0, 5)
  const panelW = 0.62
  const panelH = 0.62

  return (
    <group position={[0.74, 1.40, -1.16]} rotation={[0, -0.44, 0]}>
      <RoundedPanel width={panelW} height={panelH} radius={0.022} color="#090f1d" />

      {/* Privacy Header Strip (+0.015m) */}
      <mesh position={[0, 0.285, 0.015]}>
        <planeGeometry args={[0.59, 0.042]} />
        <meshBasicMaterial color={activeQuestion ? '#d97706' : '#0f766e'} />
      </mesh>
      <Text
        position={[-0.275, 0.285, 0.030]}
        fontSize={0.017}
        color="#ffffff"
        anchorX="left"
        anchorY="middle"
      >
        Only you see this
      </Text>
      <Text
        position={[0.275, 0.285, 0.030]}
        fontSize={0.015}
        color="#e2e8f0"
        anchorX="right"
        anchorY="middle"
      >
        {isInterview ? 'Menu: pause / hint' : 'Hide panel: B'}
      </Text>

      {activeQuestion ? (
        <>
          <Text
            position={[-0.275, 0.225, 0.015]}
            fontSize={0.025}
            color="#fbbf24"
            anchorX="left"
            anchorY="middle"
          >
            {`Answering · ${formatClock(answerSeconds)}`}
          </Text>
          <Text
            position={[0.275, 0.225, 0.015]}
            fontSize={0.018}
            color={answerSeconds > 45 ? '#f87171' : '#5eead4'}
            anchorX="right"
            anchorY="middle"
          >
            Aim: under 0:45
          </Text>
          <Text
            position={[-0.275, 0.184, 0.015]}
            fontSize={0.016}
            color="#94a3b8"
            anchorX="left"
            anchorY="middle"
          >
            {`Return to → Slide ${activeQuestion.slideIndex + 1}  ·  Questions left: ${questionsRemaining}`}
          </Text>

          <RoundedPanel
            width={0.56}
            height={0.22}
            radius={0.014}
            color="#111c33"
            position={[0, 0.045, 0.015]}
          />
          <Text
            position={[-0.255, 0.12, 0.030]}
            fontSize={0.021}
            color="#f8fafc"
            anchorX="left"
            anchorY="top"
            maxWidth={0.51}
          >
            {`“${truncateText(activeQuestion.text, 140)}”`}
          </Text>

          {followUpsEnabled && !activeQuestion.isFollowUp && (
            <VRButton3D
              position={[0, -0.145, 0.015]}
              width={0.54}
              height={0.064}
              label="Done Answering → Ask Follow-Up"
              fontSize={0.019}
              variant="primary"
              onClick={onFinishAnswer}
              onHoverChange={onHoverChange}
            />
          )}
          <VRButton3D
            position={[0, -0.230, 0.015]}
            width={0.54}
            height={0.064}
            label={`Return to → Slide ${activeQuestion.slideIndex + 1}`}
            fontSize={0.019}
            variant="secondary"
            onClick={onReturnToSlide}
            onHoverChange={onHoverChange}
          />
        </>
      ) : isInterview ? (
        <>
          <Text
            position={[-0.275, 0.22, 0.015]}
            fontSize={0.028}
            color="#f8fafc"
            anchorX="left"
            anchorY="middle"
          >
            {`Question ${currentSlideIndex + 1} of ${Math.max(1, topics.length)}`}
          </Text>

          {[
            { label: 'Coached mode', val: setup.coachedMode ? 'ON' : 'OFF', col: setup.coachedMode ? '#34d399' : '#94a3b8' },
            { label: 'Follow ups', val: setup.followUps ? 'ON' : 'OFF', col: setup.followUps ? '#38bdf8' : '#94a3b8' },
            { label: 'Time', val: `${formatClock(elapsedSeconds)} / ${setup.timeLimitMinutes}:00`, col: '#f8fafc' },
          ].map((row, idx) => (
            <group key={row.label} position={[0, 0.13 - idx * 0.082, 0.015]}>
              <RoundedPanel width={0.56} height={0.064} radius={0.012} color="#111c33" />
              <Text
                position={[-0.255, 0, 0.015]}
                fontSize={0.02}
                color="#94a3b8"
                anchorX="left"
                anchorY="middle"
              >
                {row.label}
              </Text>
              <Text
                position={[0.255, 0, 0.015]}
                fontSize={0.021}
                color={row.col}
                anchorX="right"
                anchorY="middle"
              >
                {row.val}
              </Text>
            </group>
          ))}

          <Text
            position={[-0.275, -0.125, 0.015]}
            fontSize={0.018}
            color="#5eead4"
            anchorX="left"
            anchorY="middle"
            maxWidth={0.55}
          >
            {`Topic: ${truncateText(topics[currentSlideIndex]?.title ?? setup.title, 38)}`}
          </Text>

          <VRButton3D
            position={[0, -0.23, 0.015]}
            width={0.54}
            height={0.064}
            label="Hide private panel (B)"
            fontSize={0.019}
            variant="secondary"
            onClick={onTogglePanel}
            onHoverChange={onHoverChange}
          />
        </>
      ) : (
        <>
          <Text
            position={[-0.275, 0.228, 0.015]}
            fontSize={0.024}
            color="#f8fafc"
            anchorX="left"
            anchorY="middle"
          >
            {`REC ${formatClock(elapsedSeconds)} / ${setup.timeLimitMinutes}:00`}
          </Text>
          <Text
            position={[0.275, 0.228, 0.015]}
            fontSize={0.020}
            color="#5eead4"
            anchorX="right"
            anchorY="middle"
          >
            {`Slide ${currentSlideIndex + 1} / ${Math.max(1, topics.length)}`}
          </Text>
          <Text
            position={[-0.275, 0.188, 0.015]}
            fontSize={0.015}
            color="#94a3b8"
            anchorX="left"
            anchorY="middle"
          >
            Outline (auto-checks after ~5s speaking)
          </Text>

          {visibleTopics.map((topic, idx) => {
            const isCurrent = idx === currentSlideIndex
            const isCovered = coveredIds.has(topic.id)
            const glyph = isCovered ? '✓ ' : isCurrent ? '▸ ' : '○ '
            return (
              <VRButton3D
                key={topic.id}
                position={[0, 0.115 - idx * 0.076, 0.015]}
                width={0.55}
                height={0.062}
                label={`${glyph}${truncateText(topic.title, 26)}`}
                fontSize={0.0185}
                variant={isCurrent ? 'active' : 'secondary'}
                onClick={() => onJumpToSlide(idx)}
                onHoverChange={onHoverChange}
              />
            )
          })}
        </>
      )}
    </group>
  )
}

/* ==========================================================================
   S2.3 — Floating Speech Bubble Above Asking Student / Recruiter
   ========================================================================== */

export function VRQuestionBubble3D({
  position,
  question,
}: {
  position: [number, number, number]
  question: QAQuestion
}) {
  return (
    <group position={position}>
      <RoundedPanel width={1.06} height={0.38} radius={0.028} color="#1d4ed8" />
      <RoundedPanel width={1.03} height={0.35} radius={0.024} color="#ffffff" position={[0, 0, 0.015]} />

      <Text
        position={[-0.47, 0.125, 0.030]}
        fontSize={0.028}
        color="#1d4ed8"
        anchorX="left"
        anchorY="middle"
      >
        {question.speakerLabel}
      </Text>

      <RoundedPanel
        width={0.22}
        height={0.046}
        radius={0.018}
        color="#0f766e"
        position={[0.37, 0.125, 0.030]}
      />
      <Text
        position={[0.37, 0.125, 0.045]}
        fontSize={0.020}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        ● Listening…
      </Text>

      <Text
        position={[-0.47, 0.065, 0.030]}
        fontSize={0.030}
        color="#0f172a"
        anchorX="left"
        anchorY="top"
        maxWidth={0.94}
      >
        {`“${truncateText(question.text, 130)}”`}
      </Text>
    </group>
  )
}

/* ==========================================================================
   S2.4 — Crisp 1-Minute Warning Floating Banner
   ========================================================================== */

export function VROneMinWarningBanner3D({
  visible,
  timeUp,
}: {
  visible: boolean
  timeUp: boolean
}) {
  if (!visible) return null

  return (
    <group position={[0, 2.02, -1.62]}>
      <RoundedPanel
        width={0.94}
        height={0.11}
        radius={0.022}
        color={timeUp ? '#fca5a5' : '#fde68a'}
      />
      <RoundedPanel
        width={0.92}
        height={0.095}
        radius={0.018}
        color={timeUp ? '#991b1b' : '#b45309'}
        position={[0, 0, 0.015]}
      />
      <Text
        position={[0, 0, 0.030]}
        fontSize={0.030}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {timeUp ? 'Time is up — wrap up your closing point' : '1 minute left — start wrapping up'}
      </Text>
    </group>
  )
}

/* ==========================================================================
   S2.5 / S2.5b — Pause Menu (0.95m W × 0.78m H at 1.55m, y = 1.48m)
   ========================================================================== */

export interface VRPauseMenu3DProps {
  visible: boolean
  setup: SessionSetup
  language: AppLanguage
  elapsedSeconds: number
  pairingCode?: string | null
  currentTopicTitle: string
  micStatus: VRMicStatus
  panelVisible: boolean
  hintUsed: boolean
  musicEnabled: boolean
  seatedHeightMode: boolean
  isXRPresenting: boolean
  onSelectVenue: (venue: VenueType) => void
  onRetryMic: () => void
  onToggleMusic: () => void
  onToggleHeightMode: () => void
  onTogglePanel: () => void
  onUseHint: () => void
  onResume: () => void
  onRestartCurrentSlide: () => void
  onRestartBeginning: () => void
  onEndSession: () => void
  onExitVR: () => void
  onHoverChange: (hovered: boolean) => void
}

const VENUE_CHOICES: { id: VenueType; label: string }[] = [
  { id: 'classroom', label: 'Classroom' },
  { id: 'lecture_hall', label: 'Lecture' },
  { id: 'auditorium', label: 'Auditorium' },
  { id: 'interview_room', label: 'Interview' },
  { id: 'panel_room', label: 'Panel' },
]

export function VRPauseMenu3D({
  visible,
  setup,
  elapsedSeconds,
  pairingCode,
  currentTopicTitle,
  micStatus,
  panelVisible,
  hintUsed,
  musicEnabled,
  seatedHeightMode,
  isXRPresenting,
  onSelectVenue,
  onRetryMic,
  onToggleMusic,
  onToggleHeightMode,
  onTogglePanel,
  onUseHint,
  onResume,
  onRestartCurrentSlide,
  onRestartBeginning,
  onEndSession,
  onExitVR,
  onHoverChange,
}: VRPauseMenu3DProps) {
  const [showParHint, setShowParHint] = useState(false)

  // Reset hint card when closing menu so reopen stays clean
  useEffect(() => {
    if (!visible) setShowParHint(false)
  }, [visible])

  if (!visible) return null

  const showHintButton = setup.coachedMode || setup.practiceType === 'interview'

  return (
    <group position={[0, 1.48, -1.55]}>
      {/* Exact 0.95m W × 0.78m H */}
      <RoundedPanel width={0.95} height={0.78} radius={0.028} color="#090f1d" />
      <mesh position={[0, 0.382, 0.015]}>
        <planeGeometry args={[0.91, 0.010]} />
        <meshBasicMaterial color="#2563eb" />
      </mesh>

      <Text
        position={[-0.43, 0.335, 0.015]}
        fontSize={0.036}
        color="#f8fafc"
        anchorX="left"
        anchorY="middle"
      >
        {`Paused · ${formatClock(elapsedSeconds)}`}
      </Text>
      <Text
        position={[0.43, 0.335, 0.015]}
        fontSize={0.020}
        color="#38bdf8"
        anchorX="right"
        anchorY="middle"
      >
        {pairingCode ? `CODE: ${pairingCode}` : 'VR ACTIVE'}
      </Text>
      <Text
        position={[-0.43, 0.285, 0.015]}
        fontSize={0.019}
        color="#94a3b8"
        anchorX="left"
        anchorY="middle"
      >
        The audience is frozen while paused. Paused time is not counted.
      </Text>

      {/* Optional PAR Hint Callout */}
      {showParHint && (
        <group position={[0, 0.215, 0.015]}>
          <RoundedPanel width={0.87} height={0.072} radius={0.012} color="#115e59" />
          <Text
            position={[-0.41, 0, 0.015]}
            fontSize={0.017}
            color="#ccfbf1"
            anchorX="left"
            anchorY="middle"
            maxWidth={0.82}
          >
            {`PAR Hint (${truncateText(currentTopicTitle, 20)}): What was the problem, what did you do, and what happened?`}
          </Text>
        </group>
      )}

      {/* Row 1: Primary Resume + Give me a hint / Mic */}
      <VRButton3D
        position={[-0.22, 0.115, 0.015]}
        width={0.42}
        height={0.074}
        label="▶ Resume"
        fontSize={0.024}
        variant="primary"
        onClick={onResume}
        onHoverChange={onHoverChange}
      />
      {showHintButton ? (
        <VRButton3D
          position={[0.22, 0.115, 0.015]}
          width={0.42}
          height={0.074}
          label={hintUsed ? 'PAR Hint Shown' : 'Give me a hint (PAR)'}
          fontSize={0.021}
          variant="accent"
          onClick={() => {
            setShowParHint(true)
            if (!hintUsed) onUseHint()
          }}
          onHoverChange={onHoverChange}
        />
      ) : (
        <VRButton3D
          position={[0.22, 0.115, 0.015]}
          width={0.42}
          height={0.074}
          label={micStatus === 'active' ? '● Microphone Active' : 'Enable Microphone'}
          fontSize={0.021}
          variant={micStatus === 'active' ? 'secondary' : 'accent'}
          onClick={onRetryMic}
          onHoverChange={onHoverChange}
        />
      )}

      {/* Row 2: Restart current / Restart beginning / Private panel */}
      <VRButton3D
        position={[-0.295, 0.015, 0.015]}
        width={0.27}
        height={0.068}
        label="Restart slide"
        fontSize={0.0185}
        variant="secondary"
        onClick={onRestartCurrentSlide}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0, 0.015, 0.015]}
        width={0.27}
        height={0.068}
        label="Restart beginning"
        fontSize={0.0185}
        variant="secondary"
        onClick={onRestartBeginning}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.295, 0.015, 0.015]}
        width={0.27}
        height={0.068}
        label={panelVisible ? 'Hide private panel' : 'Show private panel'}
        fontSize={0.018}
        variant="secondary"
        onClick={onTogglePanel}
        onHoverChange={onHoverChange}
      />

      {/* Row 3: Music On/Off + Standing/Seated Height */}
      <VRButton3D
        position={[-0.22, -0.080, 0.015]}
        width={0.42}
        height={0.064}
        label={musicEnabled ? 'Music: ON' : 'Music: OFF'}
        fontSize={0.019}
        variant={musicEnabled ? 'active' : 'secondary'}
        onClick={onToggleMusic}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.22, -0.080, 0.015]}
        width={0.42}
        height={0.064}
        label={seatedHeightMode ? 'Height: Seated (+0.35m)' : 'Height: Standing'}
        fontSize={0.019}
        variant={seatedHeightMode ? 'active' : 'secondary'}
        onClick={onToggleHeightMode}
        onHoverChange={onHoverChange}
      />

      {/* Row 4: Quick Venue Switcher */}
      {VENUE_CHOICES.map((v, idx) => (
        <VRButton3D
          key={v.id}
          position={[-0.352 + idx * 0.176, -0.172, 0.015]}
          width={0.162}
          height={0.058}
          label={v.label}
          fontSize={0.017}
          variant={setup.venue === v.id ? 'active' : 'secondary'}
          onClick={() => onSelectVenue(v.id)}
          onHoverChange={onHoverChange}
        />
      ))}

      {/* Row 5: End session & see feedback + Exit VR */}
      <VRButton3D
        position={[-0.15, -0.285, 0.015]}
        width={0.56}
        height={0.074}
        label="End session & see feedback"
        fontSize={0.022}
        variant="accent"
        onClick={onEndSession}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.295, -0.285, 0.015]}
        width={0.27}
        height={0.074}
        label={isXRPresenting ? 'Exit VR' : 'Close Menu'}
        fontSize={0.021}
        variant="danger"
        onClick={isXRPresenting ? onExitVR : onResume}
        onHoverChange={onHoverChange}
      />
    </group>
  )
}

/* ==========================================================================
   S2.6 — Session Complete / Quick Debrief (0.95m W × 0.78m H at 1.55m, y = 1.48m)
   ========================================================================== */

export interface VRDebriefPanel3DProps {
  record: SessionRecord
  language: AppLanguage
  onTryAgain: () => void
  onRaiseDifficulty: () => void
  onExitToReport: () => void
  onExitToLobby: () => void
  onHoverChange: (hovered: boolean) => void
}

export function VRDebriefPanel3D({
  record,
  onTryAgain,
  onRaiseDifficulty,
  onExitToReport,
  onExitToLobby,
  onHoverChange,
}: VRDebriefPanel3DProps) {
  const kpis = [
    { label: 'Words/min', val: `${record.wpm}`, sub: 'Target 120–150' },
    { label: 'Filler words', val: `${record.fillerCount}`, sub: 'um / uh / like' },
    { label: 'Points covered', val: `${record.topicsCovered}/${record.topicsTotal}`, sub: 'Outline points' },
    { label: 'Time vs limit', val: formatClock(record.durationSeconds), sub: `/ ${record.timeLimitMinutes}:00` },
  ]

  const topTip =
    record.recommendations[0] ?? 'Great run! Review your full delivery breakdown on your phone.'

  return (
    <group position={[0, 1.48, -1.55]}>
      {/* Exact 0.95m W × 0.78m H */}
      <RoundedPanel width={0.95} height={0.78} radius={0.028} color="#090f1d" />
      <mesh position={[0, 0.382, 0.015]}>
        <planeGeometry args={[0.91, 0.010]} />
        <meshBasicMaterial color="#14b8a6" />
      </mesh>

      <Text
        position={[-0.43, 0.34, 0.015]}
        fontSize={0.018}
        color="#5eead4"
        anchorX="left"
        anchorY="middle"
      >
        QUICK DEBRIEF · S2.6
      </Text>
      <Text
        position={[-0.43, 0.285, 0.015]}
        fontSize={0.040}
        color="#f8fafc"
        anchorX="left"
        anchorY="middle"
      >
        Session complete
      </Text>

      {/* 4 Wireframe KPI Cards */}
      {kpis.map((kpi, idx) => {
        const x = -0.33 + idx * 0.22
        return (
          <group key={kpi.label} position={[x, 0.12, 0.015]}>
            <RoundedPanel width={0.205} height={0.185} radius={0.016} color="#111c33" />
            <Text
              position={[0, 0.058, 0.015]}
              fontSize={0.017}
              color="#94a3b8"
              anchorX="center"
              anchorY="middle"
            >
              {kpi.label}
            </Text>
            <Text
              position={[0, 0.0, 0.015]}
              fontSize={0.038}
              color="#f8fafc"
              anchorX="center"
              anchorY="middle"
            >
              {kpi.val}
            </Text>
            <Text
              position={[0, -0.056, 0.015]}
              fontSize={0.0145}
              color="#64748b"
              anchorX="center"
              anchorY="middle"
            >
              {kpi.sub}
            </Text>
          </group>
        )
      })}

      {/* Recommendation Strip */}
      <RoundedPanel width={0.86} height={0.11} radius={0.014} color="#111c33" position={[0, -0.065, 0.015]} />
      <Text
        position={[-0.40, -0.065, 0.030]}
        fontSize={0.0185}
        color="#cbd5e1"
        anchorX="left"
        anchorY="middle"
        maxWidth={0.80}
      >
        {truncateText(topTip, 130)}
      </Text>

      {/* Action Buttons Row 1 */}
      <VRButton3D
        position={[-0.22, -0.195, 0.015]}
        width={0.42}
        height={0.072}
        label="Try again now"
        fontSize={0.021}
        variant="secondary"
        onClick={onTryAgain}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.22, -0.195, 0.015]}
        width={0.42}
        height={0.072}
        label="Raise difficulty"
        fontSize={0.021}
        variant="accent"
        onClick={onRaiseDifficulty}
        onHoverChange={onHoverChange}
      />

      {/* Action Buttons Row 2 */}
      <VRButton3D
        position={[-0.145, -0.295, 0.015]}
        width={0.57}
        height={0.074}
        label="View full report (on phone)"
        fontSize={0.021}
        variant="primary"
        onClick={onExitToReport}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.295, -0.295, 0.015]}
        width={0.27}
        height={0.074}
        label="Exit to lobby"
        fontSize={0.020}
        variant="danger"
        onClick={onExitToLobby}
        onHoverChange={onHoverChange}
      />
    </group>
  )
}

/* ==========================================================================
   S2.1 — 3D Floating VR Lobby (Center 0.95×0.85, Left/Right 0.62×0.78 @ 1.65m, y=1.48m)
   ========================================================================== */

interface VenueCardMeta {
  id: VenueType
  label: string
  seats: string
}

const LOBBY_VENUES: VenueCardMeta[] = [
  { id: 'classroom', label: 'Classroom', seats: '30 seats' },
  { id: 'lecture_hall', label: 'Lecture Hall', seats: '60 seats' },
  { id: 'auditorium', label: 'Auditorium', seats: '200 seats' },
  { id: 'interview_room', label: 'Interview', seats: '1-on-1' },
  { id: 'panel_room', label: 'Panel Room', seats: '3 panelists' },
]

function VRGazeDot3D({
  position,
  label,
  calibrated,
  onCalibrate,
  onHoverChange,
}: {
  position: [number, number, number]
  label: string
  calibrated: boolean
  onCalibrate: () => void
  onHoverChange: (hovered: boolean) => void
}) {
  const [hovered, setHovered] = useState(false)
  const hoveredRef = useRef(false)

  useEffect(() => {
    return () => {
      if (hoveredRef.current) {
        hoveredRef.current = false
        onHoverChange(false)
      }
    }
  }, [onHoverChange])

  const sphereColor = calibrated ? '#10b981' : hovered ? '#7dd3fc' : '#38bdf8'

  return (
    <group position={position}>
      {/* Fixed radius sphere — hover ONLY changes color (zero oscillation) */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation()
          if (!hoveredRef.current) {
            hoveredRef.current = true
            setHovered(true)
            onHoverChange(true)
            vrAudioEngine.playHover()
          }
        }}
        onPointerOut={(e) => {
          e.stopPropagation()
          if (hoveredRef.current) {
            hoveredRef.current = false
            setHovered(false)
            onHoverChange(false)
          }
        }}
        onClick={(e) => {
          e.stopPropagation()
          vrAudioEngine.playClick()
          onCalibrate()
        }}
      >
        <sphereGeometry args={[0.048, 20, 20]} />
        <meshBasicMaterial color={sphereColor} />
      </mesh>
      <Text
        position={[0, -0.082, 0]}
        fontSize={0.028}
        color={calibrated ? '#34d399' : '#f8fafc'}
        anchorX="center"
        anchorY="middle"
      >
        {calibrated ? `✓ ${label}` : label}
      </Text>
    </group>
  )
}

export interface VRFloatingLobby3DProps {
  setup: SessionSetup
  selectedVenue: VenueType
  pairingCode: string
  pairingStatus: 'waiting' | 'paired'
  micStatus: VRMicStatus
  micCheckPassed: boolean
  gazeCalibrated: { left: boolean; centre: boolean; right: boolean }
  triggerTested: boolean
  musicEnabled: boolean
  seatedHeightMode: boolean
  language: AppLanguage
  onCalibrateGaze: (zone: 'left' | 'centre' | 'right') => void
  onTestTrigger: () => void
  onSelectVenueAndStart: (venue: VenueType) => void
  onStartPractice: () => void
  onRegenerateCode: () => void
  onEnableMic: () => void
  onToggleMusic: () => void
  onToggleHeightMode: () => void
  onHoverChange: (hovered: boolean) => void
}

export function VRFloatingLobby3D({
  setup,
  selectedVenue,
  pairingCode,
  pairingStatus,
  micStatus,
  micCheckPassed,
  gazeCalibrated,
  triggerTested,
  musicEnabled,
  seatedHeightMode,
  language,
  onCalibrateGaze,
  onTestTrigger,
  onSelectVenueAndStart,
  onStartPractice,
  onRegenerateCode,
  onEnableMic,
  onToggleMusic,
  onToggleHeightMode,
  onHoverChange,
}: VRFloatingLobby3DProps) {
  const isFr = language === 'fr'
  const venueMeta = LOBBY_VENUES.find((v) => v.id === selectedVenue) ?? LOBBY_VENUES[0]
  const gazeCount =
    (gazeCalibrated.left ? 1 : 0) +
    (gazeCalibrated.centre ? 1 : 0) +
    (gazeCalibrated.right ? 1 : 0)
  const allGazeDone = gazeCount === 3

  const checklistRows = [
    {
      title: '1. Microphone',
      desc: 'Say "Testing, one, two..."',
      badge: micCheckPassed
        ? '✓ Good level'
        : micStatus === 'active'
          ? 'Listening...'
          : micStatus === 'denied'
            ? 'Blocked'
            : 'Standby',
      done: micCheckPassed,
    },
    {
      title: '2. Eye contact calibration',
      desc: 'Look at the 3 dots above: Left · Centre · Right',
      badge: allGazeDone ? '✓ 3 / 3 Done' : `${gazeCount} / 3 dots`,
      done: allGazeDone,
    },
    {
      title: '3. Slide control',
      desc: 'Pull trigger (or tap Test) to advance slides',
      badge: triggerTested ? '✓ Ready' : 'Pull trigger',
      done: triggerTested,
    },
  ]

  return (
    <group>
      {/* 3 Static Glowing Gaze Calibration Dots (S2.1 Step 2) */}
      <VRGazeDot3D
        position={[-0.68, 2.04, -1.72]}
        label="Left"
        calibrated={gazeCalibrated.left}
        onCalibrate={() => onCalibrateGaze('left')}
        onHoverChange={onHoverChange}
      />
      <VRGazeDot3D
        position={[0, 2.08, -1.76]}
        label="Centre"
        calibrated={gazeCalibrated.centre}
        onCalibrate={() => onCalibrateGaze('centre')}
        onHoverChange={onHoverChange}
      />
      <VRGazeDot3D
        position={[0.68, 2.04, -1.72]}
        label="Right"
        calibrated={gazeCalibrated.right}
        onCalibrate={() => onCalibrateGaze('right')}
        onHoverChange={onHoverChange}
      />

      {/* CENTER FLOATING PANEL: 0.95m W × 0.85m H at 1.65m, y = 1.48m */}
      <group position={[0, 1.48, -1.65]}>
        <RoundedPanel width={0.95} height={0.85} radius={0.028} color="#090f1d" />
        <mesh position={[0, 0.418, 0.015]}>
          <planeGeometry args={[0.91, 0.010]} />
          <meshBasicMaterial color="#14b8a6" />
        </mesh>

        {/* Session Header */}
        <Text
          position={[-0.43, 0.375, 0.015]}
          fontSize={0.021}
          color="#94a3b8"
          anchorX="left"
          anchorY="middle"
        >
          ● REC --:--
        </Text>
        <Text
          position={[0.43, 0.375, 0.015]}
          fontSize={0.021}
          color="#5eead4"
          anchorX="right"
          anchorY="middle"
        >
          {`${venueMeta.label} (${venueMeta.seats}) · ${setup.timeLimitMinutes} min`}
        </Text>
        <Text
          position={[-0.43, 0.322, 0.015]}
          fontSize={0.032}
          color="#f8fafc"
          anchorX="left"
          anchorY="middle"
          maxWidth={0.86}
        >
          {truncateText(setup.title, 36)}
        </Text>

        {/* 3-Step Pre-Flight Checklist */}
        {checklistRows.map((row, idx) => {
          const y = 0.21 - idx * 0.138
          return (
            <group key={row.title} position={[0, y, 0.015]}>
              <RoundedPanel
                width={0.87}
                height={0.116}
                radius={0.016}
                color={row.done ? '#064e3b' : '#111c33'}
              />
              <Text
                position={[-0.405, 0.022, 0.015]}
                fontSize={0.024}
                color="#f8fafc"
                anchorX="left"
                anchorY="middle"
              >
                {row.title}
              </Text>
              <Text
                position={[-0.405, -0.024, 0.015]}
                fontSize={0.0175}
                color="#cbd5e1"
                anchorX="left"
                anchorY="middle"
                maxWidth={0.56}
              >
                {row.desc}
              </Text>
              <RoundedPanel
                width={0.21}
                height={0.052}
                radius={0.018}
                color={row.done ? '#059669' : '#1e293b'}
                position={[0.30, 0, 0.015]}
              />
              <Text
                position={[0.30, 0, 0.030]}
                fontSize={0.0175}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
              >
                {row.badge}
              </Text>
            </group>
          )
        })}

        {/* ALWAYS-CLICKABLE Start Session CTA + Test Trigger */}
        <VRButton3D
          position={[-0.28, -0.275, 0.015]}
          width={0.30}
          height={0.082}
          label={triggerTested ? '✓ Trigger OK' : 'Test Trigger'}
          fontSize={0.020}
          variant={triggerTested ? 'accent' : 'secondary'}
          onClick={onTestTrigger}
          onHoverChange={onHoverChange}
        />
        <VRButton3D
          position={[0.165, -0.275, 0.015]}
          width={0.54}
          height={0.088}
          label="▶ Start session"
          fontSize={0.026}
          variant="primary"
          onClick={onStartPractice}
          onHoverChange={onHoverChange}
        />

        {/* Footer Controls Hint */}
        <Text
          position={[0, -0.375, 0.015]}
          fontSize={0.017}
          color="#64748b"
          anchorX="center"
          anchorY="middle"
        >
          Trigger: next slide  ·  B: hide panel  ·  Menu: pause
        </Text>
      </group>

      {/* LEFT FLOATING PANEL: 0.62m W × 0.78m H (Pairing Code + Instant Venue Launch) */}
      <group position={[-0.86, 1.48, -1.42]} rotation={[0, 0.42, 0]}>
        <RoundedPanel width={0.62} height={0.78} radius={0.026} color="#090f1d" />
        <mesh position={[0, 0.382, 0.015]}>
          <planeGeometry args={[0.58, 0.010]} />
          <meshBasicMaterial color={pairingStatus === 'paired' ? '#10b981' : '#38bdf8'} />
        </mesh>

        <Text
          position={[0, 0.335, 0.015]}
          fontSize={0.020}
          color="#94a3b8"
          anchorX="center"
          anchorY="middle"
        >
          {isFr ? 'JUMELAGE TÉLÉPHONE' : 'PHONE PAIRING CODE'}
        </Text>

        {/* Big 4-Digit Code Display */}
        <RoundedPanel width={0.52} height={0.12} radius={0.016} color="#111c33" position={[0, 0.235, 0.015]} />
        <Text
          position={[0, 0.235, 0.030]}
          fontSize={0.068}
          color="#f8fafc"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
        >
          {pairingCode}
        </Text>

        <Text
          position={[0, 0.140, 0.015]}
          fontSize={0.019}
          color={pairingStatus === 'paired' ? '#34d399' : '#fbbf24'}
          anchorX="center"
          anchorY="middle"
        >
          {pairingStatus === 'paired' ? '● Paired · Launching...' : '● Waiting for Phone...'}
        </Text>

        <VRButton3D
          position={[0, 0.072, 0.015]}
          width={0.52}
          height={0.058}
          label="↻ New Pairing Code"
          fontSize={0.018}
          variant="secondary"
          onClick={onRegenerateCode}
          onHoverChange={onHoverChange}
        />

        <Text
          position={[0, 0.005, 0.015]}
          fontSize={0.017}
          color="#64748b"
          anchorX="center"
          anchorY="middle"
        >
          TAP A VENUE TO ENTER IMMEDIATELY
        </Text>

        {/* 5 Venue Quick-Launch Buttons */}
        {LOBBY_VENUES.map((v, idx) => {
          const col = idx % 2
          const row = Math.floor(idx / 2)
          const isLastOdd = idx === 4
          const x = isLastOdd ? 0 : col === 0 ? -0.135 : 0.135
          const y = -0.075 - row * 0.095
          return (
            <VRButton3D
              key={v.id}
              position={[x, y, 0.015]}
              width={isLastOdd ? 0.52 : 0.25}
              height={0.074}
              label={v.label}
              fontSize={0.020}
              variant={selectedVenue === v.id ? 'active' : 'secondary'}
              onClick={() => onSelectVenueAndStart(v.id)}
              onHoverChange={onHoverChange}
            />
          )
        })}
      </group>

      {/* RIGHT FLOATING PANEL: 0.62m W × 0.78m H (Mic VU + Audio/Height + Start) */}
      <group position={[0.86, 1.48, -1.42]} rotation={[0, -0.42, 0]}>
        <RoundedPanel width={0.62} height={0.78} radius={0.026} color="#090f1d" />
        <mesh position={[0, 0.382, 0.015]}>
          <planeGeometry args={[0.58, 0.010]} />
          <meshBasicMaterial
            color={
              micStatus === 'active'
                ? '#10b981'
                : micStatus === 'denied' || micStatus === 'unsupported'
                  ? '#ef4444'
                  : '#38bdf8'
            }
          />
        </mesh>

        <Text
          position={[0, 0.335, 0.015]}
          fontSize={0.020}
          color="#94a3b8"
          anchorX="center"
          anchorY="middle"
        >
          AUDIO & COMFORT
        </Text>

        <Text
          position={[0, 0.270, 0.015]}
          fontSize={0.028}
          color={
            micStatus === 'active'
              ? '#34d399'
              : micStatus === 'denied' || micStatus === 'unsupported'
                ? '#f87171'
                : '#f8fafc'
          }
          anchorX="center"
          anchorY="middle"
        >
          {micStatus === 'active'
            ? '● MIC LIVE'
            : micStatus === 'denied' || micStatus === 'unsupported'
              ? '! MIC BLOCKED'
              : '● MIC STANDBY'}
        </Text>

        <Text
          position={[0, 0.215, 0.015]}
          fontSize={0.017}
          color="#94a3b8"
          anchorX="center"
          anchorY="middle"
        >
          Speak now to test live level
        </Text>

        {/* Static Segmented Studio VU Meter */}
        <RoundedPanel width={0.52} height={0.095} radius={0.014} color="#111c33" position={[0, 0.125, 0.015]} />
        <StaticVUMeter
          position={[0, 0.125, 0.030]}
          width={0.46}
          height={0.048}
          micStatus={micStatus}
        />

        {micStatus !== 'active' && (
          <VRButton3D
            position={[0, 0.015, 0.015]}
            width={0.52}
            height={0.068}
            label="Enable Microphone"
            fontSize={0.020}
            variant="accent"
            onClick={onEnableMic}
            onHoverChange={onHoverChange}
          />
        )}

        <VRButton3D
          position={[0, -0.080, 0.015]}
          width={0.52}
          height={0.068}
          label={musicEnabled ? 'Music: ON' : 'Music: OFF'}
          fontSize={0.020}
          variant={musicEnabled ? 'active' : 'secondary'}
          onClick={onToggleMusic}
          onHoverChange={onHoverChange}
        />

        <VRButton3D
          position={[0, -0.175, 0.015]}
          width={0.52}
          height={0.068}
          label={seatedHeightMode ? 'Height: Seated (+0.35m)' : 'Height: Standing'}
          fontSize={0.019}
          variant={seatedHeightMode ? 'active' : 'secondary'}
          onClick={onToggleHeightMode}
          onHoverChange={onHoverChange}
        />

        <VRButton3D
          position={[0, -0.295, 0.015]}
          width={0.52}
          height={0.086}
          label="▶ Start session"
          fontSize={0.025}
          variant="primary"
          onClick={onStartPractice}
          onHoverChange={onHoverChange}
        />
      </group>
    </group>
  )
}

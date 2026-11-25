import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { QAQuestion } from '../ai/qaEngine'
import { translations } from '../lib/i18n'
import { vrMicManager, type VRMicStatus } from '../lib/vrMicManager'
import type {
  AppLanguage,
  SessionRecord,
  SessionSetup,
  Topic,
  VenueType,
} from '../types/stagera'

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

function wrapText(
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

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(clamped / 60)
  const secs = clamped % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

let uiAudioCtx: AudioContext | null = null

function getUIAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (uiAudioCtx && uiAudioCtx.state !== 'closed') {
    if (uiAudioCtx.state === 'suspended') {
      void uiAudioCtx.resume().catch(() => {})
    }
    return uiAudioCtx
  }
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    uiAudioCtx = new Ctor()
    return uiAudioCtx
  } catch {
    return null
  }
}

export function playVRHoverSound(): void {
  const ctx = getUIAudioContext()
  if (!ctx || ctx.state !== 'running') return
  try {
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(860, now)
    osc.frequency.exponentialRampToValueAtTime(1080, now + 0.032)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.028, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.042)
  } catch {
    // Ignore Web Audio errors on locked contexts
  }
}

export function playVRClickSound(): void {
  const ctx = getUIAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {})
  }
  try {
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(640, now)
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.055)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.06, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.08)
  } catch {
    // Ignore Web Audio errors
  }
}

export interface VRButton3DProps {
  position: [number, number, number]
  width: number
  height: number
  label: string
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
    bg: '#7f1d1d',
    hoverBg: '#b91c1c',
    border: '#f87171',
    text: '#fee2e2',
  },
  secondary: {
    bg: '#1e293b',
    hoverBg: '#334155',
    border: '#64748b',
    text: '#f1f5f9',
  },
} as const

export function VRButton3D({
  position,
  width,
  height,
  label,
  variant = 'secondary',
  disabled = false,
  onClick,
  onHoverChange,
}: VRButton3DProps) {
  const [hovered, setHovered] = useState(false)

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

  const labelTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const canvas = labelTexture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const palette = BUTTON_PALETTES[variant]
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = disabled ? '#64748b' : palette.text
    const fontSize = label.length > 18 ? 34 : label.length > 12 ? 40 : 46
    ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label.slice(0, 26), canvas.width / 2, canvas.height / 2 + 2)
    labelTexture.needsUpdate = true
  }, [disabled, label, labelTexture, variant])

  useEffect(() => {
    return () => labelTexture.dispose()
  }, [labelTexture])

  const palette = BUTTON_PALETTES[variant]
  const bgColor = disabled ? '#0f172a' : hovered ? palette.hoverBg : palette.bg
  const borderColor = disabled ? '#334155' : hovered ? '#ffffff' : palette.border

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (disabled) return
    setHovered(true)
    onHoverChange?.(true)
    playVRHoverSound()
    document.body.style.cursor = 'pointer'
  }

  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (hovered) {
      setHovered(false)
      onHoverChange?.(false)
    }
    document.body.style.cursor = 'auto'
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (disabled) return
    playVRClickSound()
    onClick()
  }

  return (
    <group position={[position[0], position[1], position[2] + (hovered && !disabled ? 0.008 : 0)]}>
      {/* Border / hover glow frame */}
      <mesh geometry={borderGeo} position={[0, 0, -0.001]}>
        <meshStandardMaterial
          color={borderColor}
          emissive={hovered && !disabled ? palette.border : '#000000'}
          emissiveIntensity={hovered && !disabled ? 0.85 : 0}
          roughness={0.4}
        />
      </mesh>

      {/* Interactive collider & button face */}
      <mesh
        geometry={backingGeo}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <meshStandardMaterial
          color={bgColor}
          roughness={0.45}
          metalness={0.1}
        />
      </mesh>

      {/* Crisp label plane */}
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[width * 0.94, height * 0.82]} />
        <meshBasicMaterial map={labelTexture} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

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
  liveFillers: number
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
  liveFillers,
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
  const hudT = translations[language].vr.hud
  const totalSlides = Math.max(1, topics.length)
  const activeTopic = topics[currentSlideIndex]
  const nextTopic = topics[currentSlideIndex + 1]
  const isInterview = setup.practiceType === 'interview'

  const screenTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const canvas = screenTexture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Deep dark slate console background
    ctx.fillStyle = '#090f1d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Subtle top accent bar
    const warnTime = setup.oneMinWarning && remainingSeconds > 0 && remainingSeconds <= 60
    const timeUp = remainingSeconds === 0
    ctx.fillStyle = timeUp ? '#ef4444' : warnTime ? '#f59e0b' : '#14b8a6'
    ctx.fillRect(0, 0, canvas.width, 10)

    // Header row: Timer + Slide Counter + Mic Status Badge
    ctx.fillStyle = timeUp ? '#f87171' : warnTime ? '#fbbf24' : '#38bdf8'
    ctx.font = '800 56px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(formatClock(remainingSeconds), 36, 78)

    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 24px Inter, system-ui, sans-serif'
    ctx.fillText(
      `${hudT.elapsedLabel} ${formatClock(elapsedSeconds)}  ·  ${liveWpm} WPM  ·  ${liveFillers} ${language === 'fr' ? 'tics' : 'fillers'}`,
      240,
      72,
    )

    // Mic Status Pill (top right)
    const micPillColor =
      micStatus === 'active'
        ? '#065f46'
        : micStatus === 'denied' || micStatus === 'unsupported'
          ? '#7f1d1d'
          : '#334155'
    const micDotColor =
      micStatus === 'active'
        ? '#34d399'
        : micStatus === 'denied' || micStatus === 'unsupported'
          ? '#f87171'
          : '#94a3b8'
    const micLabel =
      micStatus === 'active'
        ? 'MIC LIVE'
        : micStatus === 'denied' || micStatus === 'unsupported'
          ? 'MIC BLOCKED'
          : micStatus === 'requesting'
            ? 'MIC...'
            : 'MIC OFF'

    ctx.fillStyle = micPillColor
    ctx.beginPath()
    ctx.roundRect(790, 32, 200, 48, 12)
    ctx.fill()

    ctx.fillStyle = micDotColor
    ctx.beginPath()
    ctx.arc(816, 56, 8, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 22px Inter, system-ui, sans-serif'
    ctx.fillText(micLabel, 836, 64)

    // Divider
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(36, 102, canvas.width - 72, 2)

    // Slide / Question counter & current cue headline
    ctx.fillStyle = '#5eead4'
    ctx.font = '700 26px Inter, system-ui, sans-serif'
    const counterStr = `${isInterview ? 'QUESTION' : 'SLIDE'} ${currentSlideIndex + 1} / ${totalSlides}`
    ctx.fillText(counterStr, 36, 146)

    ctx.fillStyle = '#f8fafc'
    ctx.font = '800 44px Inter, system-ui, sans-serif'
    const titleLines = wrapText(ctx, activeTopic?.title ?? setup.title, canvas.width - 72, 2)
    titleLines.forEach((line, idx) => {
      ctx.fillText(line, 36, 204 + idx * 54)
    })

    // Next up cue note
    if (nextTopic) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '600 26px Inter, system-ui, sans-serif'
      ctx.fillText(`${hudT.nextUpLabel}: ${nextTopic.title.slice(0, 56)}`, 36, 326)
    }

    // Mic error fallback note or Live Captions strip
    if ((micStatus === 'denied' || micStatus === 'unsupported') && micError) {
      ctx.fillStyle = 'rgba(127, 29, 29, 0.55)'
      ctx.beginPath()
      ctx.roundRect(36, 356, canvas.width - 72, 68, 12)
      ctx.fill()
      ctx.fillStyle = '#fecaca'
      ctx.font = '600 24px Inter, system-ui, sans-serif'
      ctx.fillText(`⚠ ${micError} — Open Menu to retry or continue with visual coaching`, 54, 398)
    } else if (captionsEnabled && liveCaption) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
      ctx.beginPath()
      ctx.roundRect(36, 356, canvas.width - 72, 92, 12)
      ctx.fill()
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '500 26px Inter, system-ui, sans-serif'
      const capLines = wrapText(ctx, liveCaption, canvas.width - 112, 2)
      capLines.forEach((line, idx) => {
        ctx.fillText(line, 56, 394 + idx * 34)
      })
    }

    // Mic level bar label at bottom left
    ctx.fillStyle = '#64748b'
    ctx.font = '700 20px Inter, system-ui, sans-serif'
    ctx.fillText('MIC INPUT LEVEL', 36, 488)

    screenTexture.needsUpdate = true
  }, [
    activeTopic?.title,
    captionsEnabled,
    currentSlideIndex,
    elapsedSeconds,
    hudT.elapsedLabel,
    hudT.nextUpLabel,
    isInterview,
    language,
    liveCaption,
    liveFillers,
    liveWpm,
    micError,
    micStatus,
    nextTopic,
    remainingSeconds,
    screenTexture,
    setup.oneMinWarning,
    setup.title,
    totalSlides,
  ])

  useEffect(() => {
    return () => screenTexture.dispose()
  }, [screenTexture])

  // Real-time 3D Mic Input Level Bar updated directly in useFrame (0 React re-renders)
  const micBarFillRef = useRef<THREE.Mesh>(null)
  const micBarMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const barMaxWidth = 0.52

  useFrame(() => {
    const level = vrMicManager.sampleLevel()
    const fill = micBarFillRef.current
    const mat = micBarMatRef.current
    if (!fill || !mat) return

    const clamped = Math.max(0.02, Math.min(1, level))
    fill.scale.x = clamped
    fill.position.x = -barMaxWidth / 2 + (barMaxWidth * clamped) / 2

    if (micStatus === 'denied' || micStatus === 'unsupported') {
      mat.color.set('#ef4444')
      mat.emissive.set('#dc2626')
    } else if (level > 0.78) {
      mat.color.set('#f59e0b')
      mat.emissive.set('#d97706')
    } else if (level > 0.08) {
      mat.color.set('#10b981')
      mat.emissive.set('#059669')
    } else {
      mat.color.set('#334155')
      mat.emissive.set('#0f172a')
    }
  })

  const frameGeo = useMemo(() => createRoundedRectGeometry(0.60, 0.39, 0.02), [])
  useEffect(() => () => frameGeo.dispose(), [frameGeo])

  return (
    <group position={position} rotation={rotation}>
      {/* Sleek dark console backing mounted flush to podium surface */}
      <mesh geometry={frameGeo} position={[0, 0, 0]}>
        <meshStandardMaterial color="#0b1220" roughness={0.5} metalness={0.25} />
      </mesh>

      {/* Main Presenter Display Screen */}
      <mesh position={[0, 0.048, 0.004]}>
        <planeGeometry args={[0.56, 0.28]} />
        <meshBasicMaterial map={screenTexture} />
      </mesh>

      {/* Live 3D Mic Input Level Track */}
      <mesh position={[0, -0.105, 0.004]}>
        <planeGeometry args={[barMaxWidth, 0.014]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>
      <mesh ref={micBarFillRef} position={[-barMaxWidth / 2 + 0.01, -0.105, 0.006]}>
        <planeGeometry args={[barMaxWidth, 0.014]} />
        <meshStandardMaterial
          ref={micBarMatRef}
          color="#10b981"
          emissive="#059669"
          emissiveIntensity={0.9}
        />
      </mesh>

      {/* Interactive 3D Podium Control Buttons */}
      <VRButton3D
        position={[-0.228, -0.152, 0.006]}
        width={0.104}
        height={0.046}
        label="◀ Prev"
        variant="secondary"
        disabled={currentSlideIndex <= 0 || isPaused}
        onClick={onPrevSlide}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[-0.114, -0.152, 0.006]}
        width={0.104}
        height={0.046}
        label="Next ▶"
        variant="primary"
        disabled={currentSlideIndex >= totalSlides - 1 || isPaused}
        onClick={onNextSlide}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0, -0.152, 0.006]}
        width={0.104}
        height={0.046}
        label={hasActiveQuestion ? '✓ Done' : '✋ Q&A'}
        variant={hasActiveQuestion ? 'accent' : 'secondary'}
        disabled={isPaused}
        onClick={onToggleQA}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.114, -0.152, 0.006]}
        width={0.104}
        height={0.046}
        label={panelVisible ? 'Notes On' : 'Notes'}
        variant={panelVisible ? 'active' : 'secondary'}
        onClick={onTogglePanel}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.228, -0.152, 0.006]}
        width={0.104}
        height={0.046}
        label={isPaused ? '▶ Play' : '⏸ Menu'}
        variant={isPaused ? 'accent' : 'danger'}
        onClick={onTogglePause}
        onHoverChange={onHoverChange}
      />
    </group>
  )
}

export interface VRTeleprompterBoardProps {
  visible: boolean
  language: AppLanguage
  topics: Topic[]
  currentSlideIndex: number
  coveredIds: Set<string>
  activeQuestion: QAQuestion | null
  answerSeconds: number
  followUpsEnabled: boolean
  onJumpToSlide: (idx: number) => void
  onFinishAnswer: () => void
  onReturnToSlide: () => void
  onHoverChange: (hovered: boolean) => void
}

export function VRTeleprompterBoard({
  visible,
  language,
  topics,
  currentSlideIndex,
  coveredIds,
  activeQuestion,
  answerSeconds,
  followUpsEnabled,
  onJumpToSlide,
  onFinishAnswer,
  onReturnToSlide,
  onHoverChange,
}: VRTeleprompterBoardProps) {
  const headerTex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 384
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const canvas = headerTex.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#0b1220'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (activeQuestion) {
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(0, 0, canvas.width, 10)
      ctx.fillStyle = '#fbbf24'
      ctx.font = '700 28px Inter, system-ui, sans-serif'
      ctx.fillText(`LIVE Q&A · ${activeQuestion.speakerLabel}`, 32, 54)

      ctx.fillStyle = answerSeconds > 45 ? '#f87171' : '#38bdf8'
      ctx.textAlign = 'right'
      ctx.font = '800 32px monospace'
      ctx.fillText(`${formatClock(answerSeconds)} / 00:45`, canvas.width - 32, 56)
      ctx.textAlign = 'left'

      ctx.fillStyle = '#f8fafc'
      ctx.font = '600 34px Inter, system-ui, sans-serif'
      const qLines = wrapText(ctx, `“${activeQuestion.text}”`, canvas.width - 64, 5)
      qLines.forEach((line, i) => {
        ctx.fillText(line, 32, 124 + i * 48)
      })
    } else {
      ctx.fillStyle = '#0d9488'
      ctx.fillRect(0, 0, canvas.width, 10)
      ctx.fillStyle = '#5eead4'
      ctx.font = '700 30px Inter, system-ui, sans-serif'
      ctx.fillText(
        language === 'fr' ? 'PLAN DE PRÉSENTATION' : 'PRESENTER OUTLINE',
        32,
        60,
      )
      ctx.fillStyle = '#94a3b8'
      ctx.font = '500 24px Inter, system-ui, sans-serif'
      ctx.fillText(
        language === 'fr'
          ? 'Pointez et cliquez un sujet pour y accéder'
          : 'Point & click any topic to jump directly',
        32,
        104,
      )
    }

    headerTex.needsUpdate = true
  }, [activeQuestion, answerSeconds, headerTex, language])

  useEffect(() => () => headerTex.dispose(), [headerTex])

  const boardGeo = useMemo(() => createRoundedRectGeometry(0.56, 0.50, 0.02), [])
  useEffect(() => () => boardGeo.dispose(), [boardGeo])

  if (!visible && !activeQuestion) return null

  const visibleTopics = topics.slice(0, 5)

  return (
    <group position={[0.68, 1.18, -0.82]} rotation={[0, -0.48, 0]}>
      <mesh geometry={boardGeo} position={[0, 0, 0]}>
        <meshStandardMaterial color="#0b1220" roughness={0.55} metalness={0.2} />
      </mesh>

      {activeQuestion ? (
        <>
          <mesh position={[0, 0.06, 0.004]}>
            <planeGeometry args={[0.52, 0.28]} />
            <meshBasicMaterial map={headerTex} />
          </mesh>

          {followUpsEnabled && !activeQuestion.isFollowUp && (
            <VRButton3D
              position={[0, -0.125, 0.006]}
              width={0.48}
              height={0.056}
              label={language === 'fr' ? 'Terminé → Relance' : 'Done → Ask Follow-Up'}
              variant="primary"
              onClick={onFinishAnswer}
              onHoverChange={onHoverChange}
            />
          )}
          <VRButton3D
            position={[0, -0.195, 0.006]}
            width={0.48}
            height={0.056}
            label={
              language === 'fr'
                ? `Retour Diapo ${activeQuestion.slideIndex + 1}`
                : `Return to Slide ${activeQuestion.slideIndex + 1}`
            }
            variant="secondary"
            onClick={onReturnToSlide}
            onHoverChange={onHoverChange}
          />
        </>
      ) : (
        <>
          <mesh position={[0, 0.175, 0.004]}>
            <planeGeometry args={[0.52, 0.11]} />
            <meshBasicMaterial map={headerTex} />
          </mesh>

          {visibleTopics.map((topic, idx) => {
            const isCurrent = idx === currentSlideIndex
            const isCovered = coveredIds.has(topic.id)
            const prefix = isCovered ? '✓ ' : `${idx + 1}. `
            return (
              <VRButton3D
                key={topic.id}
                position={[0, 0.08 - idx * 0.068, 0.006]}
                width={0.50}
                height={0.056}
                label={`${prefix}${topic.title.slice(0, 22)}`}
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

export interface VRPauseMenu3DProps {
  visible: boolean
  setup: SessionSetup
  language: AppLanguage
  pairingCode?: string | null
  currentTopicTitle: string
  micStatus: VRMicStatus
  hintUsed: boolean
  isXRPresenting: boolean
  onSelectVenue: (venue: VenueType) => void
  onRetryMic: () => void
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
  language,
  pairingCode,
  currentTopicTitle,
  micStatus,
  hintUsed,
  isXRPresenting,
  onSelectVenue,
  onRetryMic,
  onUseHint,
  onResume,
  onRestartCurrentSlide,
  onRestartBeginning,
  onEndSession,
  onExitVR,
  onHoverChange,
}: VRPauseMenu3DProps) {
  const [showParHint, setShowParHint] = useState(false)
  const pauseT = translations[language].vr.pause

  const headerTex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const canvas = headerTex.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#090f1d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#1d4ed8'
    ctx.fillRect(0, 0, canvas.width, 10)

    ctx.fillStyle = '#f8fafc'
    ctx.font = '800 44px Inter, system-ui, sans-serif'
    ctx.fillText(pauseT.heading, 36, 70)

    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 26px Inter, system-ui, sans-serif'
    ctx.fillText(setup.title.slice(0, 48), 36, 114)

    // Pairing badge + Mic badge
    ctx.fillStyle = '#1e293b'
    ctx.beginPath()
    ctx.roundRect(36, 146, 360, 56, 12)
    ctx.fill()
    ctx.fillStyle = '#38bdf8'
    ctx.font = '700 24px monospace'
    ctx.fillText(
      pairingCode ? `PAIRED CODE: ${pairingCode}` : 'VR SESSION READY',
      58,
      182,
    )

    ctx.fillStyle = micStatus === 'active' ? '#065f46' : '#7f1d1d'
    ctx.beginPath()
    ctx.roundRect(420, 146, 280, 56, 12)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 24px Inter, system-ui, sans-serif'
    ctx.fillText(
      micStatus === 'active' ? '● MIC ACTIVE' : '⚠ MIC BLOCKED',
      444,
      182,
    )

    if (showParHint && setup.coachedMode) {
      ctx.fillStyle = '#5eead4'
      ctx.font = '600 22px Inter, system-ui, sans-serif'
      ctx.fillText(`PAR: Problem (${currentTopicTitle.slice(0, 22)}) → Action ("I...") → Result (%)`, 36, 236)
    } else {
      ctx.fillStyle = '#64748b'
      ctx.font = '700 22px Inter, system-ui, sans-serif'
      ctx.fillText('SWITCH VENUE INSTANTLY:', 36, 238)
    }

    headerTex.needsUpdate = true
  }, [
    currentTopicTitle,
    headerTex,
    micStatus,
    pairingCode,
    pauseT.heading,
    setup.coachedMode,
    setup.title,
    showParHint,
  ])

  useEffect(() => () => headerTex.dispose(), [headerTex])

  const backdropGeo = useMemo(() => createRoundedRectGeometry(1.16, 0.72, 0.03), [])
  useEffect(() => () => backdropGeo.dispose(), [backdropGeo])

  if (!visible) return null

  return (
    <group position={[0, 1.42, -1.28]}>
      {/* Dark architectural backdrop panel */}
      <mesh geometry={backdropGeo} position={[0, 0, 0]}>
        <meshStandardMaterial color="#0b1220" roughness={0.45} metalness={0.2} />
      </mesh>

      {/* Header & Status Display */}
      <mesh position={[0, 0.20, 0.004]}>
        <planeGeometry args={[1.08, 0.27]} />
        <meshBasicMaterial map={headerTex} />
      </mesh>

      {/* Venue Switcher Row (5 clickable 3D buttons) */}
      {VENUE_CHOICES.map((v, idx) => (
        <VRButton3D
          key={v.id}
          position={[-0.432 + idx * 0.216, 0.005, 0.008]}
          width={0.20}
          height={0.072}
          label={v.label}
          variant={setup.venue === v.id ? 'active' : 'secondary'}
          onClick={() => onSelectVenue(v.id)}
          onHoverChange={onHoverChange}
        />
      ))}

      {/* Optional Mic Retry / Coached PAR Hint Row */}
      <VRButton3D
        position={[-0.27, -0.095, 0.008]}
        width={0.50}
        height={0.074}
        label={pauseT.resume}
        variant="primary"
        onClick={onResume}
        onHoverChange={onHoverChange}
      />

      {setup.coachedMode ? (
        <VRButton3D
          position={[0.27, -0.095, 0.008]}
          width={0.50}
          height={0.074}
          label={hintUsed ? '💡 PAR Hint Shown' : '💡 Show PAR Hint'}
          variant="accent"
          onClick={() => {
            setShowParHint(true)
            if (!hintUsed) onUseHint()
          }}
          onHoverChange={onHoverChange}
        />
      ) : micStatus !== 'active' ? (
        <VRButton3D
          position={[0.27, -0.095, 0.008]}
          width={0.50}
          height={0.074}
          label="🎙 Enable Microphone"
          variant="accent"
          onClick={onRetryMic}
          onHoverChange={onHoverChange}
        />
      ) : (
        <VRButton3D
          position={[0.27, -0.095, 0.008]}
          width={0.50}
          height={0.074}
          label={pauseT.restartCurrent}
          variant="secondary"
          onClick={onRestartCurrentSlide}
          onHoverChange={onHoverChange}
        />
      )}

      {/* Bottom Action Row */}
      <VRButton3D
        position={[-0.36, -0.20, 0.008]}
        width={0.33}
        height={0.074}
        label={pauseT.restartBeginning}
        variant="secondary"
        onClick={onRestartBeginning}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0, -0.20, 0.008]}
        width={0.33}
        height={0.074}
        label={pauseT.endSession}
        variant="accent"
        onClick={onEndSession}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.36, -0.20, 0.008]}
        width={0.33}
        height={0.074}
        label={isXRPresenting ? 'Exit VR' : 'Close Menu'}
        variant="danger"
        onClick={isXRPresenting ? onExitVR : onResume}
        onHoverChange={onHoverChange}
      />
    </group>
  )
}

export interface VRDebriefPanel3DProps {
  record: SessionRecord
  language: AppLanguage
  onTryAgain: () => void
  onRaiseDifficulty: () => void
  onExitToReport: () => void
  onHoverChange: (hovered: boolean) => void
}

export function VRDebriefPanel3D({
  record,
  language,
  onTryAgain,
  onRaiseDifficulty,
  onExitToReport,
  onHoverChange,
}: VRDebriefPanel3DProps) {
  const t = translations[language].vr.debrief
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])

  useEffect(() => {
    const canvas = tex.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#090f1d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#14b8a6'
    ctx.fillRect(0, 0, canvas.width, 10)

    ctx.fillStyle = '#5eead4'
    ctx.font = '700 26px Inter, system-ui, sans-serif'
    ctx.fillText(t.kicker.toUpperCase(), 40, 62)

    ctx.fillStyle = '#f8fafc'
    ctx.font = '800 48px Inter, system-ui, sans-serif'
    ctx.fillText(t.heading, 40, 120)

    const metrics = [
      { label: t.metricWpm, val: `${record.wpm}` },
      { label: t.metricFillers, val: `${record.fillerCount}` },
      { label: t.metricTopics, val: `${record.topicsCovered}/${record.topicsTotal}` },
      { label: t.metricTime, val: formatClock(record.durationSeconds) },
    ]

    metrics.forEach((m, i) => {
      const bx = 40 + i * 240
      ctx.fillStyle = '#131d33'
      ctx.beginPath()
      ctx.roundRect(bx, 154, 222, 130, 14)
      ctx.fill()

      ctx.fillStyle = '#94a3b8'
      ctx.font = '600 22px Inter, system-ui, sans-serif'
      ctx.fillText(m.label.slice(0, 14), bx + 20, 196)

      ctx.fillStyle = '#f8fafc'
      ctx.font = '800 44px monospace'
      ctx.fillText(m.val, bx + 20, 256)
    })

    ctx.fillStyle = '#cbd5e1'
    ctx.font = '600 26px Inter, system-ui, sans-serif'
    const tip = record.recommendations[0] ?? ''
    const tipLines = wrapText(ctx, tip, canvas.width - 80, 3)
    tipLines.forEach((line, idx) => {
      ctx.fillText(line, 40, 344 + idx * 40)
    })

    tex.needsUpdate = true
  }, [record, t, tex])

  useEffect(() => () => tex.dispose(), [tex])

  const backdropGeo = useMemo(() => createRoundedRectGeometry(1.18, 0.72, 0.03), [])
  useEffect(() => () => backdropGeo.dispose(), [backdropGeo])

  return (
    <group position={[0, 1.42, -1.32]}>
      <mesh geometry={backdropGeo}>
        <meshStandardMaterial color="#0b1220" roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.08, 0.004]}>
        <planeGeometry args={[1.10, 0.52]} />
        <meshBasicMaterial map={tex} />
      </mesh>

      <VRButton3D
        position={[-0.36, -0.255, 0.008]}
        width={0.33}
        height={0.08}
        label={t.tryAgainNow}
        variant="secondary"
        onClick={onTryAgain}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0, -0.255, 0.008]}
        width={0.33}
        height={0.08}
        label={t.raiseDifficulty}
        variant="accent"
        onClick={onRaiseDifficulty}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.36, -0.255, 0.008]}
        width={0.33}
        height={0.08}
        label="Full Report"
        variant="primary"
        onClick={onExitToReport}
        onHoverChange={onHoverChange}
      />
    </group>
  )
}

/* ==========================================================================
   3D Floating VR Lobby Menu (Curved Arc at ~1.6m, eye height y = 1.45m)
   ========================================================================== */

interface VenueCardMeta {
  id: VenueType
  icon: string
  label: string
  subtitle: string
  accent: string
}

const LOBBY_VENUE_CARDS: VenueCardMeta[] = [
  { id: 'classroom', icon: '🏫', label: 'Classroom', subtitle: '30 Seats · Intimate', accent: '#38bdf8' },
  { id: 'lecture_hall', icon: '🎓', label: 'Lecture', subtitle: '60 Seats · Tiered', accent: '#818cf8' },
  { id: 'auditorium', icon: '🎭', label: 'Auditorium', subtitle: '200 Seats · Keynote', accent: '#c084fc' },
  { id: 'interview_room', icon: '💼', label: 'Interview', subtitle: '1-on-1 · Focused', accent: '#2dd4bf' },
  { id: 'panel_room', icon: '🎙', label: 'Panel', subtitle: '3 Panelists · Q&A', accent: '#fbbf24' },
]

function VRVenueCard3D({
  card,
  position,
  selected,
  onSelect,
  onHoverChange,
}: {
  card: VenueCardMeta
  position: [number, number, number]
  selected: boolean
  onSelect: () => void
  onHoverChange: (hovered: boolean) => void
}) {
  const [hovered, setHovered] = useState(false)
  const width = 0.36
  const height = 0.27

  const cardGeo = useMemo(() => createRoundedRectGeometry(width, height, 0.022), [])
  const borderGeo = useMemo(() => createRoundedRectGeometry(width + 0.014, height + 0.014, 0.026), [])

  useEffect(() => {
    return () => {
      cardGeo.dispose()
      borderGeo.dispose()
    }
  }, [borderGeo, cardGeo])

  const cardTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 384
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const canvas = cardTexture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Top accent strip
    ctx.fillStyle = card.accent
    ctx.beginPath()
    ctx.roundRect(24, 20, canvas.width - 48, 12, 6)
    ctx.fill()

    // Bold venue icon
    ctx.font = '88px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(card.icon, canvas.width / 2, 134)

    // Venue name
    ctx.fillStyle = '#f8fafc'
    ctx.font = '800 50px Inter, system-ui, sans-serif'
    ctx.fillText(card.label, canvas.width / 2, 246)

    // Subtitle
    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 30px Inter, system-ui, sans-serif'
    ctx.fillText(card.subtitle, canvas.width / 2, 310)

    cardTexture.needsUpdate = true
  }, [card.accent, card.icon, card.label, card.subtitle, cardTexture])

  useEffect(() => () => cardTexture.dispose(), [cardTexture])

  const popZ = hovered ? 0.032 : selected ? 0.014 : 0
  const fillHex = hovered ? '#1e293b' : selected ? '#16233b' : '#0f172a'
  const glowHex = hovered || selected ? card.accent : '#334155'

  return (
    <group position={[position[0], position[1], position[2] + popZ]}>
      {/* Glowing border frame */}
      <mesh geometry={borderGeo} position={[0, 0, -0.002]}>
        <meshStandardMaterial
          color={glowHex}
          emissive={hovered || selected ? card.accent : '#000000'}
          emissiveIntensity={hovered ? 1.15 : selected ? 0.55 : 0}
          roughness={0.35}
        />
      </mesh>

      {/* Interactive collider mesh */}
      <mesh
        geometry={cardGeo}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          onHoverChange(true)
          playVRHoverSound()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={(e) => {
          e.stopPropagation()
          if (hovered) {
            setHovered(false)
            onHoverChange(false)
          }
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          playVRClickSound()
          onSelect()
        }}
      >
        <meshStandardMaterial color={fillHex} roughness={0.42} metalness={0.14} />
      </mesh>

      {/* Crisp icon + text face */}
      <mesh position={[0, 0, 0.003]}>
        <planeGeometry args={[width * 0.94, height * 0.92]} />
        <meshBasicMaterial map={cardTexture} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

export interface VRFloatingLobby3DProps {
  selectedVenue: VenueType
  pairingCode: string
  pairingStatus: 'waiting' | 'paired'
  micStatus: VRMicStatus
  language: AppLanguage
  onSelectVenueAndEnter: (venue: VenueType) => void
  onStartPractice: () => void
  onRegenerateCode: () => void
  onEnableMic: () => void
  onHoverChange: (hovered: boolean) => void
}

const MIC_EQ_BAR_COUNT = 9

export function VRFloatingLobby3D({
  selectedVenue,
  pairingCode,
  pairingStatus,
  micStatus,
  language,
  onSelectVenueAndEnter,
  onStartPractice,
  onRegenerateCode,
  onEnableMic,
  onHoverChange,
}: VRFloatingLobby3DProps) {
  const isFr = language === 'fr'

  // Panel backing geometries
  const centerPanelGeo = useMemo(() => createRoundedRectGeometry(1.26, 0.78, 0.036), [])
  const sidePanelGeo = useMemo(() => createRoundedRectGeometry(0.64, 0.72, 0.032), [])

  useEffect(() => {
    return () => {
      centerPanelGeo.dispose()
      sidePanelGeo.dispose()
    }
  }, [centerPanelGeo, sidePanelGeo])

  // Center Header Texture
  const centerHeaderTex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 160
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const canvas = centerHeaderTex.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#5eead4'
    ctx.font = '700 28px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('STAGERA VR', canvas.width / 2, 42)
    ctx.fillStyle = '#f8fafc'
    ctx.font = '800 50px Inter, system-ui, sans-serif'
    ctx.fillText(
      isFr ? 'Choisissez votre salle' : 'Select a Practice Venue',
      canvas.width / 2,
      108,
    )
    centerHeaderTex.needsUpdate = true
  }, [centerHeaderTex, isFr])

  useEffect(() => () => centerHeaderTex.dispose(), [centerHeaderTex])

  // Left Pairing Panel Texture
  const pairingTex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 540
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const canvas = pairingTex.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#090f1d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Top accent
    ctx.fillStyle = pairingStatus === 'paired' ? '#10b981' : '#38bdf8'
    ctx.fillRect(0, 0, canvas.width, 12)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#94a3b8'
    ctx.font = '700 26px Inter, system-ui, sans-serif'
    ctx.fillText(
      isFr ? 'JUMELAGE TÉLÉPHONE' : 'PHONE COMPANION PAIRING',
      canvas.width / 2,
      68,
    )

    // Large 4-digit pairing code box
    ctx.fillStyle = '#111c33'
    ctx.beginPath()
    ctx.roundRect(56, 114, canvas.width - 112, 178, 22)
    ctx.fill()
    ctx.strokeStyle = pairingStatus === 'paired' ? '#34d399' : '#38bdf8'
    ctx.lineWidth = 4
    ctx.stroke()

    const spacedCode = pairingCode.split('').join(' ')
    ctx.fillStyle = '#f8fafc'
    ctx.font = '800 108px monospace'
    ctx.fillText(spacedCode, canvas.width / 2, 238)

    // Live status pill
    const pillBg = pairingStatus === 'paired' ? '#065f46' : '#1e293b'
    const dotColor = pairingStatus === 'paired' ? '#34d399' : '#fbbf24'
    const statusText =
      pairingStatus === 'paired'
        ? isFr
          ? 'Jumelé · Lancement...'
          : 'Paired · Launching...'
        : isFr
          ? 'En attente du téléphone...'
          : 'Waiting for Phone...'

    ctx.fillStyle = pillBg
    ctx.beginPath()
    ctx.roundRect(86, 332, canvas.width - 172, 66, 33)
    ctx.fill()

    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(132, 365, 11, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 28px Inter, system-ui, sans-serif'
    ctx.fillText(statusText, canvas.width / 2 + 16, 375)

    ctx.fillStyle = '#64748b'
    ctx.font = '500 22px Inter, system-ui, sans-serif'
    ctx.fillText(
      isFr
        ? 'Entrez ce code dans Stagera sur mobile'
        : 'Enter this code in Stagera Companion',
      canvas.width / 2,
      462,
    )

    pairingTex.needsUpdate = true
  }, [isFr, pairingCode, pairingStatus, pairingTex])

  useEffect(() => () => pairingTex.dispose(), [pairingTex])

  // Right Mic & Quick Start Panel Texture
  const micHeaderTex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 240
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const canvas = micHeaderTex.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#090f1d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle =
      micStatus === 'active'
        ? '#10b981'
        : micStatus === 'denied' || micStatus === 'unsupported'
          ? '#ef4444'
          : '#0ea5e9'
    ctx.fillRect(0, 0, canvas.width, 12)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#94a3b8'
    ctx.font = '700 26px Inter, system-ui, sans-serif'
    ctx.fillText(isFr ? 'AUDIO & DÉMARRAGE' : 'MICROPHONE & QUICK START', canvas.width / 2, 68)

    const pillBg =
      micStatus === 'active'
        ? '#065f46'
        : micStatus === 'denied' || micStatus === 'unsupported'
          ? '#7f1d1d'
          : '#1e293b'
    const label =
      micStatus === 'active'
        ? '● MIC LIVE'
        : micStatus === 'denied' || micStatus === 'unsupported'
          ? '⚠ MIC BLOCKED'
          : '● MIC STANDBY'

    ctx.fillStyle = pillBg
    ctx.beginPath()
    ctx.roundRect(130, 108, canvas.width - 260, 62, 31)
    ctx.fill()

    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 28px Inter, system-ui, sans-serif'
    ctx.fillText(label, canvas.width / 2, 149)

    ctx.fillStyle = '#64748b'
    ctx.font = '500 22px Inter, system-ui, sans-serif'
    ctx.fillText(
      micStatus === 'active'
        ? isFr
          ? 'Parlez pour tester le niveau micro'
          : 'Speak now to verify live audio level'
        : isFr
          ? 'Activez le micro pour le coaching vocal'
          : 'Enable mic for live voice coaching',
      canvas.width / 2,
      214,
    )

    micHeaderTex.needsUpdate = true
  }, [isFr, micHeaderTex, micStatus])

  useEffect(() => () => micHeaderTex.dispose(), [micHeaderTex])

  // Live 9-bar 3D Mic Equalizer Visualizer (zero React re-renders)
  const barRefs = useRef<Array<THREE.Mesh | null>>([])
  const barMatRefs = useRef<Array<THREE.MeshStandardMaterial | null>>([])

  useFrame(({ clock }) => {
    const level = vrMicManager.sampleLevel()
    const t = clock.getElapsedTime()
    for (let i = 0; i < MIC_EQ_BAR_COUNT; i++) {
      const mesh = barRefs.current[i]
      const mat = barMatRefs.current[i]
      if (!mesh || !mat) continue

      const centerWeight = 1 - Math.abs(i - (MIC_EQ_BAR_COUNT - 1) / 2) / 5.2
      const wave = 0.72 + 0.28 * Math.sin(t * 7.5 + i * 0.9)
      const idleBreath = 0.08 + 0.04 * Math.sin(t * 2.2 + i * 0.6)
      const h =
        micStatus === 'active'
          ? Math.max(0.08, Math.min(1, idleBreath + level * centerWeight * wave * 1.45))
          : 0.08

      mesh.scale.y = h
      mesh.position.y = -0.09 + (h * 0.16) / 2

      if (micStatus === 'denied' || micStatus === 'unsupported') {
        mat.color.set('#ef4444')
        mat.emissive.set('#b91c1c')
      } else if (h > 0.75) {
        mat.color.set('#fbbf24')
        mat.emissive.set('#d97706')
      } else if (micStatus === 'active' && level > 0.05) {
        mat.color.set('#34d399')
        mat.emissive.set('#059669')
      } else {
        mat.color.set('#38bdf8')
        mat.emissive.set('#0284c7')
      }
    }
  })

  // 3-top / 2-bottom layout for the 5 venue cards in the center floating panel
  const cardPositions: [number, number, number][] = [
    [-0.39, 0.09, 0.014],
    [0, 0.09, 0.014],
    [0.39, 0.09, 0.014],
    [-0.20, -0.21, 0.014],
    [0.20, -0.21, 0.014],
  ]

  return (
    <group>
      {/* CENTER FLOATING PANEL: 5 Interactive Venue Cards (~1.6m away, eye height y = 1.45m) */}
      <group position={[0, 1.45, -1.60]}>
        <mesh geometry={centerPanelGeo}>
          <meshStandardMaterial color="#090f1d" roughness={0.45} metalness={0.22} />
        </mesh>
        <mesh position={[0, 0.30, 0.006]}>
          <planeGeometry args={[1.16, 0.16]} />
          <meshBasicMaterial map={centerHeaderTex} transparent depthWrite={false} />
        </mesh>

        {LOBBY_VENUE_CARDS.map((card, idx) => (
          <VRVenueCard3D
            key={card.id}
            card={card}
            position={cardPositions[idx]}
            selected={selectedVenue === card.id}
            onSelect={() => onSelectVenueAndEnter(card.id)}
            onHoverChange={onHoverChange}
          />
        ))}
      </group>

      {/* LEFT FLOATING PANEL: 4-Digit Phone Pairing Code + Live Status */}
      <group position={[-1.08, 1.45, -1.32]} rotation={[0, 0.48, 0]}>
        <mesh geometry={sidePanelGeo}>
          <meshStandardMaterial color="#090f1d" roughness={0.45} metalness={0.22} />
        </mesh>
        <mesh position={[0, 0.06, 0.006]}>
          <planeGeometry args={[0.58, 0.49]} />
          <meshBasicMaterial map={pairingTex} />
        </mesh>
        <VRButton3D
          position={[0, -0.265, 0.012]}
          width={0.46}
          height={0.082}
          label={isFr ? '↻ Nouveau code' : '↻ New Pairing Code'}
          variant="secondary"
          onClick={onRegenerateCode}
          onHoverChange={onHoverChange}
        />
      </group>

      {/* RIGHT FLOATING PANEL: Live 3D Mic Visualizer + Quick Start Practice */}
      <group position={[1.08, 1.45, -1.32]} rotation={[0, -0.48, 0]}>
        <mesh geometry={sidePanelGeo}>
          <meshStandardMaterial color="#090f1d" roughness={0.45} metalness={0.22} />
        </mesh>

        <mesh position={[0, 0.21, 0.006]}>
          <planeGeometry args={[0.58, 0.22]} />
          <meshBasicMaterial map={micHeaderTex} />
        </mesh>

        {/* Equalizer backing tray */}
        <mesh position={[0, -0.01, 0.005]}>
          <planeGeometry args={[0.54, 0.19]} />
          <meshStandardMaterial color="#0f172a" roughness={0.75} />
        </mesh>

        {/* 9 Live Animated 3D Mic Equalizer Bars */}
        {Array.from({ length: MIC_EQ_BAR_COUNT }, (_, i) => {
          const x = -0.21 + i * 0.0525
          return (
            <mesh
              key={i}
              ref={(el) => {
                barRefs.current[i] = el
              }}
              position={[x, -0.08, 0.012]}
            >
              <boxGeometry args={[0.032, 0.16, 0.012]} />
              <meshStandardMaterial
                ref={(el) => {
                  barMatRefs.current[i] = el
                }}
                color="#38bdf8"
                emissive="#0284c7"
                emissiveIntensity={0.85}
                roughness={0.3}
              />
            </mesh>
          )
        })}

        {micStatus !== 'active' && (
          <VRButton3D
            position={[0, -0.165, 0.012]}
            width={0.50}
            height={0.072}
            label={isFr ? '🎙 Activer le micro' : '🎙 Enable Microphone'}
            variant="accent"
            onClick={onEnableMic}
            onHoverChange={onHoverChange}
          />
        )}

        <VRButton3D
          position={[0, -0.265, 0.012]}
          width={0.50}
          height={0.092}
          label={isFr ? '▶ Lancer la séance' : '▶ Start Practice'}
          variant="primary"
          onClick={onStartPractice}
          onHoverChange={onHoverChange}
        />
      </group>
    </group>
  )
}

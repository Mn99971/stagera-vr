import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
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
   Shared Geometry, Crisp Aspect-Locked CanvasTexture & Text Helpers
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
  return new THREE.ShapeGeometry(shape, 10)
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

/**
 * Creates a crisp CanvasTexture whose pixel dimensions are strictly locked to
 * the exact aspect ratio of its 3D plane (1024 px/m, capped at 2048px) with
 * max anisotropy and mipmaps enabled so text never blurs or stretches in VR.
 */
function useAspectLockedCanvasTexture(
  planeWidth: number,
  planeHeight: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: ReadonlyArray<unknown>,
): THREE.CanvasTexture {
  const gl = useThree((s) => s.gl)

  const { width, height } = useMemo(() => {
    const rawW = Math.max(128, Math.round(planeWidth * 1024))
    const rawH = Math.max(128, Math.round(planeHeight * 1024))
    const scale = Math.min(1, 2048 / Math.max(rawW, rawH))
    return {
      width: Math.max(128, Math.round(rawW * scale)),
      height: Math.max(128, Math.round(rawH * scale)),
    }
  }, [planeHeight, planeWidth])

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = gl.capabilities.getMaxAnisotropy()
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [gl, height, width])

  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    draw(ctx, canvas.width, canvas.height)
    texture.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, ...deps])

  useEffect(() => {
    return () => texture.dispose()
  }, [texture])

  return texture
}

export function playVRHoverSound(): void {
  vrAudioEngine.playHover()
}

export function playVRClickSound(): void {
  vrAudioEngine.playClick()
}

/* ==========================================================================
   Reusable Zero-Z-Fighting 3D Interactive Button (VRButton3D)
   ========================================================================== */

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
  variant = 'secondary',
  disabled = false,
  onClick,
  onHoverChange,
}: VRButton3DProps) {
  const [hovered, setHovered] = useState(false)
  const labelW = width * 0.92
  const labelH = height * 0.84

  const backingGeo = useMemo(
    () => createRoundedRectGeometry(width, height, Math.min(0.014, height * 0.25)),
    [height, width],
  )
  const borderGeo = useMemo(
    () => createRoundedRectGeometry(width + 0.010, height + 0.010, Math.min(0.018, height * 0.28)),
    [height, width],
  )

  useEffect(() => {
    return () => {
      backingGeo.dispose()
      borderGeo.dispose()
    }
  }, [backingGeo, borderGeo])

  const palette = BUTTON_PALETTES[variant]

  const labelTexture = useAspectLockedCanvasTexture(
    labelW,
    labelH,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = disabled ? '#64748b' : palette.text
      // Scale font cleanly to canvas height while respecting width
      let fontSize = Math.round(h * 0.54)
      ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`
      const text = label.slice(0, 32)
      while (ctx.measureText(text).width > w * 0.92 && fontSize > 16) {
        fontSize -= 2
        ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, w / 2, h / 2 + 1)
    },
    [disabled, label, palette.text],
  )

  const bgColor = disabled ? '#0f172a' : hovered ? palette.hoverBg : palette.bg
  const borderColor = disabled ? '#334155' : hovered ? '#ffffff' : palette.border

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (disabled) return
    setHovered(true)
    onHoverChange?.(true)
    vrAudioEngine.playHover()
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
    vrAudioEngine.playClick()
    onClick()
  }

  return (
    <group position={[position[0], position[1], position[2] + (hovered && !disabled ? 0.016 : 0)]}>
      {/* Border / hover glow frame strictly behind backing (-0.015m) */}
      <mesh geometry={borderGeo} position={[0, 0, -0.015]}>
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
        <meshStandardMaterial color={bgColor} roughness={0.45} metalness={0.1} />
      </mesh>

      {/* Crisp label plane separated forward (+0.015m) with polygonOffset */}
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[labelW, labelH]} />
        <meshBasicMaterial
          map={labelTexture}
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  )
}

/* ==========================================================================
   S2.2 / S2.2b — Podium Presenter Console (VRPodiumHUD)
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
  const totalSlides = Math.max(1, topics.length)
  const activeTopic = topics[currentSlideIndex]
  const nextTopic = topics[currentSlideIndex + 1]
  const isInterview = setup.practiceType === 'interview'

  const screenW = 0.64
  const screenH = 0.32
  const screenTexture = useAspectLockedCanvasTexture(
    screenW,
    screenH,
    (ctx, w, h) => {
      ctx.fillStyle = '#0b1220'
      ctx.fillRect(0, 0, w, h)

      const warnTime = setup.oneMinWarning && remainingSeconds > 0 && remainingSeconds <= 60
      const timeUp = remainingSeconds === 0
      ctx.fillStyle = timeUp ? '#ef4444' : warnTime ? '#f59e0b' : '#14b8a6'
      ctx.fillRect(0, 0, w, 10)

      // REC Timer + live stats
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(30, 44, 7, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = timeUp ? '#f87171' : warnTime ? '#fbbf24' : '#38bdf8'
      ctx.font = '800 34px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(
        `REC ${formatClock(elapsedSeconds)} / ${setup.timeLimitMinutes}:00`,
        46,
        55,
      )

      // Mic status pill
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
            : 'MIC READY'

      ctx.fillStyle = micPillColor
      ctx.beginPath()
      ctx.roundRect(w - 178, 22, 154, 42, 12)
      ctx.fill()
      ctx.fillStyle = micDotColor
      ctx.beginPath()
      ctx.arc(w - 156, 43, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f8fafc'
      ctx.font = '700 18px Inter, system-ui, sans-serif'
      ctx.fillText(micLabel, w - 140, 49)

      // Sub-bar: Slide / Question counter & WPM
      ctx.fillStyle = '#5eead4'
      ctx.font = '700 22px Inter, system-ui, sans-serif'
      const counterStr = isInterview
        ? `Question ${currentSlideIndex + 1} of ${totalSlides}`
        : `Slide ${currentSlideIndex + 1} / ${totalSlides}`
      ctx.fillText(
        `${counterStr}   ·   ${liveWpm} WPM   ·   ${liveFillers} ${language === 'fr' ? 'tics' : 'fillers'}`,
        24,
        96,
      )

      // Headline
      ctx.fillStyle = '#f8fafc'
      ctx.font = '800 32px Inter, system-ui, sans-serif'
      const lines = wrapText(ctx, activeTopic?.title ?? setup.title, w - 48, 2)
      lines.forEach((line, idx) => {
        ctx.fillText(line, 24, 144 + idx * 40)
      })

      // Next up or Captions
      if ((micStatus === 'denied' || micStatus === 'unsupported') && micError) {
        ctx.fillStyle = 'rgba(127, 29, 29, 0.65)'
        ctx.beginPath()
        ctx.roundRect(24, h - 88, w - 48, 52, 10)
        ctx.fill()
        ctx.fillStyle = '#fecaca'
        ctx.font = '600 18px Inter, system-ui, sans-serif'
        ctx.fillText(`⚠ ${micError} — Open Menu to retry`, 38, h - 56)
      } else if (captionsEnabled && liveCaption) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
        ctx.beginPath()
        ctx.roundRect(24, h - 94, w - 48, 60, 10)
        ctx.fill()
        ctx.fillStyle = '#e2e8f0'
        ctx.font = '500 19px Inter, system-ui, sans-serif'
        const capLines = wrapText(ctx, liveCaption, w - 76, 2)
        capLines.forEach((line, idx) => {
          ctx.fillText(line, 38, h - 68 + idx * 24)
        })
      } else if (nextTopic) {
        ctx.fillStyle = '#94a3b8'
        ctx.font = '600 20px Inter, system-ui, sans-serif'
        ctx.fillText(`Next: ${nextTopic.title.slice(0, 48)}`, 24, h - 52)
      }

      ctx.fillStyle = '#64748b'
      ctx.font = '700 15px Inter, system-ui, sans-serif'
      ctx.fillText('MIC INPUT LEVEL', 24, h - 10)
    },
    [
      activeTopic?.title,
      captionsEnabled,
      currentSlideIndex,
      elapsedSeconds,
      isInterview,
      language,
      liveCaption,
      liveFillers,
      liveWpm,
      micError,
      micStatus,
      nextTopic,
      remainingSeconds,
      setup.oneMinWarning,
      setup.timeLimitMinutes,
      setup.title,
      totalSlides,
    ],
  )

  const micBarFillRef = useRef<THREE.Mesh>(null)
  const micBarMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const barMaxWidth = 0.60

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
    } else if (level > 0.06) {
      mat.color.set('#10b981')
      mat.emissive.set('#059669')
    } else {
      mat.color.set('#334155')
      mat.emissive.set('#0f172a')
    }
  })

  const frameGeo = useMemo(() => createRoundedRectGeometry(0.70, 0.45, 0.024), [])
  useEffect(() => () => frameGeo.dispose(), [frameGeo])

  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={frameGeo} position={[0, 0, 0]}>
        <meshStandardMaterial color="#0b1220" roughness={0.5} metalness={0.25} />
      </mesh>

      {/* Main Display separated +0.016m */}
      <mesh position={[0, 0.052, 0.016]}>
        <planeGeometry args={[screenW, screenH]} />
        <meshBasicMaterial map={screenTexture} polygonOffset polygonOffsetFactor={-1} />
      </mesh>

      {/* Live 3D Mic Level Track (+0.016m) & Fill (+0.024m) */}
      <mesh position={[0, -0.122, 0.016]}>
        <planeGeometry args={[barMaxWidth, 0.016]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>
      <mesh ref={micBarFillRef} position={[-barMaxWidth / 2 + 0.01, -0.122, 0.024]}>
        <planeGeometry args={[barMaxWidth, 0.016]} />
        <meshStandardMaterial
          ref={micBarMatRef}
          color="#10b981"
          emissive="#059669"
          emissiveIntensity={0.9}
        />
      </mesh>

      {/* Interactive 3D Podium Buttons (+0.026m) */}
      <VRButton3D
        position={[-0.264, -0.174, 0.026]}
        width={0.12}
        height={0.054}
        label="◀ Prev"
        variant="secondary"
        disabled={currentSlideIndex <= 0 || isPaused}
        onClick={onPrevSlide}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[-0.132, -0.174, 0.026]}
        width={0.12}
        height={0.054}
        label="Next ▶"
        variant="primary"
        disabled={currentSlideIndex >= totalSlides - 1 || isPaused}
        onClick={onNextSlide}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0, -0.174, 0.026]}
        width={0.12}
        height={0.054}
        label={hasActiveQuestion ? '✓ Done' : '✋ Q&A'}
        variant={hasActiveQuestion ? 'accent' : 'secondary'}
        disabled={isPaused}
        onClick={onToggleQA}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.132, -0.174, 0.026]}
        width={0.12}
        height={0.054}
        label={panelVisible ? 'Hide: B' : 'Panel: B'}
        variant={panelVisible ? 'active' : 'secondary'}
        onClick={onTogglePanel}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.264, -0.174, 0.026]}
        width={0.12}
        height={0.054}
        label={isPaused ? '▶ Play' : '⏸ Menu'}
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
  language,
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
  const isInterview = setup.practiceType === 'interview'
  const panelW = 0.72
  const panelH = 0.66
  const headerW = 0.66
  const headerH = activeQuestion ? 0.34 : isInterview ? 0.40 : 0.16

  const headerTex = useAspectLockedCanvasTexture(
    headerW,
    headerH,
    (ctx, w, h) => {
      ctx.fillStyle = '#0b1220'
      ctx.fillRect(0, 0, w, h)

      // Top privacy banner: "🔒 Only you see this"
      ctx.fillStyle = activeQuestion ? '#d97706' : '#0f766e'
      ctx.fillRect(0, 0, w, 34)
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 18px Inter, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('🔒 Only you see this', 18, 24)
      ctx.textAlign = 'right'
      ctx.fillText(isInterview ? 'Menu: pause / hint' : 'Hide panel: B', w - 18, 24)
      ctx.textAlign = 'left'

      if (activeQuestion) {
        ctx.fillStyle = '#fbbf24'
        ctx.font = '800 28px monospace'
        ctx.fillText(`Answering · ${formatClock(answerSeconds)}`, 20, 74)

        ctx.fillStyle = answerSeconds > 45 ? '#f87171' : '#5eead4'
        ctx.textAlign = 'right'
        ctx.font = '700 22px Inter, system-ui, sans-serif'
        ctx.fillText('Aim: under 0:45', w - 20, 74)
        ctx.textAlign = 'left'

        ctx.fillStyle = '#94a3b8'
        ctx.font = '600 20px Inter, system-ui, sans-serif'
        ctx.fillText(
          `Return to → Slide ${activeQuestion.slideIndex + 1}   ·   Questions left: ${questionsRemaining}`,
          20,
          110,
        )

        ctx.fillStyle = '#f8fafc'
        ctx.font = '600 24px Inter, system-ui, sans-serif'
        const qLines = wrapText(ctx, `“${activeQuestion.text}”`, w - 40, 5)
        qLines.forEach((line, i) => {
          ctx.fillText(line, 20, 152 + i * 34)
        })
      } else if (isInterview) {
        // S2.2b Interview Room private panel layout
        ctx.fillStyle = '#f8fafc'
        ctx.font = '800 32px Inter, system-ui, sans-serif'
        ctx.fillText(
          `Question ${currentSlideIndex + 1} of ${Math.max(1, topics.length)}`,
          22,
          82,
        )

        const rows = [
          { label: 'Coached mode', value: setup.coachedMode ? 'ON' : 'OFF', color: setup.coachedMode ? '#34d399' : '#94a3b8' },
          { label: 'Follow ups', value: setup.followUps ? 'ON' : 'OFF', color: setup.followUps ? '#38bdf8' : '#94a3b8' },
          { label: 'Time', value: `${formatClock(elapsedSeconds)} / ${setup.timeLimitMinutes}:00`, color: '#f8fafc' },
        ]
        rows.forEach((row, idx) => {
          const y = 134 + idx * 54
          ctx.fillStyle = '#131d33'
          ctx.beginPath()
          ctx.roundRect(20, y - 30, w - 40, 44, 10)
          ctx.fill()
          ctx.fillStyle = '#94a3b8'
          ctx.font = '600 22px Inter, system-ui, sans-serif'
          ctx.fillText(row.label, 34, y)
          ctx.fillStyle = row.color
          ctx.textAlign = 'right'
          ctx.font = '800 22px monospace'
          ctx.fillText(row.value, w - 34, y)
          ctx.textAlign = 'left'
        })

        ctx.fillStyle = '#5eead4'
        ctx.font = '600 20px Inter, system-ui, sans-serif'
        const topicTitle = topics[currentSlideIndex]?.title ?? setup.title
        ctx.fillText(`Topic: ${topicTitle.slice(0, 38)}`, 22, h - 22)
      } else {
        // S2.2 Presentation private panel header
        ctx.fillStyle = '#f8fafc'
        ctx.font = '800 28px monospace'
        ctx.fillText(
          `REC ${formatClock(elapsedSeconds)} / ${setup.timeLimitMinutes}:00`,
          20,
          76,
        )
        ctx.fillStyle = '#5eead4'
        ctx.textAlign = 'right'
        ctx.font = '700 24px Inter, system-ui, sans-serif'
        ctx.fillText(`Slide ${currentSlideIndex + 1} / ${Math.max(1, topics.length)}`, w - 20, 76)
        ctx.textAlign = 'left'

        ctx.fillStyle = '#94a3b8'
        ctx.font = '600 18px Inter, system-ui, sans-serif'
        ctx.fillText(
          language === 'fr' ? 'Plan des sujets (cliquez pour naviguer)' : 'Topic outline (click to jump)',
          20,
          112,
        )
      }
    },
    [
      activeQuestion,
      answerSeconds,
      currentSlideIndex,
      elapsedSeconds,
      isInterview,
      language,
      questionsRemaining,
      setup.coachedMode,
      setup.followUps,
      setup.timeLimitMinutes,
      setup.title,
      topics,
    ],
  )

  const boardGeo = useMemo(() => createRoundedRectGeometry(panelW, panelH, 0.026), [panelH, panelW])
  useEffect(() => () => boardGeo.dispose(), [boardGeo])

  if (!visible && !activeQuestion) return null

  const visibleTopics = topics.slice(0, 5)

  return (
    <group position={[0.78, 1.32, -0.92]} rotation={[0, -0.46, 0]}>
      <mesh geometry={boardGeo} position={[0, 0, 0]}>
        <meshStandardMaterial color="#0b1220" roughness={0.5} metalness={0.2} />
      </mesh>

      {activeQuestion ? (
        <>
          <mesh position={[0, 0.10, 0.016]}>
            <planeGeometry args={[headerW, headerH]} />
            <meshBasicMaterial map={headerTex} polygonOffset polygonOffsetFactor={-1} />
          </mesh>

          {followUpsEnabled && !activeQuestion.isFollowUp && (
            <VRButton3D
              position={[0, -0.145, 0.024]}
              width={0.60}
              height={0.072}
              label="Done Answering → Ask Follow-Up"
              variant="primary"
              onClick={onFinishAnswer}
              onHoverChange={onHoverChange}
            />
          )}
          <VRButton3D
            position={[0, -0.235, 0.024]}
            width={0.60}
            height={0.072}
            label={`Return to → Slide ${activeQuestion.slideIndex + 1}`}
            variant="secondary"
            onClick={onReturnToSlide}
            onHoverChange={onHoverChange}
          />
        </>
      ) : isInterview ? (
        <>
          <mesh position={[0, 0.06, 0.016]}>
            <planeGeometry args={[headerW, headerH]} />
            <meshBasicMaterial map={headerTex} polygonOffset polygonOffsetFactor={-1} />
          </mesh>
          <VRButton3D
            position={[0, -0.235, 0.024]}
            width={0.58}
            height={0.072}
            label="Hide private panel (B)"
            variant="secondary"
            onClick={onTogglePanel}
            onHoverChange={onHoverChange}
          />
        </>
      ) : (
        <>
          <mesh position={[0, 0.215, 0.016]}>
            <planeGeometry args={[headerW, headerH]} />
            <meshBasicMaterial map={headerTex} polygonOffset polygonOffsetFactor={-1} />
          </mesh>

          {visibleTopics.map((topic, idx) => {
            const isCurrent = idx === currentSlideIndex
            const isCovered = coveredIds.has(topic.id)
            const glyph = isCurrent ? '▸ ' : isCovered ? '✓ ' : '○ '
            return (
              <VRButton3D
                key={topic.id}
                position={[0, 0.085 - idx * 0.078, 0.024]}
                width={0.62}
                height={0.064}
                label={`${glyph}${topic.title.slice(0, 26)}`}
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
  const bubbleW = 1.18
  const bubbleH = 0.44

  const tex = useAspectLockedCanvasTexture(
    bubbleW,
    bubbleH,
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(6, 6, w - 12, h - 12, 28)
      ctx.fill()
      ctx.strokeStyle = '#1d4ed8'
      ctx.lineWidth = 8
      ctx.stroke()

      // Speaker label + Listening... pill
      ctx.fillStyle = '#1d4ed8'
      ctx.font = '800 28px Inter, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`✋ ${question.speakerLabel}`, 32, 54)

      ctx.fillStyle = '#0f766e'
      ctx.beginPath()
      ctx.roundRect(w - 220, 22, 188, 46, 23)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 22px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('● Listening…', w - 126, 52)
      ctx.textAlign = 'left'

      // Question text
      ctx.fillStyle = '#0f172a'
      ctx.font = '700 32px Inter, system-ui, sans-serif'
      const lines = wrapText(ctx, `“${question.text}”`, w - 64, 4)
      lines.forEach((line, idx) => {
        ctx.fillText(line, 32, 114 + idx * 44)
      })
    },
    [question.speakerLabel, question.text],
  )

  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={[bubbleW, bubbleH]} />
        <meshBasicMaterial map={tex} transparent polygonOffset polygonOffsetFactor={-1} />
      </mesh>
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
  const bannerW = 1.05
  const bannerH = 0.16

  const tex = useAspectLockedCanvasTexture(
    bannerW,
    bannerH,
    (ctx, w, h) => {
      ctx.fillStyle = timeUp ? '#991b1b' : '#b45309'
      ctx.beginPath()
      ctx.roundRect(4, 4, w - 8, h - 8, 22)
      ctx.fill()
      ctx.strokeStyle = timeUp ? '#fca5a5' : '#fde68a'
      ctx.lineWidth = 6
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.font = '800 38px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        timeUp ? '⏱ Time is up — wrap up your closing point' : '⏱ 1 minute left — start wrapping up',
        w / 2,
        h / 2 + 2,
      )
    },
    [timeUp],
  )

  if (!visible) return null

  return (
    <group position={[0, 2.08, -1.65]}>
      <mesh>
        <planeGeometry args={[bannerW, bannerH]} />
        <meshBasicMaterial map={tex} transparent polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  )
}

/* ==========================================================================
   S2.5 / S2.5b — Pause Menu (VRPauseMenu3D)
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
  const panelW = 1.46
  const panelH = 0.96
  const headerW = 1.36
  const headerH = 0.30

  const headerTex = useAspectLockedCanvasTexture(
    headerW,
    headerH,
    (ctx, w, h) => {
      ctx.fillStyle = '#090f1d'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#2563eb'
      ctx.fillRect(0, 0, w, 10)

      ctx.fillStyle = '#f8fafc'
      ctx.font = '800 44px Inter, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`Paused · ${formatClock(elapsedSeconds)}`, 28, 62)

      ctx.fillStyle = '#94a3b8'
      ctx.font = '500 24px Inter, system-ui, sans-serif'
      ctx.fillText(
        'The audience is frozen while paused. Paused time is not counted.',
        28,
        102,
      )

      // Pairing + Mic status badges
      ctx.fillStyle = '#131d33'
      ctx.beginPath()
      ctx.roundRect(28, 126, 310, 44, 12)
      ctx.fill()
      ctx.fillStyle = '#38bdf8'
      ctx.font = '700 22px monospace'
      ctx.fillText(pairingCode ? `PAIRED: ${pairingCode}` : 'VR SESSION ACTIVE', 46, 155)

      ctx.fillStyle = micStatus === 'active' ? '#065f46' : '#7f1d1d'
      ctx.beginPath()
      ctx.roundRect(356, 126, 250, 44, 12)
      ctx.fill()
      ctx.fillStyle = '#f8fafc'
      ctx.font = '700 21px Inter, system-ui, sans-serif'
      ctx.fillText(micStatus === 'active' ? '● MIC LIVE' : '⚠ MIC BLOCKED', 376, 155)

      if (showParHint) {
        ctx.fillStyle = 'rgba(15, 118, 110, 0.35)'
        ctx.beginPath()
        ctx.roundRect(28, 184, w - 56, h - 198, 14)
        ctx.fill()
        ctx.strokeStyle = '#2dd4bf'
        ctx.lineWidth = 3
        ctx.stroke()

        ctx.fillStyle = '#5eead4'
        ctx.font = '700 22px Inter, system-ui, sans-serif'
        ctx.fillText(
          `💡 PAR Hint (${currentTopicTitle.slice(0, 26)}): What was the problem, what did you do, and what happened?`,
          44,
          228,
        )
      }
    },
    [currentTopicTitle, elapsedSeconds, micStatus, pairingCode, showParHint],
  )

  const backdropGeo = useMemo(() => createRoundedRectGeometry(panelW, panelH, 0.036), [panelH, panelW])
  useEffect(() => () => backdropGeo.dispose(), [backdropGeo])

  if (!visible) return null

  const showHintButton = setup.coachedMode || setup.practiceType === 'interview'

  return (
    <group position={[0, 1.46, -1.42]}>
      <mesh geometry={backdropGeo} position={[0, 0, 0]}>
        <meshStandardMaterial color="#0b1220" roughness={0.45} metalness={0.2} />
      </mesh>

      <mesh position={[0, 0.30, 0.016]}>
        <planeGeometry args={[headerW, headerH]} />
        <meshBasicMaterial map={headerTex} polygonOffset polygonOffsetFactor={-1} />
      </mesh>

      {/* Row 1: Primary Resume + Give me a hint (or Enable Mic) */}
      <VRButton3D
        position={[-0.34, 0.075, 0.024]}
        width={0.64}
        height={0.088}
        label="▶ Resume"
        variant="primary"
        onClick={onResume}
        onHoverChange={onHoverChange}
      />
      {showHintButton ? (
        <VRButton3D
          position={[0.34, 0.075, 0.024]}
          width={0.64}
          height={0.088}
          label={hintUsed ? '💡 Hint Shown (PAR)' : '💡 Give me a hint'}
          variant="accent"
          onClick={() => {
            setShowParHint(true)
            if (!hintUsed) onUseHint()
          }}
          onHoverChange={onHoverChange}
        />
      ) : (
        <VRButton3D
          position={[0.34, 0.075, 0.024]}
          width={0.64}
          height={0.088}
          label={micStatus === 'active' ? '● Microphone Active' : '🎙 Enable Microphone'}
          variant={micStatus === 'active' ? 'secondary' : 'accent'}
          onClick={onRetryMic}
          onHoverChange={onHoverChange}
        />
      )}

      {/* Row 2: Restart from current slide / Restart from beginning / Hide private panel */}
      <VRButton3D
        position={[-0.45, -0.045, 0.024]}
        width={0.42}
        height={0.082}
        label="Restart current slide"
        variant="secondary"
        onClick={onRestartCurrentSlide}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0, -0.045, 0.024]}
        width={0.42}
        height={0.082}
        label="Restart from beginning"
        variant="secondary"
        onClick={onRestartBeginning}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.45, -0.045, 0.024]}
        width={0.42}
        height={0.082}
        label={panelVisible ? 'Hide private panel' : 'Show private panel'}
        variant="secondary"
        onClick={onTogglePanel}
        onHoverChange={onHoverChange}
      />

      {/* Row 3: Music On/Off + Height Standing/Seated + Venue Switcher */}
      <VRButton3D
        position={[-0.34, -0.165, 0.024]}
        width={0.64}
        height={0.076}
        label={musicEnabled ? '🔊 Music: ON' : '🔇 Music: OFF'}
        variant={musicEnabled ? 'active' : 'secondary'}
        onClick={onToggleMusic}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.34, -0.165, 0.024]}
        width={0.64}
        height={0.076}
        label={seatedHeightMode ? 'Height: Seated (+0.35m)' : 'Height: Standing'}
        variant={seatedHeightMode ? 'active' : 'secondary'}
        onClick={onToggleHeightMode}
        onHoverChange={onHoverChange}
      />

      {/* Row 4: Quick Venue Switcher */}
      {VENUE_CHOICES.map((v, idx) => (
        <VRButton3D
          key={v.id}
          position={[-0.536 + idx * 0.268, -0.275, 0.024]}
          width={0.246}
          height={0.068}
          label={v.label}
          variant={setup.venue === v.id ? 'active' : 'secondary'}
          onClick={() => onSelectVenue(v.id)}
          onHoverChange={onHoverChange}
        />
      ))}

      {/* Row 5: End session & see feedback + Exit VR */}
      <VRButton3D
        position={[-0.24, -0.39, 0.024]}
        width={0.82}
        height={0.086}
        label="End session & see feedback"
        variant="accent"
        onClick={onEndSession}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.44, -0.39, 0.024]}
        width={0.46}
        height={0.086}
        label={isXRPresenting ? 'Exit VR' : 'Close Menu'}
        variant="danger"
        onClick={isXRPresenting ? onExitVR : onResume}
        onHoverChange={onHoverChange}
      />
    </group>
  )
}

/* ==========================================================================
   S2.6 — Session Complete / Quick Debrief (VRDebriefPanel3D)
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
  const panelW = 1.48
  const panelH = 0.88
  const screenW = 1.38
  const screenH = 0.56

  const tex = useAspectLockedCanvasTexture(
    screenW,
    screenH,
    (ctx, w, h) => {
      ctx.fillStyle = '#090f1d'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#14b8a6'
      ctx.fillRect(0, 0, w, 12)

      ctx.fillStyle = '#5eead4'
      ctx.font = '700 24px Inter, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('QUICK DEBRIEF · S2.6', 36, 56)

      ctx.fillStyle = '#f8fafc'
      ctx.font = '800 50px Inter, system-ui, sans-serif'
      ctx.fillText('Session complete', 36, 114)

      // 4 Wireframe KPI Cards
      const metrics = [
        { label: 'Words/min', val: `${record.wpm}`, sub: 'Target 120–150' },
        { label: 'Filler words', val: `${record.fillerCount}`, sub: 'um / uh / like' },
        { label: 'Points covered', val: `${record.topicsCovered}/${record.topicsTotal}`, sub: 'Outline points' },
        {
          label: 'Time vs limit',
          val: formatClock(record.durationSeconds),
          sub: `/ ${record.timeLimitMinutes}:00 limit`,
        },
      ]

      const cardW = (w - 72 - 48) / 4
      metrics.forEach((m, i) => {
        const bx = 36 + i * (cardW + 16)
        ctx.fillStyle = '#131d33'
        ctx.beginPath()
        ctx.roundRect(bx, 148, cardW, 182, 18)
        ctx.fill()
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 3
        ctx.stroke()

        ctx.fillStyle = '#94a3b8'
        ctx.font = '700 22px Inter, system-ui, sans-serif'
        ctx.fillText(m.label, bx + 20, 192)

        ctx.fillStyle = '#f8fafc'
        ctx.font = '800 50px monospace'
        ctx.fillText(m.val, bx + 20, 260)

        ctx.fillStyle = '#64748b'
        ctx.font = '600 18px Inter, system-ui, sans-serif'
        ctx.fillText(m.sub, bx + 20, 304)
      })

      ctx.fillStyle = '#cbd5e1'
      ctx.font = '600 25px Inter, system-ui, sans-serif'
      const tip = record.recommendations[0] ?? 'Great run! Review your full delivery breakdown on your phone.'
      const tipLines = wrapText(ctx, tip, w - 72, 3)
      tipLines.forEach((line, idx) => {
        ctx.fillText(line, 36, h - 134 + idx * 38)
      })
    },
    [record],
  )

  const backdropGeo = useMemo(() => createRoundedRectGeometry(panelW, panelH, 0.036), [panelH, panelW])
  useEffect(() => () => backdropGeo.dispose(), [backdropGeo])

  return (
    <group position={[0, 1.46, -1.46]}>
      <mesh geometry={backdropGeo} position={[0, 0, 0]}>
        <meshStandardMaterial color="#0b1220" roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.12, 0.016]}>
        <planeGeometry args={[screenW, screenH]} />
        <meshBasicMaterial map={tex} polygonOffset polygonOffsetFactor={-1} />
      </mesh>

      <VRButton3D
        position={[-0.495, -0.255, 0.024]}
        width={0.31}
        height={0.088}
        label="Try again now"
        variant="secondary"
        onClick={onTryAgain}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[-0.165, -0.255, 0.024]}
        width={0.31}
        height={0.088}
        label="Raise difficulty"
        variant="accent"
        onClick={onRaiseDifficulty}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.215, -0.255, 0.024]}
        width={0.41}
        height={0.088}
        label="View full report (on phone)"
        variant="primary"
        onClick={onExitToReport}
        onHoverChange={onHoverChange}
      />
      <VRButton3D
        position={[0.575, -0.255, 0.024]}
        width={0.26}
        height={0.088}
        label="Exit to lobby"
        variant="danger"
        onClick={onExitToLobby}
        onHoverChange={onHoverChange}
      />
    </group>
  )
}

/* ==========================================================================
   S2.1 — 3D Floating VR Lobby: Mic, 3-Dot Gaze Calibration & Venue Picker
   ========================================================================== */

interface VenueCardMeta {
  id: VenueType
  icon: string
  label: string
  seats: string
  accent: string
}

const LOBBY_VENUES: VenueCardMeta[] = [
  { id: 'classroom', icon: '🏫', label: 'Classroom', seats: '30 seats', accent: '#38bdf8' },
  { id: 'lecture_hall', icon: '🎓', label: 'Lecture Hall', seats: '60 seats', accent: '#818cf8' },
  { id: 'auditorium', icon: '🎭', label: 'Auditorium', seats: '200 seats', accent: '#c084fc' },
  { id: 'interview_room', icon: '💼', label: 'Interview', seats: '1-on-1', accent: '#2dd4bf' },
  { id: 'panel_room', icon: '🎙', label: 'Panel Room', seats: '3 panelists', accent: '#fbbf24' },
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
  const labelTex = useAspectLockedCanvasTexture(
    0.26,
    0.08,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = calibrated ? '#34d399' : '#f8fafc'
      ctx.font = '800 36px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(calibrated ? `✓ ${label}` : label, w / 2, h / 2)
    },
    [calibrated, label],
  )

  return (
    <group position={position}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          onHoverChange(true)
          vrAudioEngine.playHover()
        }}
        onPointerOut={(e) => {
          e.stopPropagation()
          setHovered(false)
          onHoverChange(false)
        }}
        onClick={(e) => {
          e.stopPropagation()
          vrAudioEngine.playClick()
          onCalibrate()
        }}
      >
        <sphereGeometry args={[hovered ? 0.072 : 0.06, 20, 20]} />
        <meshStandardMaterial
          color={calibrated ? '#10b981' : '#38bdf8'}
          emissive={calibrated ? '#059669' : '#0284c7'}
          emissiveIntensity={calibrated ? 1.1 : 1.4}
        />
      </mesh>
      <mesh position={[0, -0.11, 0]}>
        <planeGeometry args={[0.26, 0.08]} />
        <meshBasicMaterial map={labelTex} transparent depthWrite={false} />
      </mesh>
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
  onSelectVenue: (venue: VenueType) => void
  onStartPractice: () => void
  onRegenerateCode: () => void
  onEnableMic: () => void
  onToggleMusic: () => void
  onToggleHeightMode: () => void
  onHoverChange: (hovered: boolean) => void
}

const MIC_EQ_BAR_COUNT = 9

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
  onSelectVenue,
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

  // ~25% larger floating panels for effortless Quest 3 readability at 1.6m
  const centerW = 1.48
  const centerH = 0.94
  const sideW = 0.78
  const sideH = 0.90

  const centerPanelGeo = useMemo(() => createRoundedRectGeometry(centerW, centerH, 0.04), [centerH, centerW])
  const sidePanelGeo = useMemo(() => createRoundedRectGeometry(sideW, sideH, 0.036), [sideH, sideW])

  useEffect(() => {
    return () => {
      centerPanelGeo.dispose()
      sidePanelGeo.dispose()
    }
  }, [centerPanelGeo, sidePanelGeo])

  // Center Panel S2.1 Checklist Texture
  const checklistW = 1.38
  const checklistH = 0.64
  const checklistTex = useAspectLockedCanvasTexture(
    checklistW,
    checklistH,
    (ctx, w, h) => {
      ctx.fillStyle = '#090f1d'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#14b8a6'
      ctx.fillRect(0, 0, w, 12)

      // S2.1 Session Header: REC --:-- | Venue + seats | Topic & Duration
      ctx.fillStyle = '#64748b'
      ctx.font = '800 26px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('● REC --:--', 32, 54)

      ctx.fillStyle = '#5eead4'
      ctx.textAlign = 'right'
      ctx.font = '700 26px Inter, system-ui, sans-serif'
      ctx.fillText(
        `${venueMeta.icon} ${venueMeta.label} (${venueMeta.seats}) · ${setup.timeLimitMinutes} min`,
        w - 32,
        54,
      )
      ctx.textAlign = 'left'

      ctx.fillStyle = '#f8fafc'
      ctx.font = '800 42px Inter, system-ui, sans-serif'
      ctx.fillText(setup.title.slice(0, 38), 32, 108)

      // 3-Step Pre-Flight Checklist
      const steps = [
        {
          num: '1. Microphone',
          desc: 'Say "Testing, one, two..."',
          status: micCheckPassed
            ? '✓ Good level'
            : micStatus === 'active'
              ? 'Listening...'
              : micStatus === 'denied'
                ? '⚠ Blocked'
                : 'Tap Enable Mic',
          done: micCheckPassed,
        },
        {
          num: '2. Eye contact calibration',
          desc: 'Look at the 3 glowing dots above: Left · Centre · Right',
          status: allGazeDone ? '✓ 3 / 3 Calibrated' : `${gazeCount} / 3 dots`,
          done: allGazeDone,
        },
        {
          num: '3. Slide control',
          desc: 'Press controller trigger (or click Test) to advance slides',
          status: triggerTested ? '✓ Ready' : 'Press trigger',
          done: triggerTested,
        },
      ]

      steps.forEach((step, idx) => {
        const y = 142 + idx * 144
        ctx.fillStyle = step.done ? 'rgba(6, 95, 70, 0.35)' : '#131d33'
        ctx.beginPath()
        ctx.roundRect(32, y, w - 64, 122, 18)
        ctx.fill()
        ctx.strokeStyle = step.done ? '#34d399' : '#334155'
        ctx.lineWidth = 3
        ctx.stroke()

        ctx.fillStyle = '#f8fafc'
        ctx.font = '800 32px Inter, system-ui, sans-serif'
        ctx.fillText(step.num, 58, y + 50)

        ctx.fillStyle = '#94a3b8'
        ctx.font = '500 24px Inter, system-ui, sans-serif'
        ctx.fillText(step.desc, 58, y + 92)

        // Status pill
        ctx.fillStyle = step.done ? '#059669' : '#1e293b'
        ctx.beginPath()
        ctx.roundRect(w - 300, y + 32, 240, 56, 28)
        ctx.fill()
        ctx.fillStyle = step.done ? '#ffffff' : '#cbd5e1'
        ctx.font = '700 24px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(step.status, w - 180, y + 68)
        ctx.textAlign = 'left'
      })

      // Footer hint matching wireframe
      ctx.fillStyle = '#64748b'
      ctx.font = '600 22px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(
        'Trigger: next slide   ·   B: hide panel   ·   Menu: pause',
        w / 2,
        h - 14,
      )
    },
    [allGazeDone, gazeCount, micCheckPassed, micStatus, setup.timeLimitMinutes, setup.title, triggerTested, venueMeta.icon, venueMeta.label, venueMeta.seats],
  )

  // Left Floating Panel: 4-Digit Phone Pairing + Venue Quick-Picker
  const pairingW = 0.70
  const pairingH = 0.34
  const pairingTex = useAspectLockedCanvasTexture(
    pairingW,
    pairingH,
    (ctx, w, h) => {
      ctx.fillStyle = '#090f1d'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = pairingStatus === 'paired' ? '#10b981' : '#38bdf8'
      ctx.fillRect(0, 0, w, 10)

      ctx.textAlign = 'center'
      ctx.fillStyle = '#94a3b8'
      ctx.font = '700 24px Inter, system-ui, sans-serif'
      ctx.fillText(isFr ? 'JUMELAGE TÉLÉPHONE' : 'PHONE PAIRING CODE', w / 2, 48)

      ctx.fillStyle = '#111c33'
      ctx.beginPath()
      ctx.roundRect(42, 72, w - 84, 124, 18)
      ctx.fill()
      ctx.strokeStyle = pairingStatus === 'paired' ? '#34d399' : '#38bdf8'
      ctx.lineWidth = 4
      ctx.stroke()

      ctx.fillStyle = '#f8fafc'
      ctx.font = '800 84px monospace'
      ctx.fillText(pairingCode.split('').join(' '), w / 2, 162)

      ctx.fillStyle = pairingStatus === 'paired' ? '#34d399' : '#fbbf24'
      ctx.font = '700 24px Inter, system-ui, sans-serif'
      ctx.fillText(
        pairingStatus === 'paired'
          ? '● Paired · Launching venue...'
          : '● Waiting for Phone...',
        w / 2,
        h - 32,
      )
    },
    [isFr, pairingCode, pairingStatus],
  )

  // Right Floating Panel: Live 3D Mic Visualizer + Controls
  const micHeaderW = 0.70
  const micHeaderH = 0.24
  const micHeaderTex = useAspectLockedCanvasTexture(
    micHeaderW,
    micHeaderH,
    (ctx, w, h) => {
      ctx.fillStyle = '#090f1d'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle =
        micStatus === 'active'
          ? '#10b981'
          : micStatus === 'denied' || micStatus === 'unsupported'
            ? '#ef4444'
            : '#0ea5e9'
      ctx.fillRect(0, 0, w, 10)

      ctx.textAlign = 'center'
      ctx.fillStyle = '#94a3b8'
      ctx.font = '700 24px Inter, system-ui, sans-serif'
      ctx.fillText('AUDIO & COMFORT', w / 2, 54)

      ctx.fillStyle = micStatus === 'active' ? '#34d399' : '#f8fafc'
      ctx.font = '800 32px Inter, system-ui, sans-serif'
      ctx.fillText(
        micStatus === 'active'
          ? '● MIC LIVE'
          : micStatus === 'denied'
            ? '⚠ MIC BLOCKED'
            : '● MIC STANDBY',
        w / 2,
        118,
      )

      ctx.fillStyle = '#64748b'
      ctx.font = '500 22px Inter, system-ui, sans-serif'
      ctx.fillText('Speak to test live mic bars below', w / 2, h - 22)
    },
    [micStatus],
  )

  // Live 9-bar 3D Mic Equalizer Visualizer
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
      mesh.position.y = -0.02 + (h * 0.16) / 2

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

  return (
    <group>
      {/* 3 Glowing 3D Gaze Calibration Dots (S2.1 Step 2) positioned comfortably above center panel */}
      <VRGazeDot3D
        position={[-1.02, 2.04, -1.75]}
        label="Left"
        calibrated={gazeCalibrated.left}
        onCalibrate={() => onCalibrateGaze('left')}
        onHoverChange={onHoverChange}
      />
      <VRGazeDot3D
        position={[0, 2.10, -1.85]}
        label="Centre"
        calibrated={gazeCalibrated.centre}
        onCalibrate={() => onCalibrateGaze('centre')}
        onHoverChange={onHoverChange}
      />
      <VRGazeDot3D
        position={[1.02, 2.04, -1.75]}
        label="Right"
        calibrated={gazeCalibrated.right}
        onCalibrate={() => onCalibrateGaze('right')}
        onHoverChange={onHoverChange}
      />

      {/* CENTER FLOATING PANEL: S2.1 Pre-Flight Checklist + Start Session CTA */}
      <group position={[0, 1.44, -1.66]}>
        <mesh geometry={centerPanelGeo} position={[0, 0, 0]}>
          <meshStandardMaterial color="#090f1d" roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.11, 0.016]}>
          <planeGeometry args={[checklistW, checklistH]} />
          <meshBasicMaterial map={checklistTex} polygonOffset polygonOffsetFactor={-1} />
        </mesh>

        <VRButton3D
          position={[-0.45, -0.335, 0.024]}
          width={0.40}
          height={0.095}
          label={triggerTested ? '✓ Trigger Ready' : 'Test Trigger'}
          variant={triggerTested ? 'accent' : 'secondary'}
          onClick={onTestTrigger}
          onHoverChange={onHoverChange}
        />
        <VRButton3D
          position={[0.20, -0.335, 0.024]}
          width={0.82}
          height={0.105}
          label="▶ Start session"
          variant="primary"
          onClick={onStartPractice}
          onHoverChange={onHoverChange}
        />
      </group>

      {/* LEFT FLOATING PANEL: 4-Digit Phone Pairing + Quick Venue Picker */}
      <group position={[-1.24, 1.44, -1.36]} rotation={[0, 0.46, 0]}>
        <mesh geometry={sidePanelGeo} position={[0, 0, 0]}>
          <meshStandardMaterial color="#090f1d" roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.24, 0.016]}>
          <planeGeometry args={[pairingW, pairingH]} />
          <meshBasicMaterial map={pairingTex} polygonOffset polygonOffsetFactor={-1} />
        </mesh>

        <VRButton3D
          position={[0, 0.015, 0.024]}
          width={0.62}
          height={0.068}
          label="↻ New Pairing Code"
          variant="secondary"
          onClick={onRegenerateCode}
          onHoverChange={onHoverChange}
        />

        {/* Quick 5-Venue Picker Grid */}
        {LOBBY_VENUES.map((v, idx) => {
          const col = idx % 2
          const row = Math.floor(idx / 2)
          const isLastOdd = idx === 4
          const x = isLastOdd ? 0 : col === 0 ? -0.165 : 0.165
          const y = -0.105 - row * 0.105
          return (
            <VRButton3D
              key={v.id}
              position={[x, y, 0.024]}
              width={isLastOdd ? 0.64 : 0.31}
              height={0.084}
              label={`${v.icon} ${v.label}`}
              variant={selectedVenue === v.id ? 'active' : 'secondary'}
              onClick={() => onSelectVenue(v.id)}
              onHoverChange={onHoverChange}
            />
          )
        })}
      </group>

      {/* RIGHT FLOATING PANEL: Live 3D Mic Visualizer + Music / Height Toggles + Quick Start */}
      <group position={[1.24, 1.44, -1.36]} rotation={[0, -0.46, 0]}>
        <mesh geometry={sidePanelGeo} position={[0, 0, 0]}>
          <meshStandardMaterial color="#090f1d" roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.28, 0.016]}>
          <planeGeometry args={[micHeaderW, micHeaderH]} />
          <meshBasicMaterial map={micHeaderTex} polygonOffset polygonOffsetFactor={-1} />
        </mesh>

        {/* Equalizer backing tray (+0.016m) */}
        <mesh position={[0, 0.05, 0.016]}>
          <planeGeometry args={[0.66, 0.19]} />
          <meshStandardMaterial color="#0f172a" roughness={0.75} />
        </mesh>

        {/* 9 Live Animated 3D Mic Equalizer Bars (+0.026m) */}
        {Array.from({ length: MIC_EQ_BAR_COUNT }, (_, i) => {
          const x = -0.256 + i * 0.064
          return (
            <mesh
              key={i}
              ref={(el) => {
                barRefs.current[i] = el
              }}
              position={[x, 0.02, 0.026]}
            >
              <boxGeometry args={[0.038, 0.16, 0.014]} />
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
            position={[0, -0.095, 0.024]}
            width={0.64}
            height={0.074}
            label="🎙 Enable Microphone"
            variant="accent"
            onClick={onEnableMic}
            onHoverChange={onHoverChange}
          />
        )}

        <VRButton3D
          position={[0, -0.19, 0.024]}
          width={0.64}
          height={0.076}
          label={musicEnabled ? '🔊 Music: ON' : '🔇 Music: OFF'}
          variant={musicEnabled ? 'active' : 'secondary'}
          onClick={onToggleMusic}
          onHoverChange={onHoverChange}
        />

        <VRButton3D
          position={[0, -0.285, 0.024]}
          width={0.64}
          height={0.076}
          label={seatedHeightMode ? 'Height: Seated (+0.35m)' : 'Height: Standing'}
          variant={seatedHeightMode ? 'active' : 'secondary'}
          onClick={onToggleHeightMode}
          onHoverChange={onHoverChange}
        />

        <VRButton3D
          position={[0, -0.385, 0.024]}
          width={0.64}
          height={0.086}
          label="▶ Start session"
          variant="primary"
          onClick={onStartPractice}
          onHoverChange={onHoverChange}
        />
      </group>
    </group>
  )
}

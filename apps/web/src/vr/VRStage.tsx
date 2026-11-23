import { useMemo, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import * as THREE from 'three'
import type { VenueType } from '../types/stagera'

const xrStore = createXRStore()

const SEAT_COUNTS: Record<VenueType, number> = {
  classroom: 30,
  lecture_hall: 60,
  auditorium: 200,
  interview_room: 1,
  panel_room: 3,
}

function InstancedAudience({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    if (!meshRef.current) return
    const cols = count <= 3 ? count : count <= 30 ? 6 : count <= 60 ? 10 : 20
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols)
      const col = i % cols
      const x = (col - (cols - 1) / 2) * 1.1
      const z = -3.5 - row * 1.3
      const y = 0.75 + row * 0.15
      dummy.position.set(x, y, z)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [count, dummy])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <capsuleGeometry args={[0.25, 0.7, 4, 8]} />
      <meshStandardMaterial color="#64748b" />
    </instancedMesh>
  )
}

export function VRStage({ venue }: { venue: VenueType }) {
  const count = SEAT_COUNTS[venue]

  return (
    <div style={{ position: 'relative', width: '100%', height: '70vh', borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={() => xrStore.enterVR()}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
          padding: '10px 16px',
          borderRadius: 8,
          border: 'none',
          background: '#2563eb',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Enter VR (Quest 3)
      </button>

      <Canvas camera={{ position: [0, 1.65, 2], fov: 65 }}>
        <XR store={xrStore}>
          <color attach="background" args={['#111827']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[4, 8, 4]} intensity={1.1} />

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -6]}>
            <planeGeometry args={[30, 30]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>

          {/* Confidence / Slide Screen behind audience */}
          <mesh position={[0, 2.2, -2.2]}>
            <planeGeometry args={[2.8, 1.5]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>

          {/* Instanced audience avatars (NFR-01: 72 FPS up to 200 seats) */}
          <InstancedAudience count={count} />
        </XR>
      </Canvas>
    </div>
  )
}

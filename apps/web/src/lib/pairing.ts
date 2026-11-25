import { supabase } from './supabase'
import type { SessionSetup } from '../types/stagera'

export const PAIRING_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes (FR-09)

const LOCAL_PAIRING_KEY = 'stagera_pairing_codes_v1'
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface PairingSessionRecord {
  code: string
  setup: SessionSetup
  expiresAt: number
  pairedAt?: number
}

type PairingBroadcastMessage =
  | { type: 'headset_join'; code: string }
  | { type: 'session_payload'; code: string; setup: SessionSetup }
  | { type: 'headset_ack'; code: string }

function generateFourDigitCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000)
  return String(num)
}

function readLocalPairings(): Record<string, PairingSessionRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_PAIRING_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, PairingSessionRecord>
    const now = Date.now()
    const pruned: Record<string, PairingSessionRecord> = {}
    for (const [key, rec] of Object.entries(parsed)) {
      // Keep records up to 10 min after expiry so we can distinguish expired vs not found
      if (rec && typeof rec.expiresAt === 'number' && now - rec.expiresAt < 10 * 60 * 1000) {
        pruned[key] = rec
      }
    }
    return pruned
  } catch {
    return {}
  }
}

function writeLocalPairing(record: PairingSessionRecord): void {
  try {
    const all = readLocalPairings()
    all[record.code] = record
    localStorage.setItem(LOCAL_PAIRING_KEY, JSON.stringify(all))
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function createBroadcastChannel(code: string): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      return new BroadcastChannel(`stagera-pairing-${code}`)
    }
  } catch {
    // Ignore if unsupported
  }
  return null
}

export async function createPairingSession(
  userId: string,
  setup: SessionSetup,
): Promise<PairingSessionRecord> {
  const code = generateFourDigitCode()
  const expiresAt = Date.now() + PAIRING_EXPIRY_MS
  const record: PairingSessionRecord = { code, setup, expiresAt }

  writeLocalPairing(record)

  if (supabase && !userId.startsWith('demo-')) {
    const setupId = setup.id && UUID_REGEX.test(setup.id) ? setup.id : null
    await supabase.from('pairing_codes').upsert({
      code,
      user_id: userId,
      setup_id: setupId,
      expires_at: new Date(expiresAt).toISOString(),
    })
  }

  return record
}

export function subscribeHostPairing(
  code: string,
  setup: SessionSetup,
  onHeadsetConnected: () => void,
): () => void {
  let connected = false
  const markConnected = () => {
    if (connected) return
    connected = true
    const all = readLocalPairings()
    if (all[code]) {
      writeLocalPairing({ ...all[code], pairedAt: Date.now() })
    }
    if (supabase) {
      void supabase
        .from('pairing_codes')
        .update({ paired_at: new Date().toISOString() })
        .eq('code', code)
    }
    onHeadsetConnected()
  }

  // 1. Browser BroadcastChannel fallback (same-origin tabs / demo mode)
  const bc = createBroadcastChannel(code)
  if (bc) {
    bc.onmessage = (event: MessageEvent<PairingBroadcastMessage>) => {
      const msg = event.data
      if (!msg || msg.code !== code) return
      if (msg.type === 'headset_join') {
        bc.postMessage({ type: 'session_payload', code, setup } satisfies PairingBroadcastMessage)
        markConnected()
      } else if (msg.type === 'headset_ack') {
        markConnected()
      }
    }
  }

  // 2. localStorage storage event fallback (cross-tab)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== LOCAL_PAIRING_KEY) return
    const all = readLocalPairings()
    if (all[code]?.pairedAt) {
      markConnected()
    }
  }
  window.addEventListener('storage', onStorage)

  // 3. Supabase Realtime Broadcast channel `pairing:<code>`
  const rtChannel = supabase
    ? supabase
        .channel(`pairing:${code}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'headset_join' }, () => {
          void rtChannel?.send({
            type: 'broadcast',
            event: 'session_payload',
            payload: { code, setup },
          })
          markConnected()
        })
        .on('broadcast', { event: 'headset_ack' }, () => {
          markConnected()
        })
        .subscribe()
    : null

  return () => {
    window.removeEventListener('storage', onStorage)
    if (bc) {
      bc.close()
    }
    if (supabase && rtChannel) {
      void supabase.removeChannel(rtChannel)
    }
  }
}

export type ClaimPairingResult =
  | { ok: true; setup: SessionSetup }
  | { ok: false; reason: 'invalid' | 'expired' | 'not_found' }

export async function claimPairingCode(rawCode: string): Promise<ClaimPairingResult> {
  const code = rawCode.replace(/\D/g, '').slice(0, 4)
  if (code.length !== 4) {
    return { ok: false, reason: 'invalid' }
  }

  const now = Date.now()
  const localRecords = readLocalPairings()
  const localMatch = localRecords[code]

  if (localMatch) {
    if (now > localMatch.expiresAt) {
      return { ok: false, reason: 'expired' }
    }
    // Mark paired & notify phone tab live via BroadcastChannel + Realtime
    writeLocalPairing({ ...localMatch, pairedAt: now })
    const bc = createBroadcastChannel(code)
    if (bc) {
      bc.postMessage({ type: 'headset_ack', code } satisfies PairingBroadcastMessage)
      bc.close()
    }
    if (supabase) {
      const ackChannel = supabase.channel(`pairing:${code}`)
      ackChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void ackChannel.send({
            type: 'broadcast',
            event: 'headset_ack',
            payload: { code },
          })
          setTimeout(() => {
            void supabase?.removeChannel(ackChannel)
          }, 500)
        }
      })
    }
    return { ok: true, setup: localMatch.setup }
  }

  // Try cross-device Supabase Realtime Broadcast (`pairing:<code>`)
  if (supabase) {
    const client = supabase
    const realtimeResult = await new Promise<SessionSetup | null>((resolve) => {
      let settled = false
      const finish = (setup: SessionSetup | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        void client.removeChannel(channel)
        resolve(setup)
      }

      const channel = client
        .channel(`pairing:${code}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'session_payload' }, (payload) => {
          const setup = (payload.payload as { setup?: SessionSetup } | undefined)?.setup
          if (setup) {
            void channel.send({
              type: 'broadcast',
              event: 'headset_ack',
              payload: { code },
            })
            finish(setup)
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            void channel.send({
              type: 'broadcast',
              event: 'headset_join',
              payload: { code },
            })
          }
        })

      const timer = setTimeout(() => finish(null), 2500)
    })

    if (realtimeResult) {
      return { ok: true, setup: realtimeResult }
    }
  }

  // Try same-origin BroadcastChannel as fallback if storage wasn't shared
  const bcResult = await new Promise<SessionSetup | null>((resolve) => {
    const bc = createBroadcastChannel(code)
    if (!bc) {
      resolve(null)
      return
    }
    let settled = false
    const finish = (setup: SessionSetup | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      bc.close()
      resolve(setup)
    }

    bc.onmessage = (event: MessageEvent<PairingBroadcastMessage>) => {
      const msg = event.data
      if (msg?.type === 'session_payload' && msg.code === code) {
        bc.postMessage({ type: 'headset_ack', code } satisfies PairingBroadcastMessage)
        finish(msg.setup)
      }
    }
    bc.postMessage({ type: 'headset_join', code } satisfies PairingBroadcastMessage)
    const timer = setTimeout(() => finish(null), 1200)
  })

  if (bcResult) {
    return { ok: true, setup: bcResult }
  }

  return { ok: false, reason: 'not_found' }
}

/**
 * Generates a fresh 4-digit pairing code for the in-headset 3D VR Lobby.
 */
export function generateHeadsetLobbyCode(): string {
  return generateFourDigitCode()
}

/**
 * Subscribes a VR headset sitting in the 3D Floating Lobby to incoming phone
 * session launches over Supabase Realtime Broadcast (`pairing:<code>`) and
 * same-origin BroadcastChannel fallback. When a phone sends a session payload,
 * immediately invokes `onSessionReceived(setup)` to drop straight into the venue.
 */
export function subscribeHeadsetLobbyPairing(
  code: string,
  onSessionReceived: (setup: SessionSetup) => void,
): () => void {
  let received = false

  const deliver = (setup: SessionSetup | undefined) => {
    if (received || !setup) return
    received = true
    onSessionReceived(setup)
  }

  // 1. Same-origin BroadcastChannel fallback
  const bc = createBroadcastChannel(code)
  if (bc) {
    bc.onmessage = (event: MessageEvent<PairingBroadcastMessage>) => {
      const msg = event.data
      if (msg?.type === 'session_payload' && msg.code === code) {
        bc.postMessage({ type: 'headset_ack', code } satisfies PairingBroadcastMessage)
        deliver(msg.setup)
      }
    }
    bc.postMessage({ type: 'headset_join', code } satisfies PairingBroadcastMessage)
  }

  // 2. Supabase Realtime Broadcast (`pairing:<code>`)
  const rtChannel = supabase
    ? supabase
        .channel(`pairing:${code}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'session_payload' }, (payload) => {
          const setup = (payload.payload as { setup?: SessionSetup } | undefined)?.setup
          if (setup) {
            void rtChannel?.send({
              type: 'broadcast',
              event: 'headset_ack',
              payload: { code },
            })
            deliver(setup)
          }
        })
        .on('broadcast', { event: 'launch_venue' }, (payload) => {
          const setup = (payload.payload as { setup?: SessionSetup } | undefined)?.setup
          if (setup) {
            void rtChannel?.send({
              type: 'broadcast',
              event: 'headset_ack',
              payload: { code },
            })
            deliver(setup)
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            void rtChannel?.send({
              type: 'broadcast',
              event: 'headset_join',
              payload: { code },
            })
          }
        })
    : null

  return () => {
    if (bc) {
      bc.close()
    }
    if (supabase && rtChannel) {
      void supabase.removeChannel(rtChannel)
    }
  }
}


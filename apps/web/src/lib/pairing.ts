import { supabase } from './supabase'
import type { SessionSetup } from '../types/stagera'

export const PAIRING_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes (FR-09)

/**
 * Unified public Supabase Realtime Broadcast channel name used by BOTH
 * Headset (VRStage / VRFloatingLobby3D) and Phone (ConnectHeadsetScreen / VRPreFlight).
 * No auth or RLS required so an unauthenticated Quest browser always connects.
 */
export function getPairingChannelName(code: string): string {
  return `stagera-pair-${code}`
}

export function isSupabaseRealtimeConfigured(): boolean {
  return supabase !== null
}

function generateFourDigitCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000)
  return String(num)
}

export function generateHeadsetLobbyCode(): string {
  return generateFourDigitCode()
}

export interface HeadsetPairingCallbacks {
  onPaired?: () => void
  onLaunchSession: (setup: SessionSetup) => void
  onError?: (message: string) => void
}

/**
 * Headset side (`VRStage.tsx` / `VRFloatingLobby3D`):
 * Subscribes to `stagera-pair-${code}` with `{ broadcast: { self: false, ack: true } }`.
 * - On `phone_pair`: immediately broadcasts `headset_ack` and invokes `onPaired()`.
 * - On `launch_session`: immediately broadcasts `headset_ack`, invokes `onPaired()`,
 *   and invokes `onLaunchSession(setup)` to drop straight into the VR venue.
 */
export function subscribeHeadsetLobbyPairing(
  rawCode: string,
  callbacks: HeadsetPairingCallbacks,
): () => void {
  const code = rawCode.replace(/\D/g, '').slice(0, 4)
  if (code.length !== 4) {
    return () => {}
  }

  if (!supabase) {
    const msg = 'Supabase Realtime not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    console.warn('[Stagera Pairing]', msg)
    callbacks.onError?.(msg)
    return () => {}
  }

  const client = supabase
  let launched = false
  const channelName = getPairingChannelName(code)

  const channel = client.channel(channelName, {
    config: { broadcast: { self: false, ack: true } },
  })

  const sendAck = () => {
    void channel
      .send({
        type: 'broadcast',
        event: 'headset_ack',
        payload: { code, ts: Date.now() },
      })
      .catch((err: unknown) => {
        console.warn('[Stagera Pairing] Failed to send headset_ack:', err)
      })
  }

  channel
    .on('broadcast', { event: 'phone_pair' }, () => {
      sendAck()
      callbacks.onPaired?.()
    })
    .on('broadcast', { event: 'launch_session' }, (msg) => {
      sendAck()
      callbacks.onPaired?.()
      const payload = msg.payload as { setup?: SessionSetup } | SessionSetup | undefined
      const setup =
        payload && typeof payload === 'object' && 'setup' in payload && payload.setup
          ? payload.setup
          : (payload as SessionSetup | undefined)
      if (!launched && setup && typeof setup.venue === 'string') {
        launched = true
        callbacks.onLaunchSession(setup)
      }
    })
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        const detail = err?.message ? `: ${err.message}` : ''
        const message = `Supabase Realtime ${status.toLowerCase()}${detail}`
        console.error('[Stagera Pairing]', message)
        callbacks.onError?.(message)
      }
    })

  return () => {
    void client.removeChannel(channel)
  }
}

export type PhonePairingPhase =
  | 'idle'
  | 'connecting'
  | 'waiting_headset'
  | 'connected'
  | 'error'

export interface PhonePairingUpdate {
  phase: PhonePairingPhase
  message: string
}

/**
 * Phone side (`ConnectHeadsetScreen.tsx`):
 * Subscribes to `stagera-pair-${code}`, waits strictly for `status === 'SUBSCRIBED'`,
 * broadcasts `phone_pair` + `launch_session` with the session setup payload,
 * retries once after 1200ms if `headset_ack` hasn't arrived yet, and reports
 * clear live status + explicit errors (no silent BroadcastChannel fallback).
 */
export function connectAndSendToHeadset(
  rawCode: string,
  setup: SessionSetup,
  onUpdate: (update: PhonePairingUpdate) => void,
): () => void {
  const code = rawCode.replace(/\D/g, '').slice(0, 4)
  if (code.length !== 4) {
    onUpdate({ phase: 'error', message: 'Enter all 4 digits shown inside the headset.' })
    return () => {}
  }

  if (!supabase) {
    const message =
      'Supabase is not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY). Cross-device pairing unavailable.'
    console.error('[Stagera Pairing]', message)
    onUpdate({ phase: 'error', message })
    return () => {}
  }

  const client = supabase
  let cancelled = false
  let ackReceived = false
  let retryTimer: number | null = null
  let timeoutTimer: number | null = null

  const channelName = getPairingChannelName(code)
  onUpdate({ phase: 'connecting', message: 'Connecting to Supabase...' })

  const channel = client.channel(channelName, {
    config: { broadcast: { self: false, ack: true } },
  })

  const clearTimers = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer)
      retryTimer = null
    }
    if (timeoutTimer !== null) {
      window.clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  const broadcastPairAndLaunch = async () => {
    if (cancelled || ackReceived) return
    try {
      await channel.send({
        type: 'broadcast',
        event: 'phone_pair',
        payload: { code, ts: Date.now() },
      })
      await channel.send({
        type: 'broadcast',
        event: 'launch_session',
        payload: { code, setup },
      })
    } catch (err: unknown) {
      if (cancelled || ackReceived) return
      const errMsg = err instanceof Error ? err.message : 'Network broadcast failed'
      console.error('[Stagera Pairing] Broadcast error:', err)
      onUpdate({ phase: 'error', message: `Failed to send to headset: ${errMsg}` })
    }
  }

  channel
    .on('broadcast', { event: 'headset_ack' }, () => {
      if (cancelled || ackReceived) return
      ackReceived = true
      clearTimers()
      onUpdate({ phase: 'connected', message: '✓ Connected & sent to Quest!' })
      // Keep channel briefly so any final delivery completes cleanly
      window.setTimeout(() => {
        void client.removeChannel(channel)
      }, 1000)
    })
    .subscribe((status, err) => {
      if (cancelled) return

      if (status === 'SUBSCRIBED') {
        onUpdate({ phase: 'waiting_headset', message: 'Waiting for headset...' })
        void broadcastPairAndLaunch()

        // Retry once after 1200ms if headset_ack hasn't arrived yet
        retryTimer = window.setTimeout(() => {
          if (!cancelled && !ackReceived) {
            void broadcastPairAndLaunch()
          }
        }, 1200)

        // Surface clear timeout error if headset never responds after 8s
        timeoutTimer = window.setTimeout(() => {
          if (!cancelled && !ackReceived) {
            onUpdate({
              phase: 'error',
              message: `No response from headset for code ${code}. Double-check the 4-digit code shown inside Quest and try again.`,
            })
            void client.removeChannel(channel)
          }
        }, 8000)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimers()
        const detail = err?.message ? ` (${err.message})` : ''
        const message = `Supabase Realtime connection failed: ${status}${detail}. Check network & VITE_SUPABASE_URL.`
        console.error('[Stagera Pairing]', message)
        onUpdate({ phase: 'error', message })
        void client.removeChannel(channel)
      } else if (status === 'CLOSED' && !ackReceived) {
        clearTimers()
      }
    })

  return () => {
    cancelled = true
    clearTimers()
    void client.removeChannel(channel)
  }
}

export type ClaimPairingResult =
  | { ok: true; setup: SessionSetup }
  | { ok: false; reason: 'invalid' | 'expired' | 'not_found' }

/**
 * Legacy helper retained for `VRPreFlight.tsx` (desktop Step 2 manual code entry).
 * Uses the same unified `stagera-pair-${code}` Supabase Realtime channel.
 */
export async function claimPairingCode(rawCode: string): Promise<ClaimPairingResult> {
  const code = rawCode.replace(/\D/g, '').slice(0, 4)
  if (code.length !== 4) {
    return { ok: false, reason: 'invalid' }
  }

  if (!supabase) {
    console.warn('[Stagera Pairing] Supabase not configured for claimPairingCode.')
    return { ok: false, reason: 'not_found' }
  }

  const client = supabase
  const setup = await new Promise<SessionSetup | null>((resolve) => {
    let settled = false
    const finish = (found: SessionSetup | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      void client.removeChannel(channel)
      resolve(found)
    }

    const channel = client
      .channel(getPairingChannelName(code), {
        config: { broadcast: { self: false, ack: true } },
      })
      .on('broadcast', { event: 'launch_session' }, (msg) => {
        const payload = msg.payload as { setup?: SessionSetup } | undefined
        if (payload?.setup) {
          void channel.send({
            type: 'broadcast',
            event: 'headset_ack',
            payload: { code },
          })
          finish(payload.setup)
        }
      })
      .subscribe()

    const timer = window.setTimeout(() => finish(null), 4000)
  })

  if (setup) {
    return { ok: true, setup }
  }
  return { ok: false, reason: 'not_found' }
}

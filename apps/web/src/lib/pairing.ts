import { supabase } from './supabase'
import type { SessionRecord, SessionSetup } from '../types/stagera'

export const PAIRING_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes (FR-09)
const ACTIVE_LINK_STORAGE_KEY = 'stagera_active_phone_link_v1'
const LINK_REPORT_PREFIX = 'stagera_link_report_v1_'
const LINK_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours persistent session window

export type PairingSessionStatus =
  | 'waiting'
  | 'paired'
  | 'in_session'
  | 'generating_report'
  | 'debrief'
  | 'report_ready'

export interface PersistedPhoneLink {
  code: string
  setupTitle: string
  pairedAt: number
}

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

export function saveActivePhoneLink(link: PersistedPhoneLink): void {
  try {
    const json = JSON.stringify(link)
    sessionStorage.setItem(ACTIVE_LINK_STORAGE_KEY, json)
    localStorage.setItem(ACTIVE_LINK_STORAGE_KEY, json)
  } catch {
    // Ignore storage access errors
  }
}

export function loadActivePhoneLink(): PersistedPhoneLink | null {
  try {
    const raw =
      sessionStorage.getItem(ACTIVE_LINK_STORAGE_KEY) ??
      localStorage.getItem(ACTIVE_LINK_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedPhoneLink>
    if (
      typeof parsed.code !== 'string' ||
      parsed.code.length !== 4 ||
      typeof parsed.pairedAt !== 'number'
    ) {
      return null
    }
    if (Date.now() - parsed.pairedAt > LINK_TTL_MS) {
      clearActivePhoneLink()
      return null
    }
    return {
      code: parsed.code,
      setupTitle: typeof parsed.setupTitle === 'string' ? parsed.setupTitle : 'VR Session',
      pairedAt: parsed.pairedAt,
    }
  } catch {
    return null
  }
}

export function clearActivePhoneLink(): void {
  try {
    sessionStorage.removeItem(ACTIVE_LINK_STORAGE_KEY)
    localStorage.removeItem(ACTIVE_LINK_STORAGE_KEY)
  } catch {
    // Ignore
  }
}

function cacheReportLocally(code: string, record: SessionRecord): void {
  try {
    localStorage.setItem(
      `${LINK_REPORT_PREFIX}${code}`,
      JSON.stringify({ record, savedAt: Date.now() }),
    )
  } catch {
    // Ignore quota/storage errors
  }
}

export function loadCachedReportForCode(code: string): SessionRecord | null {
  try {
    const raw = localStorage.getItem(`${LINK_REPORT_PREFIX}${code}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { record?: SessionRecord; savedAt?: number }
    if (!parsed.record || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > LINK_TTL_MS) return null
    return parsed.record
  } catch {
    return null
  }
}

async function upsertDbPairingLink(
  code: string,
  status: 'paired' | 'in_session' | 'generating_report' | 'report_ready' | 'ended',
  extras?: { setup?: SessionSetup; report?: SessionRecord },
): Promise<void> {
  if (!supabase) return
  try {
    const row: Record<string, unknown> = {
      code,
      status,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
    }
    if (extras?.setup) row.setup_payload = extras.setup
    if (extras?.report) row.report_payload = extras.report
    await supabase.from('pairing_session_links').upsert(row)
  } catch {
    // Gracefully ignore if migration 0002 has not been applied yet
  }
}

export async function fetchDbPairingLinkReport(
  code: string,
): Promise<{ status: PairingSessionStatus; record?: SessionRecord } | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('pairing_session_links')
      .select('status, report_payload')
      .eq('code', code)
      .maybeSingle()

    if (error || !data) return null
    const status = (data.status as PairingSessionStatus) ?? 'paired'
    const record =
      data.report_payload && typeof data.report_payload === 'object'
        ? (data.report_payload as SessionRecord)
        : undefined
    return { status, record }
  } catch {
    return null
  }
}

/* ============================================================================
   Headset Persistent Session Link (stays connected lobby -> active -> debrief)
   ============================================================================ */

export interface HeadsetPersistentLinkCallbacks {
  onPaired?: () => void
  onLaunchSession: (setup: SessionSetup) => void
  onPhoneReportOpened?: () => void
  onError?: (message: string) => void
}

export interface HeadsetPersistentLink {
  code: string
  updateStatus: (status: PairingSessionStatus, setupTitle?: string) => void
  publishReportReady: (record: SessionRecord) => Promise<void>
  destroy: () => void
}

export function createHeadsetPersistentLink(
  rawCode: string,
  callbacks: HeadsetPersistentLinkCallbacks,
): HeadsetPersistentLink {
  const code = rawCode.replace(/\D/g, '').slice(0, 4)
  const noop: HeadsetPersistentLink = {
    code,
    updateStatus: () => {},
    publishReportReady: async () => {},
    destroy: () => {},
  }
  if (code.length !== 4) return noop

  const channelName = getPairingChannelName(code)
  let destroyed = false
  let currentStatus: PairingSessionStatus = 'waiting'
  let currentSetupTitle = ''
  let latestReport: SessionRecord | null = null
  let lastLaunchedSetupId: string | null = null
  let retryBroadcastTimer: number | null = null

  const bc =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null

  const client = supabase
  const channel = client
    ? client.channel(channelName, {
        config: { broadcast: { self: false, ack: true } },
      })
    : null

  const emitEvent = (event: string, payload: Record<string, unknown>) => {
    if (destroyed) return
    if (bc) {
      try {
        bc.postMessage({ event, payload })
      } catch {
        // Ignore
      }
    }
    if (channel) {
      void channel
        .send({
          type: 'broadcast',
          event,
          payload,
        })
        .catch((err: unknown) => {
          console.warn(`[Stagera Pairing] Headset failed sending ${event}:`, err)
        })
    }
  }

  const sendStateSync = () => {
    emitEvent('headset_state_sync', {
      code,
      status: currentStatus,
      setupTitle: currentSetupTitle,
      record: latestReport,
      ts: Date.now(),
    })
  }

  const handleIncoming = (event: string, payload: Record<string, unknown> | undefined) => {
    if (destroyed) return

    if (event === 'phone_pair') {
      if (currentStatus === 'waiting') currentStatus = 'paired'
      emitEvent('headset_ack', { code, status: currentStatus, ts: Date.now() })
      sendStateSync()
      callbacks.onPaired?.()
      return
    }

    if (event === 'phone_sync_request') {
      emitEvent('headset_ack', { code, status: currentStatus, ts: Date.now() })
      sendStateSync()
      if (latestReport && currentStatus === 'report_ready') {
        emitEvent('report_ready', {
          code,
          status: 'report_ready',
          record: latestReport,
          ts: Date.now(),
        })
      }
      return
    }

    if (event === 'phone_report_ack') {
      callbacks.onPhoneReportOpened?.()
      return
    }

    if (event === 'launch_session') {
      const setup =
        payload && typeof payload === 'object' && 'setup' in payload && payload.setup
          ? (payload.setup as SessionSetup)
          : (payload as SessionSetup | undefined)
      emitEvent('headset_ack', { code, status: 'in_session', ts: Date.now() })
      callbacks.onPaired?.()

      if (setup && typeof setup.venue === 'string') {
        const launchKey = `${setup.id ?? setup.title}-${setup.venue}`
        if (lastLaunchedSetupId !== launchKey || currentStatus === 'waiting' || currentStatus === 'debrief' || currentStatus === 'report_ready') {
          lastLaunchedSetupId = launchKey
          currentSetupTitle = setup.title
          currentStatus = 'in_session'
          latestReport = null
          callbacks.onLaunchSession(setup)
          void upsertDbPairingLink(code, 'in_session', { setup })
        }
      }
    }
  }

  if (bc) {
    bc.onmessage = (ev: MessageEvent<{ event?: string; payload?: Record<string, unknown> }>) => {
      if (ev.data?.event) {
        handleIncoming(ev.data.event, ev.data.payload)
      }
    }
  }

  if (channel) {
    channel
      .on('broadcast', { event: 'phone_pair' }, (msg) =>
        handleIncoming('phone_pair', msg.payload as Record<string, unknown> | undefined),
      )
      .on('broadcast', { event: 'launch_session' }, (msg) =>
        handleIncoming('launch_session', msg.payload as Record<string, unknown> | undefined),
      )
      .on('broadcast', { event: 'phone_sync_request' }, (msg) =>
        handleIncoming('phone_sync_request', msg.payload as Record<string, unknown> | undefined),
      )
      .on('broadcast', { event: 'phone_report_ack' }, (msg) =>
        handleIncoming('phone_report_ack', msg.payload as Record<string, unknown> | undefined),
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const detail = err?.message ? `: ${err.message}` : ''
          const message = `Supabase Realtime ${status.toLowerCase()}${detail}`
          console.error('[Stagera Pairing]', message)
          callbacks.onError?.(message)
        }
      })
  } else {
    console.warn(
      '[Stagera Pairing] Supabase Realtime not configured; using local BroadcastChannel only.',
    )
  }

  return {
    code,
    updateStatus(status: PairingSessionStatus, setupTitle?: string) {
      currentStatus = status
      if (setupTitle) currentSetupTitle = setupTitle
      emitEvent('session_status', {
        code,
        status,
        setupTitle: currentSetupTitle,
        ts: Date.now(),
      })
      if (status === 'in_session' || status === 'generating_report' || status === 'paired') {
        void upsertDbPairingLink(code, status)
      }
    },
    async publishReportReady(record: SessionRecord) {
      currentStatus = 'report_ready'
      currentSetupTitle = record.title
      latestReport = record
      cacheReportLocally(code, record)

      const payload = {
        code,
        status: 'report_ready',
        viewReport: true,
        record,
        ts: Date.now(),
      }
      emitEvent('report_ready', payload)
      emitEvent('view_report', payload)

      if (retryBroadcastTimer !== null) {
        window.clearTimeout(retryBroadcastTimer)
      }
      retryBroadcastTimer = window.setTimeout(() => {
        if (!destroyed && latestReport?.id === record.id) {
          emitEvent('report_ready', { ...payload, ts: Date.now() })
        }
      }, 900)

      await upsertDbPairingLink(code, 'report_ready', { report: record })
    },
    destroy() {
      destroyed = true
      if (retryBroadcastTimer !== null) {
        window.clearTimeout(retryBroadcastTimer)
        retryBroadcastTimer = null
      }
      if (bc) {
        try {
          bc.close()
        } catch {
          // Ignore
        }
      }
      if (client && channel) {
        void client.removeChannel(channel)
      }
    },
  }
}

/* ============================================================================
   Phone Persistent Session Link (stays connected across setup -> VR -> report)
   ============================================================================ */

export type PhonePairingPhase =
  | 'idle'
  | 'connecting'
  | 'waiting_headset'
  | 'connected'
  | 'in_session'
  | 'generating_report'
  | 'report_ready'
  | 'error'

export interface PhonePairingUpdate {
  phase: PhonePairingPhase
  message: string
  code: string
}

export interface PhonePersistentLink {
  code: string
  sendLaunchSetup: (setup: SessionSetup) => void
  requestSync: () => void
  disconnect: () => void
}

export function createPhonePersistentLink(params: {
  rawCode: string
  setup?: SessionSetup | null
  isReconnect?: boolean
  onUpdate: (update: PhonePairingUpdate) => void
  onReportReady: (record: SessionRecord) => void
}): PhonePersistentLink {
  const code = params.rawCode.replace(/\D/g, '').slice(0, 4)
  const noop: PhonePersistentLink = {
    code,
    sendLaunchSetup: () => {},
    requestSync: () => {},
    disconnect: () => {},
  }

  if (code.length !== 4) {
    params.onUpdate({
      phase: 'error',
      code,
      message: 'Enter all 4 digits shown inside the headset.',
    })
    return noop
  }

  const channelName = getPairingChannelName(code)
  let destroyed = false
  let ackReceived = Boolean(params.isReconnect)
  let deliveredReportKey: string | null = null
  let retryTimer: number | null = null
  let timeoutTimer: number | null = null
  let pendingSetup: SessionSetup | null = params.setup ?? null

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

  const bc =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null

  const client = supabase
  const channel = client
    ? client.channel(channelName, {
        config: { broadcast: { self: false, ack: true } },
      })
    : null

  const emitEvent = async (event: string, payload: Record<string, unknown>) => {
    if (destroyed) return
    if (bc) {
      try {
        bc.postMessage({ event, payload })
      } catch {
        // Ignore
      }
    }
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event,
        payload,
      })
    }
  }

  const deliverReportIfNew = (record: SessionRecord) => {
    const key = `${record.id}:${record.aiFeedback ? 'ai' : 'base'}:${record.durationSeconds}`
    if (deliveredReportKey === key) return
    deliveredReportKey = key
    cacheReportLocally(code, record)
    void emitEvent('phone_report_ack', { code, recordId: record.id, ts: Date.now() }).catch(
      () => {},
    )
    params.onUpdate({
      phase: 'report_ready',
      code,
      message: '✓ Report received from VR headset!',
    })
    params.onReportReady(record)
  }

  const checkStoredReportFallback = async () => {
    if (destroyed) return
    const cached = loadCachedReportForCode(code)
    if (cached) {
      deliverReportIfNew(cached)
      return
    }
    const fromDb = await fetchDbPairingLinkReport(code)
    if (destroyed || !fromDb) return
    if (fromDb.record && fromDb.status === 'report_ready') {
      deliverReportIfNew(fromDb.record)
    } else if (fromDb.status === 'in_session') {
      ackReceived = true
      params.onUpdate({
        phase: 'in_session',
        code,
        message: `● Linked to Quest (${code}) — Session in progress`,
      })
    } else if (fromDb.status === 'generating_report') {
      ackReceived = true
      params.onUpdate({
        phase: 'generating_report',
        code,
        message: `● Linked (${code}) — Generating AI session report…`,
      })
    }
  }

  const handleIncoming = (event: string, payload: Record<string, unknown> | undefined) => {
    if (destroyed) return

    if (event === 'headset_ack') {
      ackReceived = true
      clearTimers()
      saveActivePhoneLink({
        code,
        setupTitle: pendingSetup?.title ?? loadActivePhoneLink()?.setupTitle ?? 'VR Session',
        pairedAt: Date.now(),
      })
      const remoteStatus = payload?.status as PairingSessionStatus | undefined
      if (remoteStatus === 'in_session') {
        params.onUpdate({
          phase: 'in_session',
          code,
          message: `✓ Linked to Quest (${code}) — Session active. Waiting for report…`,
        })
      } else {
        params.onUpdate({
          phase: 'connected',
          code,
          message: `✓ Linked to Quest (${code}) — Ready & listening for report`,
        })
      }
      return
    }

    if (event === 'session_status') {
      ackReceived = true
      clearTimers()
      const status = payload?.status as PairingSessionStatus | undefined
      if (status === 'in_session') {
        params.onUpdate({
          phase: 'in_session',
          code,
          message: `● Linked to Quest (${code}) — Practice session in progress`,
        })
      } else if (status === 'generating_report') {
        params.onUpdate({
          phase: 'generating_report',
          code,
          message: `● Linked (${code}) — Session ended, generating AI report…`,
        })
      } else if (status === 'debrief') {
        params.onUpdate({
          phase: 'connected',
          code,
          message: `● Linked (${code}) — Quick Debrief open on Quest. Tap “View full report (on phone)” in VR.`,
        })
      }
      return
    }

    if (event === 'headset_state_sync') {
      ackReceived = true
      clearTimers()
      const record = payload?.record as SessionRecord | undefined
      const status = payload?.status as PairingSessionStatus | undefined
      if (record && status === 'report_ready') {
        deliverReportIfNew(record)
      } else if (status === 'in_session') {
        params.onUpdate({
          phase: 'in_session',
          code,
          message: `● Re-synced with Quest (${code}) — Session in progress`,
        })
      } else if (status === 'generating_report') {
        params.onUpdate({
          phase: 'generating_report',
          code,
          message: `● Re-synced (${code}) — Generating AI report…`,
        })
      } else {
        params.onUpdate({
          phase: 'connected',
          code,
          message: `● Linked to Quest (${code}) — Listening for report`,
        })
      }
      return
    }

    if (event === 'report_ready' || event === 'view_report') {
      ackReceived = true
      clearTimers()
      const record = payload?.record as SessionRecord | undefined
      if (record && typeof record.id === 'string') {
        deliverReportIfNew(record)
      }
    }
  }

  const sendPairAndLaunch = async () => {
    if (destroyed) return
    try {
      await emitEvent('phone_pair', { code, ts: Date.now() })
      if (pendingSetup) {
        await emitEvent('launch_session', { code, setup: pendingSetup })
      } else {
        await emitEvent('phone_sync_request', { code, ts: Date.now() })
      }
    } catch (err: unknown) {
      if (destroyed || ackReceived) return
      const errMsg = err instanceof Error ? err.message : 'Network broadcast failed'
      params.onUpdate({
        phase: 'error',
        code,
        message: `Failed to send to headset: ${errMsg}`,
      })
    }
  }

  const requestSync = () => {
    if (destroyed) return
    void emitEvent('phone_sync_request', { code, ts: Date.now() }).catch(() => {})
    void checkStoredReportFallback()
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && !destroyed) {
      requestSync()
    }
  }
  const onOnline = () => {
    if (!destroyed) requestSync()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
  }

  if (bc) {
    bc.onmessage = (ev: MessageEvent<{ event?: string; payload?: Record<string, unknown> }>) => {
      if (ev.data?.event) {
        handleIncoming(ev.data.event, ev.data.payload)
      }
    }
  }

  params.onUpdate({
    phase: params.isReconnect ? 'connected' : 'connecting',
    code,
    message: params.isReconnect
      ? `● Re-syncing link with Quest (${code})…`
      : 'Connecting to headset…',
  })

  if (channel) {
    channel
      .on('broadcast', { event: 'headset_ack' }, (msg) =>
        handleIncoming('headset_ack', msg.payload as Record<string, unknown> | undefined),
      )
      .on('broadcast', { event: 'session_status' }, (msg) =>
        handleIncoming('session_status', msg.payload as Record<string, unknown> | undefined),
      )
      .on('broadcast', { event: 'headset_state_sync' }, (msg) =>
        handleIncoming('headset_state_sync', msg.payload as Record<string, unknown> | undefined),
      )
      .on('broadcast', { event: 'report_ready' }, (msg) =>
        handleIncoming('report_ready', msg.payload as Record<string, unknown> | undefined),
      )
      .on('broadcast', { event: 'view_report' }, (msg) =>
        handleIncoming('view_report', msg.payload as Record<string, unknown> | undefined),
      )
      .subscribe((status, err) => {
        if (destroyed) return
        if (status === 'SUBSCRIBED') {
          if (params.isReconnect) {
            requestSync()
          } else {
            params.onUpdate({
              phase: 'waiting_headset',
              code,
              message: 'Waiting for headset…',
            })
            void sendPairAndLaunch()

            retryTimer = window.setTimeout(() => {
              if (!destroyed && !ackReceived) {
                void sendPairAndLaunch()
              }
            }, 1200)

            timeoutTimer = window.setTimeout(() => {
              if (!destroyed && !ackReceived) {
                params.onUpdate({
                  phase: 'error',
                  code,
                  message: `No response from headset for code ${code}. Double-check the 4-digit code shown inside Quest and try again.`,
                })
              }
            }, 8500)
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimers()
          if (!bc) {
            const detail = err?.message ? ` (${err.message})` : ''
            params.onUpdate({
              phase: 'error',
              code,
              message: `Supabase Realtime connection failed: ${status}${detail}.`,
            })
          }
        }
      })
  } else if (bc) {
    // Same-browser local fallback when Supabase env vars are not configured
    if (params.isReconnect) {
      requestSync()
    } else {
      params.onUpdate({
        phase: 'waiting_headset',
        code,
        message: 'Waiting for local VR simulator tab…',
      })
      void sendPairAndLaunch()
      timeoutTimer = window.setTimeout(() => {
        if (!destroyed && !ackReceived) {
          params.onUpdate({
            phase: 'error',
            code,
            message: `No headset tab responded for code ${code}. Open VR mode (?mode=vr) in another tab or configure Supabase Realtime for cross-device pairing.`,
          })
        }
      }, 6000)
    }
  } else {
    params.onUpdate({
      phase: 'error',
      code,
      message:
        'Supabase is not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY).',
    })
  }

  return {
    code,
    sendLaunchSetup(nextSetup: SessionSetup) {
      pendingSetup = nextSetup
      saveActivePhoneLink({ code, setupTitle: nextSetup.title, pairedAt: Date.now() })
      void sendPairAndLaunch()
    },
    requestSync,
    disconnect() {
      destroyed = true
      clearTimers()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline)
      }
      if (bc) {
        try {
          bc.close()
        } catch {
          // Ignore
        }
      }
      if (client && channel) {
        void client.removeChannel(channel)
      }
    },
  }
}

export type ClaimPairingResult =
  | { ok: true; setup: SessionSetup }
  | { ok: false; reason: 'invalid' | 'expired' | 'not_found' }

/**
 * Helper retained for `VRPreFlight.tsx` (desktop Step 2 manual code entry).
 */
export async function claimPairingCode(rawCode: string): Promise<ClaimPairingResult> {
  const code = rawCode.replace(/\D/g, '').slice(0, 4)
  if (code.length !== 4) {
    return { ok: false, reason: 'invalid' }
  }

  const channelName = getPairingChannelName(code)
  const client = supabase
  const bc =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null

  if (!client && !bc) {
    return { ok: false, reason: 'not_found' }
  }

  const setup = await new Promise<SessionSetup | null>((resolve) => {
    let settled = false
    const finish = (found: SessionSetup | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      if (bc) {
        try {
          bc.close()
        } catch {
          // Ignore
        }
      }
      if (client && channel) {
        void client.removeChannel(channel)
      }
      resolve(found)
    }

    const channel = client
      ? client
          .channel(channelName, {
            config: { broadcast: { self: false, ack: true } },
          })
          .on('broadcast', { event: 'launch_session' }, (msg) => {
            const payload = msg.payload as { setup?: SessionSetup } | undefined
            if (payload?.setup) {
              void channel?.send({
                type: 'broadcast',
                event: 'headset_ack',
                payload: { code, status: 'paired' },
              })
              finish(payload.setup)
            }
          })
          .subscribe()
      : null

    if (bc) {
      bc.onmessage = (ev: MessageEvent<{ event?: string; payload?: { setup?: SessionSetup } }>) => {
        if (ev.data?.event === 'launch_session' && ev.data.payload?.setup) {
          bc.postMessage({ event: 'headset_ack', payload: { code, status: 'paired' } })
          finish(ev.data.payload.setup)
        }
      }
    }

    const timer = window.setTimeout(() => finish(null), 4000)
  })

  if (setup) {
    return { ok: true, setup }
  }
  return { ok: false, reason: 'not_found' }
}

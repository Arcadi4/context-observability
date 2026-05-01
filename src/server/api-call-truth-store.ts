import type {
  ApiCallBodyShape,
  ApiCallBounds,
  ApiCallRecord,
  ApiCallSource,
  ApiProviderFamily,
} from "../shared/types"

/**
 * Internal representation of an API call record.
 * This is the truth-layer contract for in-memory/session-scoped storage.
 */
export type InternalApiCallRecord = {
  /** Unix timestamp in milliseconds */
  timestamp: number
  /** Full request URL */
  url: string
  /** Host extracted from URL */
  host: string
  /** HTTP method */
  method: string
  /** Provider family classification */
  provider: ApiProviderFamily
  /** Body shape classification */
  bodyShape: ApiCallBodyShape
  /** Bounded body preview (truncated by maxBodyBytes) */
  bodyPreview: string | null
  /** Whether the body was truncated */
  bodyTruncated: boolean
  /** Original body size in bytes before truncation */
  originalBodyBytes: number | null
  /** Session ID (null if unknown) */
  sessionID: string | null
  /** Source of the API call */
  source: ApiCallSource
  /** Timing information */
  timing: {
    startTime: number
    endTime?: number
  }
  /** Deduplication ID */
  dedupeID: string
  /** Sequence number for global ordering */
  sequence: number
}

/**
 * Contract for the in-memory API call truth store.
 * Session-scoped, no file persistence.
 */
export type ApiCallTruthStore = {
  /** Capture an API call record */
  capture(record: InternalApiCallRecord): void
  /** Get recent records for a session (bounded by limit) */
  getRecentForSession(sessionID: string, limit: number): InternalApiCallRecord[]
  /** Get all records for a session */
  getAllForSession(sessionID: string): InternalApiCallRecord[]
  /** Clear all records for a session */
  clearSession(sessionID: string): void
  /** Get records with unknown session ID */
  getUnknownSessionCalls(limit: number): InternalApiCallRecord[]
  /** Get total record count across all sessions */
  size(): number
}

const UNKNOWN_SESSION_KEY = "__unknown__"
const DEFAULT_MAX_RECENT_PER_SESSION = 50
const DEFAULT_MAX_BODY_BYTES = 1024

/**
 * Default bounds configuration.
 */
export const DEFAULT_API_CALL_BOUNDS: ApiCallBounds = {
  maxRecentPerSession: DEFAULT_MAX_RECENT_PER_SESSION,
  maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
}

/**
 * Creates a bounded in-memory API call truth store.
 *
 * Design:
 * - Uses Map<string, InternalApiCallRecord[]> for session buckets
 * - Enforces maxRecentPerSession per session (evicts oldest)
 * - Uses sequence counter for global ordering
 * - Handles "unknown" session ID as special bucket
 * - Synchronous only, safe for single-threaded access
 */
export function createApiCallTruthStore(bounds: Partial<ApiCallBounds> = {}): ApiCallTruthStore {
  const config: ApiCallBounds = {
    ...DEFAULT_API_CALL_BOUNDS,
    ...bounds,
  }

  const sessionBuckets = new Map<string, InternalApiCallRecord[]>()
  let sequenceCounter = 0

  function getBucket(sessionID: string | null): InternalApiCallRecord[] {
    const key = sessionID ?? UNKNOWN_SESSION_KEY
    let bucket = sessionBuckets.get(key)
    if (!bucket) {
      bucket = []
      sessionBuckets.set(key, bucket)
    }
    return bucket
  }

  function enforceLimit(bucket: InternalApiCallRecord[]): void {
    while (bucket.length > config.maxRecentPerSession) {
      bucket.shift()
    }
  }

  return {
    capture(record: InternalApiCallRecord): void {
      try {
        const bucket = getBucket(record.sessionID)
        bucket.push(record)
        enforceLimit(bucket)
      } catch {
        // Contain insertion errors - do not throw
      }
    },

    getRecentForSession(sessionID: string, limit: number): InternalApiCallRecord[] {
      const bucket = sessionBuckets.get(sessionID)
      if (!bucket) return []
      const start = Math.max(0, bucket.length - limit)
      return bucket.slice(start)
    },

    getAllForSession(sessionID: string): InternalApiCallRecord[] {
      const bucket = sessionBuckets.get(sessionID)
      return bucket ? [...bucket] : []
    },

    clearSession(sessionID: string): void {
      sessionBuckets.delete(sessionID)
    },

    getUnknownSessionCalls(limit: number): InternalApiCallRecord[] {
      const bucket = sessionBuckets.get(UNKNOWN_SESSION_KEY)
      if (!bucket) return []
      return bucket.slice(0, limit)
    },

    size(): number {
      let total = 0
      for (const bucket of sessionBuckets.values()) {
        total += bucket.length
      }
      return total
    },
  }
}

/**
 * Adapter: converts InternalApiCallRecord to shared ApiCallRecord.
 * Strips internal-only fields (host, sequence, timing.startTime/endTime).
 */
export function toSharedApiCallRecord(internal: InternalApiCallRecord): ApiCallRecord {
  const startedAt = new Date(internal.timing.startTime).toISOString()
  const endedAt = internal.timing.endTime
    ? new Date(internal.timing.endTime).toISOString()
    : undefined
  const durationMs =
    internal.timing.endTime != null
      ? internal.timing.endTime - internal.timing.startTime
      : undefined

  return {
    id: internal.dedupeID,
    timestamp: new Date(internal.timestamp).toISOString(),
    url: internal.url,
    method: internal.method,
    provider: internal.provider,
    bodyShape: internal.bodyShape,
    bodyPreview: internal.bodyPreview ?? "",
    bodyTruncated: internal.bodyTruncated,
    originalBodyBytes: internal.originalBodyBytes ?? 0,
    timing: {
      startedAt,
      endedAt,
      durationMs,
    },
    sessionID: internal.sessionID ?? "",
    source: internal.source,
    dedupeID: internal.dedupeID,
  }
}

/**
 * Truncates a body string to maxBodyBytes and returns preview + metadata.
 */
export function truncateBody(
  body: string | null | undefined,
  maxBodyBytes: number
): { preview: string | null; truncated: boolean; originalBytes: number | null } {
  if (body == null) {
    return { preview: null, truncated: false, originalBytes: null }
  }

  const encoder = new TextEncoder()
  const originalBytes = encoder.encode(body).length

  if (originalBytes <= maxBodyBytes) {
    return { preview: body, truncated: false, originalBytes }
  }

  // Truncate by bytes, not characters
  let truncated = ""
  let byteCount = 0
  for (const char of body) {
    const charBytes = encoder.encode(char).length
    if (byteCount + charBytes > maxBodyBytes) break
    truncated += char
    byteCount += charBytes
  }

  return { preview: truncated, truncated: true, originalBytes }
}

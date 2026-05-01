import { test, expect, describe } from "bun:test"
import {
  createApiCallTruthStore,
  toSharedApiCallRecord,
  truncateBody,
  DEFAULT_API_CALL_BOUNDS,
} from "./api-call-truth-store"
import type { InternalApiCallRecord } from "./api-call-truth-store"

function makeRecord(overrides: Partial<InternalApiCallRecord> = {}): InternalApiCallRecord {
  return {
    timestamp: Date.now(),
    url: "https://api.anthropic.com/v1/messages",
    host: "api.anthropic.com",
    method: "POST",
    provider: "anthropic",
    bodyShape: "messages",
    bodyPreview: '{"model":"claude-3"}',
    bodyTruncated: false,
    originalBodyBytes: 20,
    sessionID: "session-1",
    source: "global",
    timing: { startTime: Date.now() },
    dedupeID: "dedupe-1",
    sequence: 0,
    ...overrides,
  }
}

describe("ApiCallTruthStore", () => {
  test("capture and retrieve records for a session", () => {
    const store = createApiCallTruthStore()
    const record = makeRecord({ sessionID: "sess-1", dedupeID: "d1" })

    store.capture(record)

    const all = store.getAllForSession("sess-1")
    expect(all).toHaveLength(1)
    expect(all[0]!.dedupeID).toBe("d1")
  })

  test("returns empty array for unknown session", () => {
    const store = createApiCallTruthStore()

    const all = store.getAllForSession("nonexistent")
    expect(all).toEqual([])
  })

  test("getRecentForSession respects limit", () => {
    const store = createApiCallTruthStore()

    for (let i = 0; i < 10; i++) {
      store.capture(makeRecord({ sessionID: "sess-1", dedupeID: `d${i}`, sequence: i }))
    }

    const recent = store.getRecentForSession("sess-1", 3)
    expect(recent).toHaveLength(3)
    expect(recent[0]!.dedupeID).toBe("d7")
    expect(recent[1]!.dedupeID).toBe("d8")
    expect(recent[2]!.dedupeID).toBe("d9")
  })

  test("bounded store evicts oldest records beyond maxRecentPerSession", () => {
    const store = createApiCallTruthStore({ maxRecentPerSession: 5 })

    for (let i = 0; i < 8; i++) {
      store.capture(makeRecord({ sessionID: "sess-1", dedupeID: `d${i}`, sequence: i }))
    }

    const all = store.getAllForSession("sess-1")
    expect(all).toHaveLength(5)
    expect(all[0]!.dedupeID).toBe("d3")
    expect(all[4]!.dedupeID).toBe("d7")
  })

  test("eviction is per-session, not global", () => {
    const store = createApiCallTruthStore({ maxRecentPerSession: 3 })

    for (let i = 0; i < 5; i++) {
      store.capture(makeRecord({ sessionID: "sess-1", dedupeID: `a${i}`, sequence: i }))
      store.capture(makeRecord({ sessionID: "sess-2", dedupeID: `b${i}`, sequence: i + 100 }))
    }

    const sess1 = store.getAllForSession("sess-1")
    const sess2 = store.getAllForSession("sess-2")

    expect(sess1).toHaveLength(3)
    expect(sess2).toHaveLength(3)
    expect(sess1[0]!.dedupeID).toBe("a2")
    expect(sess2[0]!.dedupeID).toBe("b2")
  })

  test("unknown session bucket handles null sessionID", () => {
    const store = createApiCallTruthStore()

    store.capture(makeRecord({ sessionID: null, dedupeID: "unknown-1" }))
    store.capture(makeRecord({ sessionID: null, dedupeID: "unknown-2" }))
    store.capture(makeRecord({ sessionID: "sess-1", dedupeID: "known-1" }))

    const unknownCalls = store.getUnknownSessionCalls(10)
    expect(unknownCalls).toHaveLength(2)
    expect(unknownCalls[0]!.dedupeID).toBe("unknown-1")
    expect(unknownCalls[1]!.dedupeID).toBe("unknown-2")
  })

  test("clearSession removes all records for a session", () => {
    const store = createApiCallTruthStore()

    store.capture(makeRecord({ sessionID: "sess-1", dedupeID: "d1" }))
    store.capture(makeRecord({ sessionID: "sess-1", dedupeID: "d2" }))
    store.capture(makeRecord({ sessionID: "sess-2", dedupeID: "d3" }))

    store.clearSession("sess-1")

    expect(store.getAllForSession("sess-1")).toEqual([])
    expect(store.getAllForSession("sess-2")).toHaveLength(1)
    expect(store.size()).toBe(1)
  })

  test("size returns total count across all sessions", () => {
    const store = createApiCallTruthStore()

    store.capture(makeRecord({ sessionID: "sess-1" }))
    store.capture(makeRecord({ sessionID: "sess-2" }))
    store.capture(makeRecord({ sessionID: null }))

    expect(store.size()).toBe(3)
  })

  test("capture does not throw on invalid input", () => {
    const store = createApiCallTruthStore()

    expect(() => {
      store.capture(makeRecord({ sessionID: undefined as unknown as string }))
    }).not.toThrow()
  })

  test("default bounds are applied", () => {
    expect(DEFAULT_API_CALL_BOUNDS.maxRecentPerSession).toBe(50)
    expect(DEFAULT_API_CALL_BOUNDS.maxBodyBytes).toBe(1024)
  })
})

describe("toSharedApiCallRecord adapter", () => {
  test("strips internal-only fields (host, sequence)", () => {
    const internal = makeRecord({
      host: "api.anthropic.com",
      sequence: 42,
      timing: { startTime: 1000, endTime: 1500 },
    })

    const shared = toSharedApiCallRecord(internal)

    expect(shared).not.toHaveProperty("host")
    expect(shared).not.toHaveProperty("sequence")
    expect(shared).not.toHaveProperty("timing.startTime")
    expect(shared).not.toHaveProperty("timing.endTime")
  })

  test("converts timing to ISO strings and durationMs", () => {
    const internal = makeRecord({
      timing: { startTime: 1700000000000, endTime: 1700000001500 },
    })

    const shared = toSharedApiCallRecord(internal)

    expect(shared.timing.startedAt).toBe("2023-11-14T22:13:20.000Z")
    expect(shared.timing.endedAt).toBe("2023-11-14T22:13:21.500Z")
    expect(shared.timing.durationMs).toBe(1500)
  })

  test("handles missing endTime", () => {
    const internal = makeRecord({
      timing: { startTime: 1700000000000 },
    })

    const shared = toSharedApiCallRecord(internal)

    expect(shared.timing.endedAt).toBeUndefined()
    expect(shared.timing.durationMs).toBeUndefined()
  })

  test("converts timestamp to ISO string", () => {
    const internal = makeRecord({ timestamp: 1700000000000 })

    const shared = toSharedApiCallRecord(internal)

    expect(shared.timestamp).toBe("2023-11-14T22:13:20.000Z")
  })

  test("maps null sessionID to empty string", () => {
    const internal = makeRecord({ sessionID: null })

    const shared = toSharedApiCallRecord(internal)

    expect(shared.sessionID).toBe("")
  })

  test("maps null bodyPreview to empty string", () => {
    const internal = makeRecord({ bodyPreview: null })

    const shared = toSharedApiCallRecord(internal)

    expect(shared.bodyPreview).toBe("")
  })

  test("maps null originalBodyBytes to 0", () => {
    const internal = makeRecord({ originalBodyBytes: null })

    const shared = toSharedApiCallRecord(internal)

    expect(shared.originalBodyBytes).toBe(0)
  })

  test("uses dedupeID as record id", () => {
    const internal = makeRecord({ dedupeID: "my-dedupe-id" })

    const shared = toSharedApiCallRecord(internal)

    expect(shared.id).toBe("my-dedupe-id")
  })
})

describe("truncateBody", () => {
  test("returns null preview for null input", () => {
    const result = truncateBody(null, 100)

    expect(result.preview).toBeNull()
    expect(result.truncated).toBe(false)
    expect(result.originalBytes).toBeNull()
  })

  test("returns null preview for undefined input", () => {
    const result = truncateBody(undefined, 100)

    expect(result.preview).toBeNull()
    expect(result.truncated).toBe(false)
    expect(result.originalBytes).toBeNull()
  })

  test("does not truncate when body fits within maxBodyBytes", () => {
    const body = '{"model":"claude-3"}'
    const result = truncateBody(body, 100)

    expect(result.preview).toBe(body)
    expect(result.truncated).toBe(false)
    expect(result.originalBytes).toBe(body.length)
  })

  test("truncates body exceeding maxBodyBytes", () => {
    const body = "a".repeat(200)
    const result = truncateBody(body, 50)

    expect(result.preview).toHaveLength(50)
    expect(result.truncated).toBe(true)
    expect(result.originalBytes).toBe(200)
  })

  test("truncates by bytes, not characters (multi-byte UTF-8)", () => {
    const body = "你好世界" // 4 chars, 12 bytes
    const result = truncateBody(body, 6)

    expect(result.preview).toBe("你好")
    expect(result.truncated).toBe(true)
    expect(result.originalBytes).toBe(12)
  })

  test("handles empty string", () => {
    const result = truncateBody("", 100)

    expect(result.preview).toBe("")
    expect(result.truncated).toBe(false)
    expect(result.originalBytes).toBe(0)
  })
})

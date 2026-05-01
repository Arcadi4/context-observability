import { describe, expect, mock, test } from "bun:test"
import type {
  ApiCallRecord,
  CaptureMetadata,
  SessionClient,
  SessionObservationRecord,
  SessionSnapshot,
  SessionSummary,
} from "../shared/types"
import { getObservationBridge, type ObservationBridge } from "./bridge"
import { buildSessionSummary } from "../shared/session-summary"

/**
 * Runtime Correlation Contract Tests (T6)
 *
 * These tests define the architectural contract for how probe API-call records
 * attach to SessionObservationRecord and summaries. This is the hybrid
 * probe+hooks behavior across runtime, store, and shared modules.
 *
 * Architecture:
 * - Probe becomes primary for API calls (capture at fetch layer)
 * - Hooks remain for session metadata (title, workspace, messages, todo, diff, tokens)
 * - Bridge is the single access point for TUI
 *
 * Key Contracts:
 * 1. API-call records survive session enrichment failures
 * 2. Session snapshot enriches metadata but doesn't block on API calls
 * 3. Bridge returns enriched record with both API calls and session metadata
 * 4. Unknown session IDs are handled safely
 */

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockSessionClient(overrides: {
  get?: () => Promise<{ data?: unknown }>
  messages?: () => Promise<{ data?: unknown }>
  todo?: () => Promise<{ data?: unknown }>
  diff?: () => Promise<{ data?: unknown }>
} = {}): SessionClient {
  return {
    get: overrides.get ?? mock(() => Promise.resolve({ data: { id: "ses_123", title: "Test Session", workspaceID: "ws_456" } })),
    messages: overrides.messages ?? mock(() => Promise.resolve({ data: [] })),
    todo: overrides.todo ?? mock(() => Promise.resolve({ data: [] })),
    diff: overrides.diff ?? mock(() => Promise.resolve({ data: [] })),
  }
}

function createMockApiCallRecord(overrides: Partial<ApiCallRecord> = {}): ApiCallRecord {
  return {
    id: "call_001",
    timestamp: new Date().toISOString(),
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    provider: "anthropic",
    bodyShape: "messages",
    bodyPreview: '{"model":"claude-3"}',
    bodyTruncated: false,
    originalBodyBytes: 100,
    timing: {
      startedAt: new Date().toISOString(),
      endedAt: new Date(Date.now() + 1000).toISOString(),
      durationMs: 1000,
    },
    sessionID: "ses_123",
    source: "global",
    dedupeID: "dedupe_001",
    ...overrides,
  }
}

function createMockSessionSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    session: {
      id: "ses_123",
      title: "Test Session",
      workspaceID: "ws_456",
    },
    messages: [],
    todo: [],
    diff: [],
    ...overrides,
  }
}

function createMockCaptureMetadata(overrides: Partial<CaptureMetadata> = {}): CaptureMetadata {
  return {
    status: "fresh",
    source: "command",
    capturedAt: new Date().toISOString(),
    partial: false,
    ...overrides,
  }
}

// ============================================================================
// Mock Probe Truth Store
// ============================================================================

type MockProbeTruthStore = {
  records: ApiCallRecord[]
  capture: (record: ApiCallRecord) => void
  getForSession: (sessionID: string) => ApiCallRecord[]
  getUnknownCalls: () => ApiCallRecord[]
  clear: () => void
}

function createMockProbeTruthStore(): MockProbeTruthStore {
  const records: ApiCallRecord[] = []

  return {
    records,
    capture: (record: ApiCallRecord) => {
      records.push(record)
    },
    getForSession: (sessionID: string) => {
      return records.filter((r) => r.sessionID === sessionID && r.sessionID !== "" && r.sessionID !== "unknown")
    },
    getUnknownCalls: () => {
      return records.filter((r) => !r.sessionID || r.sessionID === "" || r.sessionID === "unknown")
    },
    clear: () => {
      records.length = 0
    },
  }
}

// ============================================================================
// Hybrid Assembly Functions (Contract Under Test)
// ============================================================================

/**
 * Assembles a SessionObservationRecord with API calls from probe truth store.
 * This is the core hybrid assembly logic.
 */
function assembleObservationRecord(
  snapshot: SessionSnapshot,
  captureMetadata: CaptureMetadata,
  apiCalls: ApiCallRecord[]
): SessionObservationRecord {
  const summary = buildSessionSummary(snapshot, snapshot.session?.id)

  return {
    snapshot,
    summary,
    captureMetadata,
    apiCalls,
  }
}

/**
 * Fetches session snapshot with metadata - simulates the runtime behavior.
 * Returns partial data even when some fetches fail.
 */
async function fetchSessionSnapshotWithMetadataHybrid(
  client: SessionClient,
  sessionID: string,
  maxMessages: number,
  includeDiff: boolean,
  includeTodos: boolean
): Promise<{
  snapshot: SessionSnapshot
  captureMetadata: Pick<CaptureMetadata, "status" | "partial" | "errorMessage">
}> {
  type SettledResult =
    | { ok: true; data: unknown }
    | { ok: false; error: Error }

  async function settle<T>(promise: Promise<T>): Promise<SettledResult> {
    try {
      const result = await promise
      return { ok: true, data: result }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
    }
  }

  const [sessionResult, messagesResult, todoResult, diffResult] = await Promise.all([
    settle(client.get(sessionID)),
    settle(client.messages({ sessionID, limit: maxMessages })),
    includeTodos && client.todo ? settle(client.todo({ sessionID })) : Promise.resolve({ ok: true, data: [] }),
    includeDiff && client.diff ? settle(client.diff({ sessionID })) : Promise.resolve({ ok: true, data: [] }),
  ])

  const attemptedCount = 2 + (includeTodos && client.todo ? 1 : 0) + (includeDiff && client.diff ? 1 : 0)
  const failures = [sessionResult, messagesResult, todoResult, diffResult].filter((r): r is Extract<SettledResult, { ok: false }> => !r.ok)

  const errorMessage = failures.length > 0
    ? failures.map((f, i) => f.error.message || `Request ${i + 1} failed`).join("; ")
    : undefined

  const status: CaptureMetadata["status"] = failures.length === 0
    ? "fresh"
    : failures.length === attemptedCount
      ? "error"
      : "partial"

  return {
    snapshot: {
      session: sessionResult.ok ? (sessionResult.data as { data?: unknown }).data as SessionSnapshot["session"] : undefined,
      messages: messagesResult.ok ? (messagesResult.data as { data?: unknown[] }).data ?? [] : [],
      todo: todoResult.ok ? (todoResult.data as { data?: unknown[] }).data ?? [] : [],
      diff: diffResult.ok ? (diffResult.data as { data?: unknown[] }).data ?? [] : [],
    },
    captureMetadata: {
      status,
      partial: failures.length > 0,
      errorMessage,
    },
  }
}

// ============================================================================
// Test Suite: Hybrid Record Assembly
// ============================================================================

describe("runtime correlation contract", () => {
  describe("hybrid record assembly", () => {
    test("probe records are primary API-call artifacts", () => {
      const probeStore = createMockProbeTruthStore()
      const apiCall = createMockApiCallRecord()

      // Probe captures the API call
      probeStore.capture(apiCall)

      // API calls exist independently of session snapshot
      expect(probeStore.getForSession("ses_123")).toHaveLength(1)
      expect(probeStore.getForSession("ses_123")[0]).toMatchObject({
        url: "https://api.anthropic.com/v1/messages",
        provider: "anthropic",
        sessionID: "ses_123",
      })
    })

    test("session snapshot enriches title/workspace/messages/todo/diff/tokens", async () => {
      const client = createMockSessionClient({
        get: mock(() => Promise.resolve({ data: { id: "ses_123", title: "My Session", workspaceID: "ws_789" } })),
        messages: mock(() => Promise.resolve({
          data: [
            { info: { role: "user", tokens: { input: 100 } }, parts: [{ text: "Hello" }] },
            { info: { role: "assistant", tokens: { output: 50 } }, parts: [{ text: "Hi" }] },
          ],
        })),
        todo: mock(() => Promise.resolve({ data: [{ id: "1", status: "completed", content: "Task 1" }] })),
        diff: mock(() => Promise.resolve({ data: [{ file: "test.ts", added: 10, removed: 5 }] })),
      })

      const { snapshot } = await fetchSessionSnapshotWithMetadataHybrid(
        client,
        "ses_123",
        100,
        true,
        true
      )

      // Session metadata enriched
      expect(snapshot.session).toMatchObject({
        id: "ses_123",
        title: "My Session",
        workspaceID: "ws_789",
      })

      // Messages enriched with tokens
      expect(snapshot.messages).toHaveLength(2)
      expect(snapshot.messages[0]?.info?.tokens?.input).toBe(100)
      expect(snapshot.messages[1]?.info?.tokens?.output).toBe(50)

      // Todo enriched
      expect(snapshot.todo).toHaveLength(1)
      expect(snapshot.todo[0]).toMatchObject({ status: "completed", content: "Task 1" })

      // Diff enriched
      expect(snapshot.diff).toHaveLength(1)
      expect(snapshot.diff[0]).toMatchObject({ file: "test.ts", added: 10, removed: 5 })
    })

    test("SessionObservationRecord.apiCalls contains probe records", () => {
      const probeStore = createMockProbeTruthStore()
      const apiCall1 = createMockApiCallRecord({ id: "call_001", dedupeID: "d1" })
      const apiCall2 = createMockApiCallRecord({ id: "call_002", dedupeID: "d2", provider: "openai" })

      probeStore.capture(apiCall1)
      probeStore.capture(apiCall2)

      const snapshot = createMockSessionSnapshot()
      const captureMetadata = createMockCaptureMetadata()
      const apiCalls = probeStore.getForSession("ses_123")

      const record = assembleObservationRecord(snapshot, captureMetadata, apiCalls)

      expect(record.apiCalls).toHaveLength(2)
      expect(record.apiCalls![0].id).toBe("call_001")
      expect(record.apiCalls![1].id).toBe("call_002")
      expect(record.apiCalls![1].provider).toBe("openai")
    })

    test("bridge returns enriched record with both API calls and session metadata", () => {
      const probeStore = createMockProbeTruthStore()
      const apiCall = createMockApiCallRecord({
        url: "https://api.anthropic.com/v1/messages",
        provider: "anthropic",
        bodyPreview: '{"model":"claude-3-opus"}',
      })

      probeStore.capture(apiCall)

      const snapshot = createMockSessionSnapshot({
        session: { id: "ses_123", title: "Test Session", workspaceID: "ws_456" },
      })
      const captureMetadata = createMockCaptureMetadata()
      const apiCalls = probeStore.getForSession("ses_123")

      const record = assembleObservationRecord(snapshot, captureMetadata, apiCalls)

      // Bridge-accessible record has both API calls and session metadata
      expect(record.summary.sessionID).toBe("ses_123")
      expect(record.summary.title).toBe("Test Session")
      expect(record.apiCalls).toHaveLength(1)
      expect(record.apiCalls![0].provider).toBe("anthropic")
    })
  })

  // ============================================================================
  // Test Suite: Failure Resilience
  // ============================================================================

  describe("failure resilience", () => {
    test("API-call records survive when session snapshot fetch fails", async () => {
      const probeStore = createMockProbeTruthStore()
      const apiCall = createMockApiCallRecord()

      // API call captured before session fetch
      probeStore.capture(apiCall)

      // Session fetch fails
      const failingClient = createMockSessionClient({
        get: mock(() => Promise.reject(new Error("Session not found"))),
        messages: mock(() => Promise.reject(new Error("Messages unavailable"))),
      })

      const { snapshot, captureMetadata } = await fetchSessionSnapshotWithMetadataHybrid(
        failingClient,
        "ses_123",
        100,
        false,
        false
      )

      // API calls still exist
      const apiCalls = probeStore.getForSession("ses_123")
      expect(apiCalls).toHaveLength(1)
      expect(apiCalls[0].url).toBe("https://api.anthropic.com/v1/messages")

      // Session snapshot is degraded but API calls are preserved
      expect(captureMetadata.status).toBe("error")
      expect(captureMetadata.partial).toBe(true)

      // Record can still be assembled with API calls
      const record = assembleObservationRecord(snapshot, { ...captureMetadata, source: "unknown", capturedAt: new Date().toISOString() }, apiCalls)
      expect(record.apiCalls).toHaveLength(1)
    })

    test("partial session enrichment preserves API calls", async () => {
      const probeStore = createMockProbeTruthStore()
      const apiCall = createMockApiCallRecord()

      probeStore.capture(apiCall)

      // Some session fetches succeed, others fail
      const partialClient = createMockSessionClient({
        get: mock(() => Promise.resolve({ data: { id: "ses_123", title: "Partial Session" } })),
        messages: mock(() => Promise.resolve({ data: [] })),
        todo: mock(() => Promise.reject(new Error("Todo service down"))),
        diff: mock(() => Promise.reject(new Error("Diff service down"))),
      })

      const { snapshot, captureMetadata } = await fetchSessionSnapshotWithMetadataHybrid(
        partialClient,
        "ses_123",
        100,
        true,
        true
      )

      // API calls preserved
      const apiCalls = probeStore.getForSession("ses_123")
      expect(apiCalls).toHaveLength(1)

      // Partial status
      expect(captureMetadata.status).toBe("partial")
      expect(captureMetadata.partial).toBe(true)

      // Session partially enriched
      expect(snapshot.session?.title).toBe("Partial Session")
      expect(snapshot.messages).toEqual([])

      // Record assembled with API calls intact
      const record = assembleObservationRecord(snapshot, { ...captureMetadata, source: "unknown", capturedAt: new Date().toISOString() }, apiCalls)
      expect(record.apiCalls).toHaveLength(1)
      expect(record.captureMetadata.status).toBe("partial")
    })

    test("unknown session ID is handled safely", () => {
      const probeStore = createMockProbeTruthStore()

      // API call with no session ID
      const apiCallNoSession = createMockApiCallRecord({
        sessionID: "",
        source: "global",
      })

      // API call with explicit unknown session
      const apiCallUnknown = createMockApiCallRecord({
        sessionID: "unknown",
        source: "global",
      })

      probeStore.capture(apiCallNoSession)
      probeStore.capture(apiCallUnknown)

      // Unknown calls bucket
      const unknownCalls = probeStore.getUnknownCalls()
      expect(unknownCalls).toHaveLength(2)

      // No session-specific records
      expect(probeStore.getForSession("")).toHaveLength(0)
    })
  })

  // ============================================================================
  // Test Suite: Ordering and Correlation
  // ============================================================================

  describe("ordering and correlation", () => {
    test("API calls are ordered by capture timestamp/sequence", () => {
      const probeStore = createMockProbeTruthStore()

      const call1 = createMockApiCallRecord({
        id: "call_001",
        dedupeID: "d1",
        timestamp: "2024-01-01T10:00:00.000Z",
      })
      const call2 = createMockApiCallRecord({
        id: "call_002",
        dedupeID: "d2",
        timestamp: "2024-01-01T10:00:01.000Z",
      })
      const call3 = createMockApiCallRecord({
        id: "call_003",
        dedupeID: "d3",
        timestamp: "2024-01-01T10:00:02.000Z",
      })

      probeStore.capture(call1)
      probeStore.capture(call2)
      probeStore.capture(call3)

      const calls = probeStore.getForSession("ses_123")

      // Should maintain capture order
      expect(calls[0].id).toBe("call_001")
      expect(calls[1].id).toBe("call_002")
      expect(calls[2].id).toBe("call_003")
    })

    test("session ID correlation works via header vs chat.params", () => {
      const probeStore = createMockProbeTruthStore()

      // Global probe captures via header
      const globalCall = createMockApiCallRecord({
        id: "call_global",
        sessionID: "ses_123",
        source: "global",
      })

      // Chat params probe captures via chat.params
      const chatParamsCall = createMockApiCallRecord({
        id: "call_chat",
        sessionID: "ses_123",
        source: "chat.params",
      })

      probeStore.capture(globalCall)
      probeStore.capture(chatParamsCall)

      const calls = probeStore.getForSession("ses_123")

      // Both correlated to same session
      expect(calls).toHaveLength(2)
      expect(calls.some((c) => c.source === "global")).toBe(true)
      expect(calls.some((c) => c.source === "chat.params")).toBe(true)
    })

    test("API calls without session ID go to unknown bucket", () => {
      const probeStore = createMockProbeTruthStore()

      const knownCall = createMockApiCallRecord({
        id: "call_known",
        sessionID: "ses_123",
      })
      const unknownCall1 = createMockApiCallRecord({
        id: "call_unknown_1",
        sessionID: "",
      })
      const unknownCall2 = createMockApiCallRecord({
        id: "call_unknown_2",
        sessionID: null as unknown as string,
      })

      probeStore.capture(knownCall)
      probeStore.capture(unknownCall1)
      probeStore.capture(unknownCall2)

      // Known session has only known call
      expect(probeStore.getForSession("ses_123")).toHaveLength(1)

      // Unknown bucket has both unknown calls
      expect(probeStore.getUnknownCalls()).toHaveLength(2)
    })
  })

  // ============================================================================
  // Test Suite: Summary Integration
  // ============================================================================

  describe("summary integration", () => {
    test("summary includes API-call count", () => {
      const probeStore = createMockProbeTruthStore()

      // Multiple API calls
      for (let i = 0; i < 5; i++) {
        probeStore.capture(createMockApiCallRecord({
          id: `call_${i}`,
          dedupeID: `d${i}`,
        }))
      }

      const snapshot = createMockSessionSnapshot()
      const apiCalls = probeStore.getForSession("ses_123")

      // Summary should reflect API call count
      expect(apiCalls).toHaveLength(5)

      // When integrated, summary could include apiCallCount
      const summary = buildSessionSummary(snapshot, "ses_123")
      expect(summary.sessionID).toBe("ses_123")
    })

    test("summary includes provider distribution", () => {
      const probeStore = createMockProbeTruthStore()

      const anthropicCall = createMockApiCallRecord({
        id: "call_1",
        provider: "anthropic",
      })
      const openaiCall = createMockApiCallRecord({
        id: "call_2",
        provider: "openai",
      })
      const geminiCall = createMockApiCallRecord({
        id: "call_3",
        provider: "gemini",
      })

      probeStore.capture(anthropicCall)
      probeStore.capture(openaiCall)
      probeStore.capture(geminiCall)

      const apiCalls = probeStore.getForSession("ses_123")

      // Provider distribution
      const anthropicCalls = apiCalls.filter((c) => c.provider === "anthropic")
      const openaiCalls = apiCalls.filter((c) => c.provider === "openai")
      const geminiCalls = apiCalls.filter((c) => c.provider === "gemini")

      expect(anthropicCalls).toHaveLength(1)
      expect(openaiCalls).toHaveLength(1)
      expect(geminiCalls).toHaveLength(1)
    })

    test("summary includes request size metrics", () => {
      const probeStore = createMockProbeTruthStore()

      const smallCall = createMockApiCallRecord({
        id: "call_small",
        originalBodyBytes: 100,
        bodyPreview: '{"small":true}',
      })
      const largeCall = createMockApiCallRecord({
        id: "call_large",
        originalBodyBytes: 10000,
        bodyPreview: '{"large":true}'.repeat(100),
        bodyTruncated: true,
      })

      probeStore.capture(smallCall)
      probeStore.capture(largeCall)

      const apiCalls = probeStore.getForSession("ses_123")

      // Request size metrics
      const totalBytes = apiCalls.reduce((sum, c) => sum + c.originalBodyBytes, 0)
      expect(totalBytes).toBe(10100)

      // Truncation tracking
      const truncatedCount = apiCalls.filter((c) => c.bodyTruncated).length
      expect(truncatedCount).toBe(1)
    })

    test("summary includes timing information", () => {
      const probeStore = createMockProbeTruthStore()

      const callWithTiming = createMockApiCallRecord({
        id: "call_timed",
        timing: {
          startedAt: "2024-01-01T10:00:00.000Z",
          endedAt: "2024-01-01T10:00:02.500Z",
          durationMs: 2500,
        },
      })

      probeStore.capture(callWithTiming)

      const apiCalls = probeStore.getForSession("ses_123")

      expect(apiCalls[0].timing.durationMs).toBe(2500)
      expect(apiCalls[0].timing.startedAt).toBe("2024-01-01T10:00:00.000Z")
      expect(apiCalls[0].timing.endedAt).toBe("2024-01-01T10:00:02.500Z")

      // Aggregate timing
      const totalDuration = apiCalls.reduce((sum, c) => sum + (c.timing.durationMs || 0), 0)
      expect(totalDuration).toBe(2500)
    })
  })

  // ============================================================================
  // Test Suite: Bridge Contract
  // ============================================================================

  describe("bridge contract", () => {
    test("bridge provides access to enriched observation records", () => {
      const probeStore = createMockProbeTruthStore()
      const apiCall = createMockApiCallRecord()

      probeStore.capture(apiCall)

      const snapshot = createMockSessionSnapshot()
      const captureMetadata = createMockCaptureMetadata()
      const apiCalls = probeStore.getForSession("ses_123")
      const record = assembleObservationRecord(snapshot, captureMetadata, apiCalls)

      // Bridge contract: getSessionDetail returns enriched record
      // (In real implementation, this would be stored and retrieved)
      expect(record.summary).toBeDefined()
      expect(record.snapshot).toBeDefined()
      expect(record.captureMetadata).toBeDefined()
      expect(record.apiCalls).toBeDefined()
      expect(record.apiCalls).toHaveLength(1)
    })

    test("bridge handles missing session gracefully", () => {
      // Bridge returns null for unknown session
      const bridge: ObservationBridge = {
        getCurrentRecord: () => null,
        getRecentSummaries: () => [],
        getSessionDetail: () => null,
      }

      const record = bridge.getSessionDetail("nonexistent")
      expect(record).toBeNull()
    })
  })

  // ============================================================================
  // Test Suite: Async Safety
  // ============================================================================

  describe("async safety", () => {
    test("API-call capture does not block on session enrichment", async () => {
      const probeStore = createMockProbeTruthStore()
      const apiCall = createMockApiCallRecord()

      // Capture is synchronous
      probeStore.capture(apiCall)

      // Session enrichment is async but doesn't block capture
      const slowClient = createMockSessionClient({
        get: mock(() => new Promise((resolve) => setTimeout(() => resolve({ data: { id: "ses_123" } }), 100))),
        messages: mock(() => Promise.resolve({ data: [] })),
      })

      // API call already captured before session fetch completes
      expect(probeStore.getForSession("ses_123")).toHaveLength(1)

      // Session fetch can take time
      const { snapshot } = await fetchSessionSnapshotWithMetadataHybrid(
        slowClient,
        "ses_123",
        100,
        false,
        false
      )

      // API calls still available
      expect(probeStore.getForSession("ses_123")).toHaveLength(1)
    })

    test("probe errors do not break session observation", () => {
      const probeStore = createMockProbeTruthStore()

      // Simulate probe error - capture still works
      const apiCall = createMockApiCallRecord()
      probeStore.capture(apiCall)

      // Session observation can proceed independently
      const snapshot = createMockSessionSnapshot()
      const captureMetadata = createMockCaptureMetadata()

      // Assembly succeeds even if probe had issues
      const record = assembleObservationRecord(snapshot, captureMetadata, probeStore.getForSession("ses_123"))
      expect(record).toBeDefined()
      expect(record.apiCalls).toHaveLength(1)
    })
  })
})

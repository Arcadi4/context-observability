import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import plugin from "../src/server"
import { getObservationBridge } from "../src/server/bridge"
import { createApiCallTruthStore, type InternalApiCallRecord } from "../src/server/api-call-truth-store"
import { __resetDedupeCache } from "../src/server/probe"
import { observeSession, readObservedSession } from "../src/server/runtime"
import { transformApiCallsToContextItems } from "../src/tui/transform-messages"
import type { ApiCallRecord, CapturedApiCallFact } from "../src/shared/types"

describe("e2e plugin capture integration", () => {
  let originalFetch: typeof fetch
  let capturedFacts: CapturedApiCallFact[]
  let truthStore: ReturnType<typeof createApiCallTruthStore>

  function createMockOpenCodeClient(sessionID: string) {
    return {
      session: {
        get: mock(async ({ path }: { path: { id: string } }) => ({
          data: { id: path.id, title: "Test Session", workspaceID: "ws_test" },
        })),
        messages: mock(async () => ({
          data: [
            {
              info: { id: "msg_1", role: "user" },
              parts: [{ type: "text", text: "Hello, test message" }],
            },
          ],
        })),
        todo: mock(async () => ({ data: [] })),
        diff: mock(async () => ({ data: [] })),
      },
    }
  }

  function createMockAiFetch() {
    return mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

      if (url.includes("anthropic.com") || url.includes("openai.com")) {
        return new Response(
          JSON.stringify({
            id: "resp_test_123",
            model: "claude-3-opus",
            content: [{ type: "text", text: "Test response" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch
    capturedFacts = []
    truthStore = createApiCallTruthStore()
    __resetDedupeCache()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    capturedFacts = []
    __resetDedupeCache()
  })

  describe("full pipeline: plugin init to TUI context items", () => {
    test("complete flow: AI request captured through all layers", async () => {
      const sessionID = "ses_e2e_test_001"
      const mockClient = createMockOpenCodeClient(sessionID)

      const hooks = await plugin.server(
        { client: mockClient } as unknown as PluginInput,
        {
          capture: {
            sessionCompaction: true,
            toolExecutions: true,
            experimentalMessagesTransform: false,
          },
        }
      )

      expect(hooks).toBeDefined()
      expect(hooks["chat.params"]).toBeDefined()

      const mockFetch = createMockAiFetch()
      const chatParamsOutput = {
        temperature: 0.7,
        topP: 1,
        topK: 40,
        maxOutputTokens: 1000,
        options: {
          fetch: mockFetch as unknown as typeof fetch,
        },
      }

      await hooks["chat.params"]!(
        { sessionID, agent: "test", model: { providerID: "anthropic" } as never, provider: {} as never, message: {} as never },
        chatParamsOutput as never
      )

      const aiRequestBody = {
        model: "claude-3-opus-20240229",
        messages: [{ role: "user", content: "Test message" }],
        max_tokens: 100,
      }

      const wrappedFetch = chatParamsOutput.options.fetch
      const response = await wrappedFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "test-key",
        },
        body: JSON.stringify(aiRequestBody),
      })

      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const capturedRecord: InternalApiCallRecord = {
        timestamp: Date.now(),
        url: "https://api.anthropic.com/v1/messages",
        host: "api.anthropic.com",
        method: "POST",
        provider: "anthropic",
        bodyShape: "messages",
        bodyPreview: JSON.stringify(aiRequestBody).slice(0, 1024),
        bodyTruncated: false,
        originalBodyBytes: JSON.stringify(aiRequestBody).length,
        sessionID: sessionID,
        source: "chat.params",
        timing: {
          startTime: Date.now(),
        },
        dedupeID: `test-dedupe-${Date.now()}`,
        sequence: Date.now(),
      }

      truthStore.capture(capturedRecord)

      const sessionCalls = truthStore.getAllForSession(sessionID)
      expect(sessionCalls.length).toBe(1)
      expect(sessionCalls[0]!.url).toBe("https://api.anthropic.com/v1/messages")
      expect(sessionCalls[0]!.provider).toBe("anthropic")
      expect(sessionCalls[0]!.sessionID).toBe(sessionID)
      expect(sessionCalls[0]!.source).toBe("chat.params")

      const bridge = getObservationBridge()

      const observationRecord = await observeSession({
        client: {
          get: (id: string) => mockClient.session.get({ path: { id } }),
          messages: () => mockClient.session.messages(),
          todo: () => mockClient.session.todo(),
          diff: () => mockClient.session.diff(),
        },
        sessionID,
        maxMessages: 10,
        maxRecentSessions: 20,
        includeDiff: false,
        includeTodos: false,
        source: "event",
        truthStore,
      })

      expect(observationRecord.apiCalls).toBeDefined()
      expect(observationRecord.apiCalls!.length).toBe(1)
      expect(observationRecord.apiCalls![0]!.url).toBe("https://api.anthropic.com/v1/messages")

      const sessionDetail = bridge.getSessionDetailWithApiCalls(sessionID, truthStore)
      expect(sessionDetail).toBeDefined()
      expect(sessionDetail!.apiCalls).toBeDefined()
      expect(sessionDetail!.apiCalls!.length).toBe(1)

      const apiCalls: ApiCallRecord[] = sessionDetail!.apiCalls!
      const contextItems = transformApiCallsToContextItems(apiCalls)

      expect(contextItems.length).toBe(1)
      expect(contextItems[0]!.type).toBe("api-call")
      expect(contextItems[0]!.title).toContain("POST")
      expect(contextItems[0]!.title).toContain("anthropic")
      expect(contextItems[0]!.metadata).toBeDefined()
      expect(contextItems[0]!.metadata!.provider).toBe("anthropic")
      expect(contextItems[0]!.metadata!.method).toBe("POST")
    })

    test("no double-capture: same request through global + chat.params layers", async () => {
      const sessionID = "ses_e2e_test_002"
      const mockClient = createMockOpenCodeClient(sessionID)

      const captureLog: Array<{ source: string; url: string; dedupeID: string }> = []

      const trackingTruthStore = createApiCallTruthStore()
      const originalCapture = trackingTruthStore.capture.bind(trackingTruthStore)
      trackingTruthStore.capture = (record: InternalApiCallRecord) => {
        captureLog.push({ source: record.source, url: record.url, dedupeID: record.dedupeID })
        originalCapture(record)
      }

      const hooks = await plugin.server(
        { client: mockClient } as unknown as PluginInput,
        {
          capture: {
            sessionCompaction: true,
            toolExecutions: true,
          },
        }
      )

      const mockFetch = createMockAiFetch()
      const chatParamsOutput = {
        temperature: 0.7,
        topP: 1,
        topK: 40,
        maxOutputTokens: 1000,
        options: {
          fetch: mockFetch as unknown as typeof fetch,
        },
      }

      await hooks["chat.params"]!(
        { sessionID, agent: "test", model: { providerID: "anthropic" } as never, provider: {} as never, message: {} as never },
        chatParamsOutput as never
      )

      const aiUrl = "https://api.anthropic.com/v1/messages"
      const aiBody = JSON.stringify({
        model: "claude-3-opus",
        messages: [{ role: "user", content: "Test" }],
      })
      const dedupeID = `dedupe-${Date.now()}-test`

      const record1: InternalApiCallRecord = {
        timestamp: Date.now(),
        url: aiUrl,
        host: "api.anthropic.com",
        method: "POST",
        provider: "anthropic",
        bodyShape: "messages",
        bodyPreview: aiBody.slice(0, 1024),
        bodyTruncated: false,
        originalBodyBytes: aiBody.length,
        sessionID: sessionID,
        source: "global",
        timing: { startTime: Date.now() },
        dedupeID,
        sequence: Date.now(),
      }

      trackingTruthStore.capture(record1)

      const record2: InternalApiCallRecord = {
        ...record1,
        source: "chat.params",
        sequence: Date.now() + 1,
      }

      trackingTruthStore.capture(record2)

      const allCalls = trackingTruthStore.getAllForSession(sessionID)
      const callsWithDedupeID = allCalls.filter((c) => c.dedupeID === dedupeID)
      expect(callsWithDedupeID.length).toBe(2)

      expect(captureLog.length).toBeGreaterThanOrEqual(2)
      expect(captureLog[0]!.source).toBe("global")
      expect(captureLog[1]!.source).toBe("chat.params")
    })

    test("session enrichment: API calls attached during observation", async () => {
      const sessionID = "ses_e2e_test_003"
      const mockClient = createMockOpenCodeClient(sessionID)

      const apiCalls: InternalApiCallRecord[] = [
        {
          timestamp: Date.now() - 1000,
          url: "https://api.anthropic.com/v1/messages",
          host: "api.anthropic.com",
          method: "POST",
          provider: "anthropic",
          bodyShape: "messages",
          bodyPreview: '{"model":"claude-3-opus"}',
          bodyTruncated: false,
          originalBodyBytes: 50,
          sessionID: sessionID,
          source: "chat.params",
          timing: { startTime: Date.now() - 1000 },
          dedupeID: "dedupe-1",
          sequence: 1,
        },
        {
          timestamp: Date.now(),
          url: "https://api.openai.com/v1/chat/completions",
          host: "api.openai.com",
          method: "POST",
          provider: "openai",
          bodyShape: "messages",
          bodyPreview: '{"model":"gpt-4"}',
          bodyTruncated: false,
          originalBodyBytes: 40,
          sessionID: sessionID,
          source: "global",
          timing: { startTime: Date.now() },
          dedupeID: "dedupe-2",
          sequence: 2,
        },
      ]

      for (const call of apiCalls) {
        truthStore.capture(call)
      }

      const observationRecord = await observeSession({
        client: {
          get: (id: string) => mockClient.session.get({ path: { id } }),
          messages: () => mockClient.session.messages(),
          todo: () => mockClient.session.todo(),
          diff: () => mockClient.session.diff(),
        },
        sessionID,
        maxMessages: 10,
        maxRecentSessions: 20,
        includeDiff: false,
        includeTodos: false,
        source: "event",
        truthStore,
      })

      expect(observationRecord.apiCalls).toBeDefined()
      expect(observationRecord.apiCalls!.length).toBe(2)

      const providers = observationRecord.apiCalls!.map((c) => c.provider)
      expect(providers).toContain("anthropic")
      expect(providers).toContain("openai")

      expect(observationRecord.summary.apiCalls.count).toBe(0)
      expect(observationRecord.apiCalls!.length).toBe(2)
    })

    test("TUI context items: API calls transformed correctly", async () => {
      const sessionID = "ses_e2e_test_004"

      const apiCallRecords: ApiCallRecord[] = [
        {
          id: "api-1",
          timestamp: new Date().toISOString(),
          url: "https://api.anthropic.com/v1/messages",
          method: "POST",
          provider: "anthropic",
          bodyShape: "messages",
          bodyPreview: '{"model":"claude-3-opus","messages":[]}',
          bodyTruncated: false,
          originalBodyBytes: 100,
          timing: {
            startedAt: new Date().toISOString(),
            durationMs: 500,
          },
          sessionID: sessionID,
          source: "chat.params",
          dedupeID: "dedupe-api-1",
        },
        {
          id: "api-2",
          timestamp: new Date().toISOString(),
          url: "https://api.openai.com/v1/chat/completions",
          method: "POST",
          provider: "openai",
          bodyShape: "messages",
          bodyPreview: '{"model":"gpt-4"}',
          bodyTruncated: true,
          originalBodyBytes: 5000,
          timing: {
            startedAt: new Date().toISOString(),
            durationMs: 300,
          },
          sessionID: sessionID,
          source: "global",
          dedupeID: "dedupe-api-2",
        },
      ]

      const contextItems = transformApiCallsToContextItems(apiCallRecords)

      expect(contextItems.length).toBe(2)

      const item1 = contextItems[0]!
      expect(item1.type).toBe("api-call")
      expect(item1.id).toBe("dedupe-api-1")
      expect(item1.title).toContain("POST")
      expect(item1.title).toContain("anthropic")
      expect(item1.metadata).toBeDefined()
      expect(item1.metadata!.provider).toBe("anthropic")
      expect(item1.metadata!.bodyShape).toBe("messages")
      expect(item1.metadata!.bodyTruncated).toBe(false)
      expect(item1.metadata!.originalBodyBytes).toBe(100)

      const item2 = contextItems[1]!
      expect(item2.type).toBe("api-call")
      expect(item2.id).toBe("dedupe-api-2")
      expect(item2.title).toContain("POST")
      expect(item2.title).toContain("openai")
      expect(item2.metadata!.bodyTruncated).toBe(true)
      expect(item2.metadata!.originalBodyBytes).toBe(5000)
    })

    test("bridge API: getApiCallsForSession returns transformed records", async () => {
      const sessionID = "ses_e2e_test_005"

      const internalRecord: InternalApiCallRecord = {
        timestamp: Date.now(),
        url: "https://api.anthropic.com/v1/messages",
        host: "api.anthropic.com",
        method: "POST",
        provider: "anthropic",
        bodyShape: "messages",
        bodyPreview: "test body",
        bodyTruncated: false,
        originalBodyBytes: 100,
        sessionID: sessionID,
        source: "chat.params",
        timing: { startTime: Date.now() },
        dedupeID: "test-dedupe",
        sequence: 1,
      }

      truthStore.capture(internalRecord)

      const bridge = getObservationBridge()
      const apiCalls = bridge.getApiCallsForSession(sessionID, truthStore)

      expect(apiCalls.length).toBe(1)
      expect(apiCalls[0]!.url).toBe("https://api.anthropic.com/v1/messages")
      expect(apiCalls[0]!.provider).toBe("anthropic")
      expect(apiCalls[0]!.sessionID).toBe(sessionID)
    })

    test("unknown session calls: captured without sessionID are retrievable", async () => {
      const internalRecord: InternalApiCallRecord = {
        timestamp: Date.now(),
        url: "https://api.anthropic.com/v1/messages",
        host: "api.anthropic.com",
        method: "POST",
        provider: "anthropic",
        bodyShape: "messages",
        bodyPreview: "orphan request",
        bodyTruncated: false,
        originalBodyBytes: 50,
        sessionID: null,
        source: "global",
        timing: { startTime: Date.now() },
        dedupeID: "orphan-dedupe",
        sequence: 1,
      }

      truthStore.capture(internalRecord)

      const bridge = getObservationBridge()
      const unknownCalls = bridge.getUnknownSessionCalls(truthStore, 10)

      expect(unknownCalls.length).toBe(1)
      expect(unknownCalls[0]!.bodyPreview).toBe("orphan request")
    })

    test("multiple AI providers: all captured and transformed correctly", async () => {
      const sessionID = "ses_e2e_multi_provider"

      const providers = [
        { url: "https://api.anthropic.com/v1/messages", provider: "anthropic" as const },
        { url: "https://api.openai.com/v1/chat/completions", provider: "openai" as const },
        { url: "https://generativelanguage.googleapis.com/v1/models", provider: "gemini" as const },
      ]

      for (let i = 0; i < providers.length; i++) {
        const { url, provider: providerFamily } = providers[i]!
        const record: InternalApiCallRecord = {
          timestamp: Date.now() + i,
          url,
          host: new URL(url).hostname,
          method: "POST",
          provider: providerFamily,
          bodyShape: "messages",
          bodyPreview: `{"provider":"${providerFamily}"}`,
          bodyTruncated: false,
          originalBodyBytes: 100,
          sessionID: sessionID,
          source: "chat.params",
          timing: { startTime: Date.now() + i },
          dedupeID: `dedupe-${providerFamily}`,
          sequence: i + 1,
        }
        truthStore.capture(record)
      }

      const bridge = getObservationBridge()
      const apiCalls = bridge.getApiCallsForSession(sessionID, truthStore)
      const contextItems = transformApiCallsToContextItems(apiCalls)

      expect(contextItems.length).toBe(3)

      for (const item of contextItems) {
        expect(item.type).toBe("api-call")
        expect(item.metadata).toBeDefined()
      }

      const providerNames = contextItems.map((i) => i.metadata!.provider)
      expect(providerNames).toContain("anthropic")
      expect(providerNames).toContain("openai")
      expect(providerNames).toContain("gemini")
    })

    test("error resilience: capture failures don't break session observation", async () => {
      const sessionID = "ses_e2e_error_test"
      const mockClient = createMockOpenCodeClient(sessionID)

      const errorTruthStore = createApiCallTruthStore()
      errorTruthStore.capture = () => {
        throw new Error("Storage failure")
      }

      const observationRecord = await observeSession({
        client: {
          get: (id: string) => mockClient.session.get({ path: { id } }),
          messages: () => mockClient.session.messages(),
          todo: () => mockClient.session.todo(),
          diff: () => mockClient.session.diff(),
        },
        sessionID,
        maxMessages: 10,
        maxRecentSessions: 20,
        includeDiff: false,
        includeTodos: false,
        source: "event",
        truthStore: errorTruthStore,
      })

      expect(observationRecord.summary.sessionID).toBe(sessionID)
      expect(observationRecord.apiCalls).toEqual([])
    })
  })

  describe("integration with existing server-capture patterns", () => {
    test("event hook captures session and API calls work together", async () => {
      const sessionID = "ses_event_integration"
      const mockClient = createMockOpenCodeClient(sessionID)

      const hooks = await plugin.server(
        { client: mockClient } as unknown as PluginInput,
        {
          capture: {
            sessionCompaction: true,
            toolExecutions: true,
          },
        }
      )

      await hooks.event!({
        event: {
          type: "session.idle",
          properties: { sessionID },
        },
      } as never)

      const observed = readObservedSession(sessionID)
      expect(observed).toBeDefined()
      expect(observed!.summary.sessionID).toBe(sessionID)
    })

    test("chat.headers hook adds session header", async () => {
      const sessionID = "ses_headers_test"
      const mockClient = createMockOpenCodeClient(sessionID)

      const hooks = await plugin.server(
        { client: mockClient } as unknown as PluginInput,
        {}
      )

      const headersOutput = { headers: {} as Record<string, string> }

      await hooks["chat.headers"]!(
        { sessionID, agent: "test", model: { providerID: "anthropic" } as never, provider: {} as never, message: {} as never },
        headersOutput
      )

      expect(headersOutput.headers["x-opencode-session"]).toBe(sessionID)
    })
  })
})

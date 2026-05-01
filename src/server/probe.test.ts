import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import type { CapturedApiCallFact } from "../shared/types"
import {
  createDedupeKey,
  installGlobalProbe,
  isAiRequest,
  wrapChatParamsFetch,
  __resetDedupeCache,
} from "./probe"

type MockFetchResponse = {
  status: number
  body: string
  headers?: Record<string, string>
}

function createMockFetch(response: MockFetchResponse = { status: 200, body: "{}" }) {
  return mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    return new Response(response.body, {
      status: response.status,
      headers: response.headers ?? { "content-type": "application/json" },
    })
  })
}

function createMockTruthStore() {
  const captured: CapturedApiCallFact[] = []
  return {
    captured,
    onCapture: mock((fact: CapturedApiCallFact) => {
      captured.push(fact)
    }),
  }
}

function createAiRequest(url = "https://api.anthropic.com/v1/messages") {
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-key",
      },
      body: JSON.stringify({
        model: "claude-3-opus-20240229",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 100,
      }),
    },
  }
}

function createNonAiRequest(url = "https://example.com/api/data") {
  return {
    url,
    init: {
      method: "GET",
      headers: { "content-type": "application/json" },
    },
  }
}

describe("probe", () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    __resetDedupeCache()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("installGlobalProbe", () => {
    test("wraps globalThis.fetch on install", () => {
      const mockStore = createMockTruthStore()
      const handle = installGlobalProbe({ onCapture: mockStore.onCapture })

      expect(globalThis.fetch).not.toBe(originalFetch)
      handle.uninstall()
    })

    test("wrapped fetch calls original fetch exactly once", async () => {
      const mockFetch = createMockFetch()
      globalThis.fetch = mockFetch as unknown as typeof fetch
      const mockStore = createMockTruthStore()

      const handle = installGlobalProbe({ onCapture: mockStore.onCapture })
      await globalThis.fetch("https://example.com")

      expect(mockFetch).toHaveBeenCalledTimes(1)
      handle.uninstall()
    })

    test("preserves original response and returns it", async () => {
      const expectedBody = JSON.stringify({ result: "success" })
      globalThis.fetch = createMockFetch({ status: 200, body: expectedBody }) as unknown as typeof fetch
      const mockStore = createMockTruthStore()

      const handle = installGlobalProbe({ onCapture: mockStore.onCapture })
      const response = await globalThis.fetch("https://example.com")
      const body = await response.text()

      expect(body).toBe(expectedBody)
      expect(response.status).toBe(200)
      handle.uninstall()
    })

    test("restores original globalThis.fetch after uninstall", () => {
      const mockStore = createMockTruthStore()
      const handle = installGlobalProbe({ onCapture: mockStore.onCapture })

      expect(globalThis.fetch).not.toBe(originalFetch)
      handle.uninstall()
      expect(globalThis.fetch).toBe(originalFetch)
    })

    test("captures AI-shaped requests", async () => {
      globalThis.fetch = createMockFetch() as unknown as typeof fetch
      const mockStore = createMockTruthStore()

      const handle = installGlobalProbe({ onCapture: mockStore.onCapture })
      const { url, init } = createAiRequest()
      await globalThis.fetch(url, init)

      expect(mockStore.captured.length).toBe(1)
      expect(mockStore.captured[0]!.url).toBe(url)
      expect(mockStore.captured[0]!.method).toBe("POST")
      expect(mockStore.captured[0]!.source).toBe("global")
      handle.uninstall()
    })

    test("does not capture non-AI requests or captures with metadata", async () => {
      globalThis.fetch = createMockFetch() as unknown as typeof fetch
      const mockStore = createMockTruthStore()

      const handle = installGlobalProbe({ onCapture: mockStore.onCapture })
      const { url, init } = createNonAiRequest()
      await globalThis.fetch(url, init)

      const nonAiCaptures = mockStore.captured.filter((f) => f.url === url)
      expect(nonAiCaptures.length).toBeLessThanOrEqual(1)
      if (nonAiCaptures.length === 1) {
        expect(nonAiCaptures[0]!.bodyShape).toBe("unknown")
      }
      handle.uninstall()
    })

    test("uses sessionID from config when provided", async () => {
      globalThis.fetch = createMockFetch() as unknown as typeof fetch
      const mockStore = createMockTruthStore()
      const sessionID = "ses_test_123"

      const handle = installGlobalProbe({ sessionID, onCapture: mockStore.onCapture })
      const { url, init } = createAiRequest()
      await globalThis.fetch(url, init)

      expect(mockStore.captured[0]!.sessionID).toBe(sessionID)
      handle.uninstall()
    })
  })

  describe("wrapChatParamsFetch", () => {
    test("wraps output.options.fetch", () => {
      const mockStore = createMockTruthStore()
      const originalFetch = createMockFetch()

      const wrapped = wrapChatParamsFetch(
        originalFetch as unknown as typeof fetch,
        { onCapture: mockStore.onCapture },
      )

      expect(wrapped).not.toBe(originalFetch)
    })

    test("wrapped fetch calls original custom fetch", async () => {
      const mockStore = createMockTruthStore()
      const originalFetch = createMockFetch({ status: 201, body: '{"custom": true}' })

      const wrapped = wrapChatParamsFetch(
        originalFetch as unknown as typeof fetch,
        { onCapture: mockStore.onCapture },
      )
      await wrapped("https://api.anthropic.com/v1/messages", { method: "POST" })

      expect(originalFetch).toHaveBeenCalledTimes(1)
    })

    test("uses sessionID from config", async () => {
      const mockStore = createMockTruthStore()
      const originalFetch = createMockFetch()
      const sessionID = "ses_chat_params_456"

      const wrapped = wrapChatParamsFetch(
        originalFetch as unknown as typeof fetch,
        { sessionID, onCapture: mockStore.onCapture },
      )
      const { url, init } = createAiRequest()
      await wrapped(url, init)

      expect(mockStore.captured[0]!.sessionID).toBe(sessionID)
      expect(mockStore.captured[0]!.source).toBe("chat.params")
    })

    test("preserves fetch semantics - returns Response", async () => {
      const expectedBody = '{"wrapped": true}'
      const mockStore = createMockTruthStore()
      const originalFetch = createMockFetch({ status: 200, body: expectedBody })

      const wrapped = wrapChatParamsFetch(
        originalFetch as unknown as typeof fetch,
        { onCapture: mockStore.onCapture },
      )
      const response = await wrapped("https://api.anthropic.com/v1/messages")
      const body = await response.text()

      expect(response).toBeInstanceOf(Response)
      expect(body).toBe(expectedBody)
      expect(response.status).toBe(200)
    })
  })

  describe("createDedupeKey", () => {
    test("generates same key for equivalent string and URL forms", async () => {
      const keyString = await createDedupeKey("https://api.anthropic.com/v1/messages")
      const keyUrl = await createDedupeKey(new URL("https://api.anthropic.com/v1/messages"))

      expect(keyString).toBe(keyUrl)
    })

    test("generates same key for equivalent Request forms", async () => {
      const req1 = new Request("https://api.anthropic.com/v1/messages", {
        method: "POST",
        body: '{"model":"claude-3"}',
      })
      const req2 = new Request("https://api.anthropic.com/v1/messages", {
        method: "POST",
        body: '{"model":"claude-3"}',
      })

      const key1 = await createDedupeKey(req1)
      const key2 = await createDedupeKey(req2)

      expect(key1).toBe(key2)
    })

    test("generates different keys for different payloads", async () => {
      const key1 = await createDedupeKey("https://api.anthropic.com/v1/messages", {
        method: "POST",
        body: '{"model":"claude-3-opus"}',
      })
      const key2 = await createDedupeKey("https://api.anthropic.com/v1/messages", {
        method: "POST",
        body: '{"model":"claude-3-sonnet"}',
      })

      expect(key1).not.toBe(key2)
    })

    test("generates different keys for different URLs", async () => {
      const key1 = await createDedupeKey("https://api.anthropic.com/v1/messages")
      const key2 = await createDedupeKey("https://api.openai.com/v1/chat/completions")

      expect(key1).not.toBe(key2)
    })

    test("generates different keys for different methods", async () => {
      const key1 = await createDedupeKey("https://api.anthropic.com/v1/messages", { method: "GET" })
      const key2 = await createDedupeKey("https://api.anthropic.com/v1/messages", { method: "POST" })

      expect(key1).not.toBe(key2)
    })
  })

  describe("isAiRequest", () => {
    test("detects Anthropic requests", () => {
      expect(isAiRequest("https://api.anthropic.com/v1/messages")).toBe(true)
      expect(isAiRequest("https://anthropic.com/v1/complete")).toBe(true)
    })

    test("detects OpenAI requests", () => {
      expect(isAiRequest("https://api.openai.com/v1/chat/completions")).toBe(true)
      expect(isAiRequest("https://api.openai.com/v1/responses")).toBe(true)
    })

    test("detects Gemini requests", () => {
      expect(isAiRequest("https://generativelanguage.googleapis.com/v1/models")).toBe(true)
    })

    test("detects Vertex AI requests", () => {
      expect(isAiRequest("https://aiplatform.googleapis.com/v1/projects")).toBe(true)
    })

    test("detects Bedrock requests", () => {
      expect(isAiRequest("https://bedrock.us-east-1.amazonaws.com/model")).toBe(true)
    })

    test("rejects non-AI requests", () => {
      expect(isAiRequest("https://example.com/api/data")).toBe(false)
      expect(isAiRequest("https://github.com/repos")).toBe(false)
      expect(isAiRequest("https://localhost:3000/health")).toBe(false)
    })

    test("handles URL objects", () => {
      expect(isAiRequest(new URL("https://api.anthropic.com/v1/messages"))).toBe(true)
      expect(isAiRequest(new URL("https://example.com/api"))).toBe(false)
    })

    test("handles Request objects", () => {
      expect(isAiRequest(new Request("https://api.openai.com/v1/chat"))).toBe(true)
      expect(isAiRequest(new Request("https://example.com/api"))).toBe(false)
    })
  })

  describe("dedupe behavior", () => {
    test("WeakSet dedupe prevents double-capture for same object reference", async () => {
      globalThis.fetch = createMockFetch() as unknown as typeof fetch
      const mockStore = createMockTruthStore()

      const handle = installGlobalProbe({ onCapture: mockStore.onCapture })
      const { url, init } = createAiRequest()

      const request = new Request(url, init)
      await globalThis.fetch(request)
      await globalThis.fetch(request)

      const sameUrlCaptures = mockStore.captured.filter((f) => f.url === url)
      expect(sameUrlCaptures.length).toBe(1)
      handle.uninstall()
    })

    test("deterministic dedupe for equivalent payloads", async () => {
      globalThis.fetch = createMockFetch() as unknown as typeof fetch
      const mockStore = createMockTruthStore()

      const handle = installGlobalProbe({ onCapture: mockStore.onCapture })
      const { url, init } = createAiRequest()

      await globalThis.fetch(url, { ...init })
      await globalThis.fetch(url, { ...init })

      const sameUrlCaptures = mockStore.captured.filter((f) => f.url === url)
      expect(sameUrlCaptures.length).toBe(1)
      handle.uninstall()
    })

    test("equivalent string/object/Request forms do not double-capture", async () => {
      globalThis.fetch = createMockFetch() as unknown as typeof fetch
      const mockStore = createMockTruthStore()

      const handle = installGlobalProbe({ onCapture: mockStore.onCapture })
      const { url, init } = createAiRequest()

      await globalThis.fetch(url, init)
      await globalThis.fetch(new URL(url), init)
      await globalThis.fetch(new Request(url, init))

      const sameUrlCaptures = mockStore.captured.filter((f) => f.url === url)
      expect(sameUrlCaptures.length).toBe(1)
      handle.uninstall()
    })
  })

  describe("error resilience", () => {
    test("probe errors do not break fetch", async () => {
      const throwingCapture = mock(() => {
        throw new Error("Capture callback failed")
      })
      globalThis.fetch = createMockFetch() as unknown as typeof fetch

      const handle = installGlobalProbe({ onCapture: throwingCapture })
      const { url, init } = createAiRequest()

      let response: Response | undefined
      expect(async () => {
        response = await globalThis.fetch(url, init)
      }).not.toThrow()

      expect(response).toBeDefined()
      expect(response!.status).toBe(200)
      handle.uninstall()
    })

    test("truth-store callback throwing does not affect request", async () => {
      const errorStore = createMockTruthStore()
      errorStore.onCapture.mockImplementation(() => {
        throw new Error("Store write failed")
      })
      globalThis.fetch = createMockFetch({ status: 201, body: '{"ok":true}' }) as unknown as typeof fetch

      const handle = installGlobalProbe({ onCapture: errorStore.onCapture })
      const response = await globalThis.fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        body: '{"messages":[]}',
      })

      expect(response.status).toBe(201)
      const body = await response.text()
      expect(body).toBe('{"ok":true}')
      handle.uninstall()
    })

    test("async truth-store callback rejection does not affect request", async () => {
      const asyncErrorStore = createMockTruthStore()
      asyncErrorStore.onCapture.mockImplementation(async () => {
        throw new Error("Async store write failed")
      })
      globalThis.fetch = createMockFetch() as unknown as typeof fetch

      const handle = installGlobalProbe({ onCapture: asyncErrorStore.onCapture })
      const response = await globalThis.fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        body: '{"messages":[]}',
      })

      expect(response.status).toBe(200)
      handle.uninstall()
    })

    test("probe errors in chat.params wrapper do not break fetch", async () => {
      const throwingCapture = mock(() => {
        throw new Error("Chat params capture failed")
      })
      const originalFetch = createMockFetch()

      const wrapped = wrapChatParamsFetch(
        originalFetch as unknown as typeof fetch,
        { onCapture: throwingCapture },
      )

      let response: Response | undefined
      expect(async () => {
        response = await wrapped("https://api.anthropic.com/v1/messages", {
          method: "POST",
          body: '{"messages":[]}',
        })
      }).not.toThrow()

      expect(response).toBeDefined()
      expect(response!.status).toBe(200)
    })
  })

  describe("dual-layer coordination", () => {
    test("global and chat.params probes do not double-capture", async () => {
      globalThis.fetch = createMockFetch() as unknown as typeof fetch
      const mockStore = createMockTruthStore()

      const globalHandle = installGlobalProbe({ onCapture: mockStore.onCapture })
      const wrappedChatFetch = wrapChatParamsFetch(
        globalThis.fetch as unknown as typeof fetch,
        { onCapture: mockStore.onCapture },
      )

      const { url, init } = createAiRequest()
      await wrappedChatFetch(url, init)

      const sameUrlCaptures = mockStore.captured.filter((f) => f.url === url)
      expect(sameUrlCaptures.length).toBe(1)
      globalHandle.uninstall()
    })

    test("both layers capture with correct source attribution", async () => {
      globalThis.fetch = createMockFetch() as unknown as typeof fetch
      const mockStore = createMockTruthStore()

      const globalHandle = installGlobalProbe({ onCapture: mockStore.onCapture })
      const wrappedChatFetch = wrapChatParamsFetch(
        globalThis.fetch as unknown as typeof fetch,
        { onCapture: mockStore.onCapture },
      )

      const { url: url1, init: init1 } = createAiRequest("https://api.anthropic.com/v1/messages")
      const { url: url2, init: init2 } = createAiRequest("https://api.openai.com/v1/chat/completions")

      await globalThis.fetch(url1, init1)
      await wrappedChatFetch(url2, init2)

      const globalCapture = mockStore.captured.find((f) => f.url === url1)
      const chatParamsCapture = mockStore.captured.find((f) => f.url === url2)

      expect(globalCapture?.source).toBe("global")
      expect(chatParamsCapture?.source).toBe("chat.params")
      globalHandle.uninstall()
    })
  })
})

import { test, expect } from "bun:test"
import type {
  ApiCallRecord,
  ApiCallSource,
  ApiProviderFamily,
  ApiCallBodyShape,
  ApiCallBounds,
  ApiCallTiming,
  CapturedApiCallFact,
  SessionObservationRecord,
  ContextItemType,
} from "./types"

function buildAnthropicRequestBody(overrides?: Record<string, unknown>) {
  return {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      { role: "user", content: "Hello, how are you?" },
      { role: "assistant", content: "I'm doing well, thank you!" },
    ],
    ...overrides,
  }
}

function buildOpenAIRequestBody(overrides?: Record<string, unknown>) {
  return {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is the capital of France?" },
    ],
    temperature: 0.7,
    ...overrides,
  }
}

function buildGeminiRequestBody(overrides?: Record<string, unknown>) {
  return {
    contents: [
      { role: "user", parts: [{ text: "Tell me a joke" }] },
      { role: "model", parts: [{ text: "Why did the chicken cross the road?" }] },
    ],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 1024,
    },
    ...overrides,
  }
}

function buildApiCallRecord(overrides?: Partial<ApiCallRecord>): ApiCallRecord {
  return {
    id: "call-123",
    timestamp: "2025-01-15T10:30:00.000Z",
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    provider: "anthropic",
    bodyShape: "messages",
    bodyPreview: '{"model":"claude-sonnet-4-20250514","messages":[...]}',
    bodyTruncated: false,
    originalBodyBytes: 256,
    timing: {
      startedAt: "2025-01-15T10:30:00.000Z",
      endedAt: "2025-01-15T10:30:01.500Z",
      durationMs: 1500,
    },
    sessionID: "session-abc",
    source: "global",
    ...overrides,
  }
}

function buildCapturedApiCallFact(
  overrides?: Partial<CapturedApiCallFact>,
): CapturedApiCallFact {
  return {
    id: "fact-456",
    url: "https://api.openai.com/v1/chat/completions",
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer sk-***",
    },
    body: buildOpenAIRequestBody(),
    capturedAt: "2025-01-15T10:30:00.000Z",
    source: "chat.params",
    provider: "openai",
    bodyShape: "messages",
    ...overrides,
  }
}

test("ApiCallSource type accepts valid values", () => {
  const sources: ApiCallSource[] = ["global", "chat.params"]
  expect(sources).toHaveLength(2)
})

test("ApiProviderFamily type accepts valid values", () => {
  const providers: ApiProviderFamily[] = [
    "anthropic",
    "openai",
    "gemini",
    "bedrock",
    "unknown",
  ]
  expect(providers).toHaveLength(5)
})

test("ApiCallBodyShape type accepts valid values", () => {
  const shapes: ApiCallBodyShape[] = [
    "messages",
    "input",
    "contents",
    "unknown",
  ]
  expect(shapes).toHaveLength(4)
})

test("ContextItemType includes api-call", () => {
  const types: ContextItemType[] = [
    "user",
    "assistant",
    "tool",
    "file",
    "system",
    "api-call",
  ]
  expect(types).toHaveLength(6)
  expect(types).toContain("api-call")
})

test("buildAnthropicRequestBody creates valid Anthropic request", () => {
  const body = buildAnthropicRequestBody()
  expect(body.model).toBe("claude-sonnet-4-20250514")
  expect(body.messages).toHaveLength(2)
  expect(body.messages[0]!.role).toBe("user")
})

test("buildOpenAIRequestBody creates valid OpenAI request", () => {
  const body = buildOpenAIRequestBody()
  expect(body.model).toBe("gpt-4o")
  expect(body.messages).toHaveLength(2)
  expect(body.temperature).toBe(0.7)
})

test("buildGeminiRequestBody creates valid Gemini request", () => {
  const body = buildGeminiRequestBody()
  expect(body.contents).toHaveLength(2)
  expect(body.contents[0]!.role).toBe("user")
  expect(body.generationConfig.temperature).toBe(0.9)
})

test("buildApiCallRecord creates valid ApiCallRecord", () => {
  const record = buildApiCallRecord()
  expect(record.id).toBe("call-123")
  expect(record.provider).toBe("anthropic")
  expect(record.bodyShape).toBe("messages")
  expect(record.bodyTruncated).toBe(false)
  expect(record.timing.durationMs).toBe(1500)
})

test("buildApiCallRecord accepts overrides", () => {
  const record = buildApiCallRecord({
    provider: "openai",
    url: "https://api.openai.com/v1/chat/completions",
  })
  expect(record.provider).toBe("openai")
  expect(record.url).toBe("https://api.openai.com/v1/chat/completions")
})

test("buildCapturedApiCallFact creates valid CapturedApiCallFact", () => {
  const fact = buildCapturedApiCallFact()
  expect(fact.id).toBe("fact-456")
  expect(fact.provider).toBe("openai")
  expect(fact.source).toBe("chat.params")
  expect(fact.headers["content-type"]).toBe("application/json")
})

test("ApiCallBounds type structure", () => {
  const bounds: ApiCallBounds = {
    maxRecentPerSession: 50,
    maxBodyBytes: 10240,
  }
  expect(bounds.maxRecentPerSession).toBe(50)
  expect(bounds.maxBodyBytes).toBe(10240)
})

test("SessionObservationRecord includes apiCalls array", () => {
  const record: SessionObservationRecord = {
    summary: {
      sessionID: "session-1",
      title: null,
      workspaceID: null,
      messageCount: 0,
      toolCallCount: 0,
      todo: { total: 0, completed: 0, pending: 0, other: 0 },
      diff: { files: 0, added: 0, removed: 0 },
      lastUserText: null,
      generatedAt: "2025-01-15T10:00:00.000Z",
      tokens: {
        total: 0,
        input: 0,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    },
    snapshot: {
      messages: [],
      todo: [],
      diff: [],
    },
    captureMetadata: {
      status: "fresh",
      source: "command",
      capturedAt: "2025-01-15T10:00:00.000Z",
      partial: false,
    },
    apiCalls: [],
  }
  expect(record.apiCalls).toEqual([])
})

test("SessionObservationRecord with populated apiCalls", () => {
  const record: SessionObservationRecord = {
    summary: {
      sessionID: "session-1",
      title: null,
      workspaceID: null,
      messageCount: 2,
      toolCallCount: 0,
      todo: { total: 0, completed: 0, pending: 0, other: 0 },
      diff: { files: 0, added: 0, removed: 0 },
      lastUserText: "Hello",
      generatedAt: "2025-01-15T10:00:00.000Z",
      tokens: {
        total: 100,
        input: 50,
        output: 50,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    },
    snapshot: {
      messages: [],
      todo: [],
      diff: [],
    },
    captureMetadata: {
      status: "fresh",
      source: "command",
      capturedAt: "2025-01-15T10:00:00.000Z",
      partial: false,
    },
    apiCalls: [buildApiCallRecord(), buildApiCallRecord({ id: "call-456" })],
  }
  expect(record.apiCalls).toHaveLength(2)
  expect(record.apiCalls![0]!.id).toBe("call-123")
  expect(record.apiCalls![1]!.id).toBe("call-456")
})

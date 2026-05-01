import { describe, expect, test } from "bun:test"
import { transformMessagesToContextItems, transformDiffToContextItems, transformApiCallsToContextItems, transformSessionToContextItems } from "./transform-messages"
import type { SessionMessageLike, ApiCallRecord } from "../shared/types"

describe("transformMessagesToContextItems", () => {
  test("transforms user message to context item", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg1", role: "user", tokens: { input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [{ type: "text", text: "Hello world" }],
      },
    ]

    const items = transformMessagesToContextItems(messages)

    expect(items.length).toBe(1)
    const item = items[0]
    expect(item?.type).toBe("user")
    expect(item?.title).toContain("Hello world")
    expect(item?.tokens).toBe(10)
  })

  test("transforms assistant message with tool call", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg2", role: "assistant", tokens: { input: 0, output: 50, reasoning: 10, cache: { read: 0, write: 0 } } },
        parts: [
          { type: "text", text: "I'll help you" },
          { type: "tool", tool: "read_file", input: { path: "test.ts" } },
        ],
      },
    ]

    const items = transformMessagesToContextItems(messages)

    expect(items.length).toBe(2)
    expect(items[0]?.type).toBe("assistant")
    expect(items[1]?.type).toBe("tool")
    expect(items[1]?.title).toContain("read_file")
  })

  test("handles empty messages", () => {
    const items = transformMessagesToContextItems([])
    expect(items).toHaveLength(0)
  })

  test("preserves message tokens - shows full API tokens on message row", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg3", role: "assistant", tokens: { input: 0, output: 100, reasoning: 25, cache: { read: 0, write: 0 } } },
        parts: [
          { type: "text", text: "Response" },
          { type: "tool", tool: "read_file", input: { path: "test.ts" } },
        ],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    const apiTotal = 100 + 25

    expect(items[0]?.tokens).toBe(apiTotal)
  })

  test("estimates tool tokens from serialized input", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg4", role: "assistant", tokens: { input: 0, output: 50, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [{ type: "tool", tool: "bash", input: { command: "ls -la" } }],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    const toolItem = items[1]

    expect(toolItem?.type).toBe("tool")
    expect(toolItem?.tokens).toBeGreaterThan(0)
  })
})

describe("transformDiffToContextItems", () => {
  test("transforms diff entries to file items", () => {
    const diff = [
      { file: "src/test.ts", added: 10, removed: 5 },
      { file: "src/util.ts", added: 3, removed: 1 },
    ]

    const items = transformDiffToContextItems(diff)

    expect(items.length).toBe(2)
    expect(items[0]?.type).toBe("file")
    expect(items[0]?.title).toBe("src/test.ts")
    expect(items[0]?.preview).toBe("+10 -5")
  })

  test("filters entries without file path", () => {
    const diff = [
      { file: "valid.ts", added: 5, removed: 2 },
      { added: 10, removed: 5 },
    ]

    const items = transformDiffToContextItems(diff)
    expect(items.length).toBe(1)
  })

  test("normalizes user role to 'user' type", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg_role1", role: "user", tokens: { input: 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [{ type: "text", text: "Test" }],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    expect(items[0]?.type).toBe("user")
  })

  test("normalizes assistant role to 'assistant' type", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg_role2", role: "assistant", tokens: { input: 0, output: 50, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [{ type: "text", text: "Response" }],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    expect(items[0]?.type).toBe("assistant")
  })

  test("falls back to system for missing role, never emits unknown", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg_role3", tokens: { input: 5, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [{ type: "text", text: "No role" }],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    expect(items[0]?.type).not.toBe("unknown")
    expect(items[0]?.type).toBe("system")
  })

  test("reads ToolPart input from part.state.input", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg_tool1", role: "assistant", tokens: { input: 0, output: 50, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [
          {
            type: "tool",
            tool: "read_file",
            state: { input: { path: "config.json" } },
          },
        ],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    const toolItem = items.find((i) => i.type === "tool")
    expect(toolItem?.title).toContain("read_file")
  })

  test("extracts tool name from part.tool and title from part.state.title", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg_tool2", role: "assistant", tokens: { input: 0, output: 30, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [
          {
            type: "tool",
            tool: "bash",
            state: { input: { command: "echo hello" }, title: "Echo Command" },
          },
        ],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    expect(items.length).toBe(2)
  })

  test("reads FilePart path from part.source.path", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg_file1", role: "user", tokens: { input: 20, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [
          {
            type: "file",
            source: { path: "/Users/test/file.ts" },
          },
        ],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    expect(items[0]?.preview).toContain("file.ts")
  })

  test("reads FilePart path from part.filename as fallback", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg_file2", role: "user", tokens: { input: 15, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [
          {
            type: "file",
            filename: "another.ts",
          },
        ],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    expect(items[0]?.preview).toContain("another.ts")
  })

  test("reads FilePart path from part.url as fallback", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg_file3", role: "user", tokens: { input: 15, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [
          {
            type: "file",
            url: "https://example.com/script.js",
          },
        ],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    expect(items[0]?.preview).toContain("script.js")
  })

  test("produces file items from PatchPart.files", () => {
    const messages: SessionMessageLike[] = [
      {
        info: { id: "msg_patch1", role: "assistant", tokens: { input: 0, output: 100, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [
          {
            type: "patch",
            files: ["src/index.ts", "src/util.ts"],
          },
        ],
      },
    ]

    const items = transformMessagesToContextItems(messages)
    const fileItems = items.filter((i) => i.type === "file")
    expect(fileItems.length).toBe(2)
    expect(fileItems[0]?.title).toContain("index.ts")
  })
})

describe("transformApiCallsToContextItems", () => {
  const createMockApiCall = (overrides?: Partial<ApiCallRecord>): ApiCallRecord => ({
    id: "test-id",
    timestamp: "2024-01-01T00:00:00Z",
    url: "https://api.anthropic.com/v1/messages",
    method: "post",
    provider: "anthropic",
    bodyShape: "messages",
    bodyPreview: '{"model":"claude-3","messages":[{"role":"user","content":"Hello"}]}',
    bodyTruncated: false,
    originalBodyBytes: 100,
    timing: { startedAt: "2024-01-01T00:00:00Z", endedAt: "2024-01-01T00:00:01Z", durationMs: 1000 },
    sessionID: "session-1",
    source: "global",
    ...overrides,
  })

  test("transforms single API call to context item", () => {
    const apiCalls: ApiCallRecord[] = [createMockApiCall()]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items.length).toBe(1)
    const item = items[0]
    expect(item?.type).toBe("api-call")
    expect(item?.title).toBe("POST anthropic api.anthropic.com")
    expect(item?.id).toBe("test-id")
  })

  test("transforms multiple API calls", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({ id: "call-1", method: "post", provider: "anthropic" }),
      createMockApiCall({ id: "call-2", method: "get", provider: "openai", url: "https://api.openai.com/v1/models" }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items.length).toBe(2)
    expect(items[0]?.title).toBe("POST anthropic api.anthropic.com")
    expect(items[1]?.title).toBe("GET openai api.openai.com")
  })

  test("returns empty array for empty input", () => {
    const items = transformApiCallsToContextItems([])
    expect(items).toHaveLength(0)
  })

  test("title format is METHOD PROVIDER HOST", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        method: "POST",
        provider: "anthropic",
        url: "https://api.anthropic.com/v1/messages",
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.title).toBe("POST anthropic api.anthropic.com")
  })

  test("truncates long hostnames in title", () => {
    const longHost = "a".repeat(50) + ".example.com"
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        url: `https://${longHost}/api`,
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.title?.length).toBeLessThanOrEqual("POST anthropic ".length + 30)
    expect(items[0]?.title).toContain("...")
  })

  test("preview is bounded to 100 characters", () => {
    const longBody = "x".repeat(200)
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        bodyPreview: longBody,
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.preview?.length).toBe(100)
    expect(items[0]?.preview).toBe(longBody.slice(0, 100))
  })

  test("uses dedupeID when available", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        id: "original-id",
        dedupeID: "dedupe-id-123",
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.id).toBe("dedupe-id-123")
  })

  test("falls back to id when dedupeID is not available", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        id: "fallback-id",
        dedupeID: undefined,
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.id).toBe("fallback-id")
  })

  test("estimates tokens from bodyPreview", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        bodyPreview: "Hello world test",
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.tokens).toBeGreaterThan(0)
  })

  test("includes metadata with timing info", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        timing: { startedAt: "2024-01-01T00:00:00Z", endedAt: "2024-01-01T00:00:02Z", durationMs: 2000 },
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.metadata?.timing).toEqual({
      startedAt: "2024-01-01T00:00:00Z",
      endedAt: "2024-01-01T00:00:02Z",
      durationMs: 2000,
    })
  })

  test("includes metadata with body info", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        bodyShape: "messages",
        bodyTruncated: true,
        originalBodyBytes: 5000,
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.metadata?.bodyShape).toBe("messages")
    expect(items[0]?.metadata?.bodyTruncated).toBe(true)
    expect(items[0]?.metadata?.originalBodyBytes).toBe(5000)
  })

  test("includes metadata with request details", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        url: "https://api.gemini.com/v1/generate",
        method: "POST",
        provider: "gemini",
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.metadata?.url).toBe("https://api.gemini.com/v1/generate")
    expect(items[0]?.metadata?.method).toBe("POST")
    expect(items[0]?.metadata?.provider).toBe("gemini")
  })

  test("preserves timestamp from API call", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        timestamp: "2024-06-15T12:30:45Z",
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.timestamp).toBe("2024-06-15T12:30:45Z")
  })

  test("handles different providers correctly", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({ id: "1", provider: "anthropic", url: "https://api.anthropic.com/v1/messages" }),
      createMockApiCall({ id: "2", provider: "openai", url: "https://api.openai.com/v1/chat/completions" }),
      createMockApiCall({ id: "3", provider: "gemini", url: "https://generativelanguage.googleapis.com/v1/models" }),
      createMockApiCall({ id: "4", provider: "bedrock", url: "https://bedrock-runtime.us-east-1.amazonaws.com/model" }),
      createMockApiCall({ id: "5", provider: "unknown", url: "https://api.example.com/v1/complete" }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items[0]?.title).toContain("anthropic")
    expect(items[1]?.title).toContain("openai")
    expect(items[2]?.title).toContain("gemini")
    expect(items[3]?.title).toContain("bedrock")
    expect(items[4]?.title).toContain("unknown")
  })

  test("handles malformed URLs gracefully", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        url: "not-a-valid-url",
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items.length).toBe(1)
    expect(items[0]?.title).toContain("not-a-valid-url")
  })

  test("handles URLs without protocol", () => {
    const apiCalls: ApiCallRecord[] = [
      createMockApiCall({
        url: "api.example.com/v1/test",
      }),
    ]

    const items = transformApiCallsToContextItems(apiCalls)

    expect(items.length).toBe(1)
    expect(items[0]?.title).toContain("api.example.com")
  })
})
import { describe, expect, test } from "bun:test"

import { buildSessionSummary } from "../src/shared/session-summary"
import type { ApiCallRecord } from "../src/shared/types"

function makeApiCall(overrides: Partial<ApiCallRecord> = {}): ApiCallRecord {
  return {
    id: "call_1",
    timestamp: "2025-01-01T00:00:00.000Z",
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    provider: "anthropic",
    bodyShape: "messages",
    bodyPreview: "",
    bodyTruncated: false,
    originalBodyBytes: 0,
    timing: { startedAt: "2025-01-01T00:00:00.000Z" },
    sessionID: "ses_1",
    source: "global",
    ...overrides,
  }
}

describe("buildSessionSummary", () => {
  test("counts messages, tool calls, todos, and diff files from raw session inputs", () => {
    const summary = buildSessionSummary({
      session: {
        id: "ses_123",
        title: "Investigate context drift",
        workspaceID: "ws_1",
      },
      messages: [
        {
          info: { id: "m1", role: "user" },
          parts: [{ type: "text", text: "hello" }],
        },
        {
          info: { id: "m2", role: "assistant" },
          parts: [
            { type: "tool", tool: "grep" },
            { type: "text", text: "done" },
          ],
        },
      ],
      todo: [
        { id: "t1", status: "completed", content: "inspect" },
        { id: "t2", status: "pending", content: "summarize" },
      ],
      diff: [
        { file: "src/server.ts", added: 10, removed: 2 },
        { file: "src/tui.tsx", added: 5, removed: 0 },
      ],
    })

    expect(summary.sessionID).toBe("ses_123")
    expect(summary.messageCount).toBe(2)
    expect(summary.toolCallCount).toBe(1)
    expect(summary.todo.completed).toBe(1)
    expect(summary.todo.pending).toBe(1)
    expect(summary.diff.files).toBe(2)
    expect(summary.diff.added).toBe(15)
    expect(summary.diff.removed).toBe(2)
    expect(summary.lastUserText).toBe("hello")
  })

  test("returns zeroed apiCalls when no apiCalls provided", () => {
    const summary = buildSessionSummary({ messages: [], todo: [], diff: [] })

    expect(summary.apiCalls).toEqual({
      count: 0,
      providers: { anthropic: 0, openai: 0, gemini: 0, bedrock: 0, unknown: 0 },
      requestBytes: { total: 0, avg: 0, max: 0 },
      timing: { avgDurationMs: 0, totalDurationMs: 0 },
      estimatedInputTokens: 0,
    })
  })

  test("computes apiCalls metrics for a single call", () => {
    const summary = buildSessionSummary({
      messages: [],
      todo: [],
      diff: [],
      apiCalls: [
        makeApiCall({
          provider: "openai",
          originalBodyBytes: 1024,
          bodyPreview: "abcd", // 4 chars → ceil(4/4) = 1 token
          timing: {
            startedAt: "2025-01-01T00:00:00.000Z",
            endedAt: "2025-01-01T00:00:01.000Z",
            durationMs: 500,
          },
        }),
      ],
    })

    expect(summary.apiCalls.count).toBe(1)
    expect(summary.apiCalls.providers).toEqual({
      anthropic: 0,
      openai: 1,
      gemini: 0,
      bedrock: 0,
      unknown: 0,
    })
    expect(summary.apiCalls.requestBytes).toEqual({ total: 1024, avg: 1024, max: 1024 })
    expect(summary.apiCalls.timing).toEqual({ avgDurationMs: 500, totalDurationMs: 500 })
    expect(summary.apiCalls.estimatedInputTokens).toBe(1) // ceil(4/4) = 1
  })

  test("aggregates multiple apiCalls across providers", () => {
    const summary = buildSessionSummary({
      messages: [],
      todo: [],
      diff: [],
      apiCalls: [
        makeApiCall({
          id: "c1",
          provider: "anthropic",
          originalBodyBytes: 2000,
          bodyPreview: "abcdefgh", // 8 chars → ceil(8/4) = 2 tokens
          timing: {
            startedAt: "2025-01-01T00:00:00.000Z",
            endedAt: "2025-01-01T00:00:01.000Z",
            durationMs: 300,
          },
        }),
        makeApiCall({
          id: "c2",
          provider: "openai",
          originalBodyBytes: 4000,
          bodyPreview: "abcdefghijklmnop", // 16 chars → ceil(16/4) = 4 tokens
          timing: {
            startedAt: "2025-01-01T00:00:00.000Z",
            endedAt: "2025-01-01T00:00:02.000Z",
            durationMs: 700,
          },
        }),
        makeApiCall({
          id: "c3",
          provider: "gemini",
          originalBodyBytes: 1000,
          bodyPreview: "abcde", // 5 chars → ceil(5/4) = 2 tokens
          timing: {
            startedAt: "2025-01-01T00:00:00.000Z",
            endedAt: "2025-01-01T00:00:00.500Z",
            durationMs: 200,
          },
        }),
      ],
    })

    expect(summary.apiCalls.count).toBe(3)
    expect(summary.apiCalls.providers).toEqual({
      anthropic: 1,
      openai: 1,
      gemini: 1,
      bedrock: 0,
      unknown: 0,
    })
    // total = 2000 + 4000 + 1000 = 7000
    // avg = round(7000 / 3) = 2333
    // max = 4000
    expect(summary.apiCalls.requestBytes).toEqual({ total: 7000, avg: 2333, max: 4000 })
    // totalDurationMs = 300 + 700 + 200 = 1200
    // avgDurationMs = round(1200 / 3) = 400
    expect(summary.apiCalls.timing).toEqual({ avgDurationMs: 400, totalDurationMs: 1200 })
    // estimatedInputTokens = 2 + 4 + 2 = 8
    expect(summary.apiCalls.estimatedInputTokens).toBe(8)
  })

  test("handles apiCalls with missing timing and bodyPreview", () => {
    const summary = buildSessionSummary({
      messages: [],
      todo: [],
      diff: [],
      apiCalls: [
        makeApiCall({
          id: "c1",
          provider: "anthropic",
          originalBodyBytes: 500,
          bodyPreview: "test", // 4 chars → 1 token
          timing: { startedAt: "2025-01-01T00:00:00.000Z" }, // no durationMs
        }),
        makeApiCall({
          id: "c2",
          provider: "bedrock",
          originalBodyBytes: 1500,
          bodyPreview: "", // empty → 0 tokens
          timing: {
            startedAt: "2025-01-01T00:00:00.000Z",
            endedAt: "2025-01-01T00:00:01.000Z",
            durationMs: 800,
          },
        }),
      ],
    })

    expect(summary.apiCalls.count).toBe(2)
    expect(summary.apiCalls.providers).toEqual({
      anthropic: 1,
      openai: 0,
      gemini: 0,
      bedrock: 1,
      unknown: 0,
    })
    // total = 500 + 1500 = 2000
    // avg = round(2000 / 2) = 1000
    // max = 1500
    expect(summary.apiCalls.requestBytes).toEqual({ total: 2000, avg: 1000, max: 1500 })
    // Only c2 has durationMs, so avgDurationMs = round(800 / 1) = 800
    // totalDurationMs = 800 (only counts calls with durationMs)
    expect(summary.apiCalls.timing).toEqual({ avgDurationMs: 800, totalDurationMs: 800 })
    // estimatedInputTokens = 1 + 0 = 1
    expect(summary.apiCalls.estimatedInputTokens).toBe(1)
  })

  test("apiCalls metrics are isolated under summary.apiCalls", () => {
    const summary = buildSessionSummary({
      session: { id: "ses_iso" },
      messages: [{ info: { id: "m1", role: "user" }, parts: [{ type: "text", text: "hi" }] }],
      todo: [{ id: "t1", status: "completed", content: "done" }],
      diff: [{ file: "a.ts", added: 1, removed: 0 }],
      apiCalls: [
        makeApiCall({ provider: "unknown", originalBodyBytes: 100 }),
      ],
    })

    // Existing fields remain backward-compatible
    expect(summary.sessionID).toBe("ses_iso")
    expect(summary.messageCount).toBe(1)
    expect(summary.todo.total).toBe(1)
    expect(summary.diff.files).toBe(1)

    // API metrics are present and isolated
    expect(summary.apiCalls).toBeDefined()
    expect(summary.apiCalls.count).toBe(1)
    expect(summary.apiCalls.providers.unknown).toBe(1)
  })
})

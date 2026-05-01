import { describe, expect, test } from "bun:test"

import { buildTuiFallbackRecord } from "./fallback-record"

function createApi(messages: unknown[], partsByMessageID: Record<string, unknown>) {
  return {
    state: {
      session: {
        messages: () => messages,
        todo: () => [],
        diff: () => [],
      },
      part: (messageID: string) => partsByMessageID[messageID],
    },
  }
}

describe("buildTuiFallbackRecord", () => {
  test("hydrates TUI message infos with separately stored parts and preserves assistant tokens", () => {
    const api = createApi(
      [
        {
          id: "msg_user",
          role: "user",
        },
        {
          id: "msg_assistant",
          role: "assistant",
          providerID: "anthropic",
          modelID: "claude-sonnet-4-5",
          cost: 0.031,
          time: { created: 100, completed: 200 },
          tokens: {
            input: 12,
            output: 34,
            reasoning: 5,
            cache: { read: 7, write: 9 },
          },
        },
      ],
      {
        msg_user: [{ type: "text", text: "hello" }],
        msg_assistant: [
          { type: "text", text: "I'll inspect it" },
          { type: "tool", tool: "read", input: { filePath: "src/tui.tsx" } },
        ],
      },
    )

    const record = buildTuiFallbackRecord(api as never, "ses_test")

    expect(record?.snapshot.messages).toEqual([
      {
        info: {
          id: "msg_user",
          role: "user",
        },
        parts: [{ type: "text", text: "hello" }],
      },
      {
        info: {
          id: "msg_assistant",
          role: "assistant",
          providerID: "anthropic",
          modelID: "claude-sonnet-4-5",
          cost: 0.031,
          time: { created: 100, completed: 200 },
          tokens: {
            input: 12,
            output: 34,
            reasoning: 5,
            cache: { read: 7, write: 9 },
          },
        },
        parts: [
          { type: "text", text: "I'll inspect it" },
          { type: "tool", tool: "read", input: { filePath: "src/tui.tsx" } },
        ],
      },
    ])
    expect(record?.summary.tokens.total).toBe(67)
    expect(record?.summary.toolCallCount).toBe(1)
  })

  test("handles missing and empty part arrays without crashing", () => {
    const api = createApi(
      [
        { id: "msg_empty", role: "user" },
        { id: "msg_missing", role: "assistant" },
      ],
      {
        msg_empty: [],
      },
    )

    const record = buildTuiFallbackRecord(api as never, "ses_test")

    expect(record?.snapshot.messages).toEqual([
      { info: { id: "msg_empty", role: "user" }, parts: [] },
      { info: { id: "msg_missing", role: "assistant" }, parts: [] },
    ])
  })

  test("works without server probe API-call data", () => {
    const api = createApi([{ id: "msg_user", role: "user" }], {})

    const record = buildTuiFallbackRecord(api as never, "ses_without_api_calls")

    expect(record).not.toBeNull()
    expect(record?.snapshot.apiCalls).toBeUndefined()
    expect(record?.apiCalls).toBeUndefined()
    expect(record?.summary.sessionID).toBe("ses_without_api_calls")
    expect(record?.summary.apiCalls.count).toBe(0)
    expect(record?.summary.apiCalls.requestBytes.total).toBe(0)
    expect(record?.captureMetadata.status).toBe("degraded")
  })

  test("returns null without an active session id", () => {
    const api = createApi([], {})

    expect(buildTuiFallbackRecord(api as never, "")).toBeNull()
  })
})

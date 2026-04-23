import { describe, expect, test } from "bun:test"

import { buildSessionSummary } from "../src/shared/session-summary"

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
})

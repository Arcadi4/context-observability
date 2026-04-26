import { describe, expect, test } from "bun:test"
import { transformMessagesToContextItems, transformDiffToContextItems } from "./transform-messages"
import type { SessionMessageLike } from "../shared/types"

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
})
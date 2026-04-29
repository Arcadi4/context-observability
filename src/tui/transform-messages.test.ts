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
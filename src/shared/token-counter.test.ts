import { describe, expect, test } from "bun:test"
import { calculateMessageTokens, estimateTextTokens, sumTokenCounts, formatTokenCount } from "./token-counter"
import type { SessionMessageLike } from "./types"

describe("calculateMessageTokens", () => {
  test("sums all token fields from message.info.tokens", () => {
    const message: SessionMessageLike = {
      info: {
        tokens: {
          input: 100,
          output: 50,
          reasoning: 25,
          cache: { read: 10, write: 5 },
        },
      },
      parts: [],
    }
    expect(calculateMessageTokens(message)).toBe(190)
  })

  test("returns 0 when tokens are missing", () => {
    const message: SessionMessageLike = { info: {}, parts: [] }
    expect(calculateMessageTokens(message)).toBe(0)
  })

  test("handles partial token data", () => {
    const message: SessionMessageLike = {
      info: {
        tokens: {
          input: 100,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      },
      parts: [],
    }
    expect(calculateMessageTokens(message)).toBe(100)
  })

  test("handles undefined info", () => {
    const message: SessionMessageLike = { parts: [] }
    expect(calculateMessageTokens(message)).toBe(0)
  })
})

describe("estimateTextTokens", () => {
  test("estimates tokens from character count", () => {
    const text = "a".repeat(400)
    expect(estimateTextTokens(text)).toBe(100)
  })

  test("returns 0 for empty string", () => {
    expect(estimateTextTokens("")).toBe(0)
  })

  test("rounds up partial tokens", () => {
    const text = "a".repeat(401)
    expect(estimateTextTokens(text)).toBe(101)
  })
})

describe("sumTokenCounts", () => {
  test("sums token counts from multiple items", () => {
    const items = [
      { tokens: 100 },
      { tokens: 200 },
      { tokens: 50 },
    ]
    expect(sumTokenCounts(items)).toBe(350)
  })

  test("returns 0 for empty array", () => {
    expect(sumTokenCounts([])).toBe(0)
  })
})

describe("formatTokenCount", () => {
  test("formats millions with M suffix", () => {
    expect(formatTokenCount(1_500_000)).toBe("1.5M")
  })

  test("formats thousands with k suffix", () => {
    expect(formatTokenCount(12_500)).toBe("12.5k")
  })

  test("formats small numbers without suffix", () => {
    expect(formatTokenCount(500)).toBe("500")
  })

  test("formats exactly 1000 as 1.0k", () => {
    expect(formatTokenCount(1000)).toBe("1.0k")
  })

  test("formats exactly 1_000_000 as 1.0M", () => {
    expect(formatTokenCount(1_000_000)).toBe("1.0M")
  })
})
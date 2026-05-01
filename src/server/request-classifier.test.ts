import { describe, expect, test } from "bun:test"
import { getHeader, resolveUrl, extractHostname, classifyBodyShape, classifyProvider } from "./request-classifier"

describe("getHeader", () => {
  test("extracts from Headers object", () => {
    const headers = new Headers({ "Content-Type": "application/json" })
    expect(getHeader(headers, "content-type")).toBe("application/json")
  })

  test("extracts from tuple array", () => {
    const headers: [string, string][] = [["Authorization", "Bearer token123"]]
    expect(getHeader(headers, "authorization")).toBe("Bearer token123")
  })

  test("extracts from plain object", () => {
    const headers = { "X-Custom": "value" }
    expect(getHeader(headers, "x-custom")).toBe("value")
  })

  test("returns null for missing header", () => {
    const headers = { "Content-Type": "application/json" }
    expect(getHeader(headers, "Authorization")).toBe(null)
  })

  test("handles case-insensitive lookup", () => {
    const headers = { "content-type": "text/plain" }
    expect(getHeader(headers, "Content-Type")).toBe("text/plain")
  })

  test("returns null for invalid headers", () => {
    expect(getHeader(null as unknown as HeadersInit, "test")).toBe(null)
    expect(getHeader(undefined as unknown as HeadersInit, "test")).toBe(null)
  })
})

describe("resolveUrl", () => {
  test("returns string as-is", () => {
    expect(resolveUrl("https://api.example.com")).toBe("https://api.example.com")
  })

  test("converts URL object to string", () => {
    const url = new URL("https://api.example.com/path")
    expect(resolveUrl(url)).toBe("https://api.example.com/path")
  })

  test("extracts url from Request", () => {
    const req = new Request("https://api.example.com/endpoint")
    expect(resolveUrl(req)).toBe("https://api.example.com/endpoint")
  })

  test("returns empty string for invalid input", () => {
    expect(resolveUrl(123 as unknown as string)).toBe("")
  })
})

describe("extractHostname", () => {
  test("extracts hostname from URL", () => {
    expect(extractHostname("https://api.anthropic.com/v1/messages")).toBe("api.anthropic.com")
  })

  test("extracts hostname with port", () => {
    expect(extractHostname("http://localhost:3000/api")).toBe("localhost")
  })

  test("returns empty string for invalid URL", () => {
    expect(extractHostname("not-a-url")).toBe("")
    expect(extractHostname("")).toBe("")
  })
})

describe("classifyBodyShape", () => {
  test("detects messages[] shape", () => {
    expect(classifyBodyShape({ messages: [{ role: "user", content: "hi" }] })).toBe("messages")
  })

  test("detects input[] shape", () => {
    expect(classifyBodyShape({ input: ["prompt text"] })).toBe("input")
  })

  test("detects contents[] shape", () => {
    expect(classifyBodyShape({ contents: [{ parts: [{ text: "hello" }] }] })).toBe("contents")
  })

  test("returns unknown for empty object", () => {
    expect(classifyBodyShape({})).toBe("unknown")
  })

  test("returns unknown for non-matching properties", () => {
    expect(classifyBodyShape({ prompt: "test", model: "gpt-4" })).toBe("unknown")
  })

  test("returns unknown for null", () => {
    expect(classifyBodyShape(null)).toBe("unknown")
  })

  test("returns unknown for undefined", () => {
    expect(classifyBodyShape(undefined)).toBe("unknown")
  })

  test("returns unknown for array body", () => {
    expect(classifyBodyShape([])).toBe("unknown")
  })

  test("returns unknown for primitive body", () => {
    expect(classifyBodyShape("string")).toBe("unknown")
    expect(classifyBodyShape(42)).toBe("unknown")
    expect(classifyBodyShape(true)).toBe("unknown")
  })

  test("returns unknown for non-array property values", () => {
    expect(classifyBodyShape({ messages: "not-an-array" })).toBe("unknown")
    expect(classifyBodyShape({ input: { nested: true } })).toBe("unknown")
  })
})

describe("classifyProvider", () => {
  test("classifies Anthropic from hostname", () => {
    expect(classifyProvider("https://api.anthropic.com/v1/messages", "messages")).toBe("anthropic")
  })

  test("classifies OpenAI from hostname", () => {
    expect(classifyProvider("https://api.openai.com/v1/chat/completions", "messages")).toBe("openai")
  })

  test("classifies Gemini from hostname", () => {
    expect(classifyProvider("https://generativelanguage.googleapis.com/v1/models", "contents")).toBe("gemini")
  })

  test("classifies Vertex AI as gemini", () => {
    expect(classifyProvider("https://aiplatform.googleapis.com/v1/projects", "contents")).toBe("gemini")
  })

  test("classifies Bedrock from hostname", () => {
    expect(classifyProvider("https://bedrock.us-east-1.amazonaws.com", "messages")).toBe("bedrock")
  })

  test("infers OpenAI from input[] body shape", () => {
    expect(classifyProvider("https://unknown-api.com/v1", "input")).toBe("openai")
  })

  test("infers Gemini from contents[] body shape", () => {
    expect(classifyProvider("https://unknown-api.com/v1", "contents")).toBe("gemini")
  })

  test("returns unknown for messages[] without matching hostname", () => {
    expect(classifyProvider("https://unknown-api.com/v1", "messages")).toBe("unknown")
  })

  test("returns unknown for unknown body shape without matching hostname", () => {
    expect(classifyProvider("https://unknown-api.com/v1", "unknown")).toBe("unknown")
  })

  test("returns unknown for invalid URL", () => {
    expect(classifyProvider("not-a-url", "messages")).toBe("unknown")
  })

  test("handles empty URL", () => {
    expect(classifyProvider("", "messages")).toBe("unknown")
  })
})

import type { ApiCallBodyShape, ApiProviderFamily } from "../shared/types"

/** Extract header value from Headers object, tuple array, or plain object. Returns null if not found. */
export function getHeader(headers: HeadersInit, name: string): string | null {
  try {
    const lowerName = name.toLowerCase()

    if (headers instanceof Headers) {
      return headers.get(name)
    }

    if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        if (typeof key === "string" && key.toLowerCase() === lowerName) {
          return typeof value === "string" ? value : null
        }
      }
      return null
    }

    if (headers && typeof headers === "object") {
      for (const [key, value] of Object.entries(headers)) {
        if (typeof key === "string" && key.toLowerCase() === lowerName) {
          return typeof value === "string" ? value : null
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/** Resolve URL from string, URL object, or Request to a string. Returns empty string on failure. */
export function resolveUrl(url: string | URL | Request): string {
  try {
    if (typeof url === "string") {
      return url
    }

    if (url instanceof URL) {
      return url.toString()
    }

    if (url instanceof Request) {
      return url.url
    }

    return ""
  } catch {
    return ""
  }
}

/** Extract hostname from URL string. Returns empty string if parsing fails. */
export function extractHostname(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname
  } catch {
    return ""
  }
}

/** Classify AI API request body shape: messages[], input[], contents[], or unknown. */
export function classifyBodyShape(body: unknown): ApiCallBodyShape {
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return "unknown"
    }

    const obj = body as Record<string, unknown>

    if (Array.isArray(obj.messages)) {
      return "messages"
    }

    if (Array.isArray(obj.input)) {
      return "input"
    }

    if (Array.isArray(obj.contents)) {
      return "contents"
    }

    return "unknown"
  } catch {
    return "unknown"
  }
}

/** Classify AI provider family from URL hostname and body shape heuristics. */
export function classifyProvider(url: string, bodyShape: ApiCallBodyShape): ApiProviderFamily {
  try {
    const hostname = extractHostname(url).toLowerCase()

    if (hostname.includes("anthropic.com") || hostname.includes("anthropic")) {
      return "anthropic"
    }

    if (hostname.includes("openai.com") || hostname.includes("api.openai")) {
      return "openai"
    }

    if (hostname.includes("generativelanguage.googleapis.com") || hostname.includes("gemini")) {
      return "gemini"
    }

    if (hostname.includes("aiplatform.googleapis.com") || hostname.includes("vertexai")) {
      return "gemini"
    }

    if (hostname.includes("bedrock") || hostname.includes("amazonaws.com")) {
      return "bedrock"
    }

    if (bodyShape === "input") {
      return "openai"
    }

    if (bodyShape === "contents") {
      return "gemini"
    }

    return "unknown"
  } catch {
    return "unknown"
  }
}

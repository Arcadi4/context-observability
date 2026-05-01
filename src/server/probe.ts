/**
 * Dual-layer API call probe.
 *
 * Intercepts fetch calls at two levels:
 * 1. globalThis.fetch - catches all outgoing requests
 * 2. chat.params output.options.fetch - catches OpenCode-specific fetch overrides
 *
 * Dedupe prevents double-capture when both layers see the same request.
 * Errors in the probe never break the original fetch call.
 */

import type { ApiCallSource, ApiProviderFamily, ApiCallBodyShape, CapturedApiCallFact } from "../shared/types"
import { extractHostname, classifyProvider, classifyBodyShape, getHeader } from "./request-classifier"

export type TruthStoreCallback = (fact: CapturedApiCallFact) => void | Promise<void>

export type ProbeConfig = {
  sessionID?: string
  onCapture?: TruthStoreCallback
  maxBodyBytes?: number
  maxDedupeCacheSize?: number
}

export type ProbeHandle = {
  uninstall: () => void
}

const seenObjects = new WeakSet<object>()
const dedupeCache = new Map<string, number>()
const MAX_DEDUPE_CACHE_SIZE = 1000
const DEFAULT_MAX_BODY_BYTES = 1024

let originalGlobalFetch: typeof fetch | null = null

export function __resetDedupeCache(): void {
  dedupeCache.clear()
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function cleanDedupeCache(maxSize: number): void {
  if (dedupeCache.size <= maxSize) return

  const entries = Array.from(dedupeCache.entries())
  entries.sort((a, b) => a[1] - b[1])

  const toRemove = entries.slice(0, entries.length - maxSize)
  for (const [key] of toRemove) {
    dedupeCache.delete(key)
  }
}

function markDedupeKeySeen(key: string, maxCacheSize: number): void {
  dedupeCache.set(key, Date.now())
  cleanDedupeCache(maxCacheSize)
}

function isDedupeKeySeen(key: string): boolean {
  return dedupeCache.has(key)
}

function extractSessionID(input: RequestInfo | URL, init: RequestInit | undefined, configSessionID?: string): string | undefined {
  if (init?.headers) {
    const headerValue = getHeader(init.headers, "x-opencode-session")
    if (headerValue) {
      return headerValue
    }
  }

  if (input instanceof Request) {
    const headerValue = input.headers.get("x-opencode-session")
    if (headerValue) {
      return headerValue
    }
  }

  return configSessionID
}

async function normalizeBody(body: unknown, maxBodyBytes: number): Promise<string> {
  if (body === null || body === undefined) {
    return ""
  }

  if (typeof body === "string") {
    return body.slice(0, maxBodyBytes)
  }

  if (body instanceof FormData) {
    const entries: string[] = []
    body.forEach((value, key) => {
      entries.push(`${key}=${typeof value === "string" ? value : "[File]"}`)
    })
    return entries.join("&").slice(0, maxBodyBytes)
  }

  if (body instanceof URLSearchParams) {
    return body.toString().slice(0, maxBodyBytes)
  }

  if (body instanceof Blob || body instanceof ArrayBuffer) {
    return "[binary]"
  }

  if (typeof body === "object") {
    try {
      return JSON.stringify(body).slice(0, maxBodyBytes)
    } catch {
      return "[object]"
    }
  }

  return String(body).slice(0, maxBodyBytes)
}

async function extractRequestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  maxBodyBytes: number,
): Promise<{ body: unknown; bodyShape: ApiCallBodyShape; bodyPreview: string; bodyTruncated: boolean; originalBodyBytes: number }> {
  let body: unknown = undefined
  let originalBodyBytes = 0

  // Try to get body from init first
  if (init?.body !== undefined) {
    body = init.body
  } else if (input instanceof Request) {
    // For Request objects, try to clone and read the body
    if (input.bodyUsed) {
      return {
        body: undefined,
        bodyShape: "unknown",
        bodyPreview: "[body unavailable - already consumed]",
        bodyTruncated: false,
        originalBodyBytes: 0,
      }
    }

    try {
      const cloned = input.clone()
      const text = await cloned.text()
      body = text
      originalBodyBytes = text.length
    } catch {
      return {
        body: undefined,
        bodyShape: "unknown",
        bodyPreview: "[body unavailable - clone failed]",
        bodyTruncated: false,
        originalBodyBytes: 0,
      }
    }
  }

  let bodyStr = ""
  if (typeof body === "string") {
    bodyStr = body
    originalBodyBytes = body.length
  } else if (body instanceof FormData) {
    const entries: string[] = []
    body.forEach((value, key) => {
      entries.push(`${key}=${typeof value === "string" ? value : "[File]"}`)
    })
    bodyStr = entries.join("&")
    originalBodyBytes = bodyStr.length
  } else if (body instanceof URLSearchParams) {
    bodyStr = body.toString()
    originalBodyBytes = bodyStr.length
  } else if (body instanceof Blob) {
    bodyStr = "[Blob]"
    originalBodyBytes = body.size
  } else if (body instanceof ArrayBuffer) {
    bodyStr = "[ArrayBuffer]"
    originalBodyBytes = body.byteLength
  } else if (typeof body === "object" && body !== null) {
    try {
      bodyStr = JSON.stringify(body)
      originalBodyBytes = bodyStr.length
    } catch {
      bodyStr = "[object]"
    }
  }

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(bodyStr)
  } catch {
    parsedBody = body
  }

  const bodyShape = classifyBodyShape(parsedBody)
  const truncated = originalBodyBytes > maxBodyBytes
  const preview = bodyStr.slice(0, maxBodyBytes)

  return {
    body,
    bodyShape,
    bodyPreview: preview,
    bodyTruncated: truncated,
    originalBodyBytes,
  }
}

export async function createDedupeKey(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  const maxBodyBytes = DEFAULT_MAX_BODY_BYTES

  let urlStr = ""
  if (typeof input === "string") {
    urlStr = input
  } else if (input instanceof URL) {
    urlStr = input.toString()
  } else if (input instanceof Request) {
    urlStr = input.url
  }

  const method = init?.method?.toUpperCase() || (input instanceof Request ? input.method.toUpperCase() : "GET")

  let bodyKey = ""
  if (init?.body !== undefined) {
    if (typeof init.body === "string") {
      bodyKey = init.body.slice(0, maxBodyBytes)
    } else if (init.body instanceof FormData) {
      const entries: string[] = []
      init.body.forEach((value, key) => {
        entries.push(`${key}=${typeof value === "string" ? value : "[File]"}`)
      })
      bodyKey = entries.join("&").slice(0, maxBodyBytes)
    } else if (init.body instanceof URLSearchParams) {
      bodyKey = init.body.toString().slice(0, maxBodyBytes)
    } else if (typeof init.body === "object") {
      try {
        bodyKey = JSON.stringify(init.body).slice(0, maxBodyBytes)
      } catch {
        bodyKey = "[object]"
      }
    }
  } else if (input instanceof Request && input.body) {
    if (!input.bodyUsed) {
      try {
        const cloned = input.clone()
        const text = await cloned.text()
        bodyKey = text.slice(0, maxBodyBytes)
      } catch {
        bodyKey = "[Request body]"
      }
    } else {
      bodyKey = "[body consumed]"
    }
  }

  return `${method}|${urlStr}|${bodyKey}`
}

export function isAiRequest(url: string | URL | Request): boolean {
  const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url
  const hostname = extractHostname(urlStr).toLowerCase()

  if (hostname.includes("anthropic.com") || hostname.includes("anthropic")) {
    return true
  }

  if (hostname.includes("openai.com") || hostname.includes("api.openai")) {
    return true
  }

  if (hostname.includes("generativelanguage.googleapis.com") || hostname.includes("gemini")) {
    return true
  }

  if (hostname.includes("aiplatform.googleapis.com") || hostname.includes("vertexai")) {
    return true
  }

  if (hostname.includes("bedrock") || hostname.includes("amazonaws.com")) {
    return true
  }

  return false
}

async function captureRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  source: ApiCallSource,
  config: ProbeConfig,
): Promise<void> {
  if (!config.onCapture) return

  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

  if (!isAiRequest(urlStr)) {
    return
  }

  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const sessionID = extractSessionID(input, init, config.sessionID)
  const method = init?.method?.toUpperCase() || (input instanceof Request ? input.method.toUpperCase() : "GET")

  const headers: Record<string, string> = {}
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        if (typeof value === "string") {
          headers[key] = value
        }
      }
    } else if (typeof init.headers === "object") {
      for (const [key, value] of Object.entries(init.headers)) {
        if (typeof value === "string") {
          headers[key] = value
        }
      }
    }
  } else if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      headers[key] = value
    })
  }

  const bodyInfo = await extractRequestBody(input, init, maxBodyBytes)
  const provider = classifyProvider(urlStr, bodyInfo.bodyShape)

  const fact: CapturedApiCallFact = {
    id: generateId(),
    url: urlStr,
    method,
    headers,
    body: bodyInfo.body,
    capturedAt: new Date().toISOString(),
    source,
    provider,
    bodyShape: bodyInfo.bodyShape,
    sessionID,
  }

  try {
    await config.onCapture(fact)
  } catch {
    // Errors in capture callback should not affect the request
  }
}

export function installGlobalProbe(config: ProbeConfig): ProbeHandle {
  originalGlobalFetch = globalThis.fetch
  const maxCacheSize = config.maxDedupeCacheSize ?? MAX_DEDUPE_CACHE_SIZE

  const wrappedFetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (input instanceof Request) {
        if (seenObjects.has(input)) {
          return originalGlobalFetch!(input, init)
        }
        seenObjects.add(input)
      }

      const dedupeKey = await createDedupeKey(input, init)
      const alreadySeen = isDedupeKeySeen(dedupeKey)

      if (!alreadySeen) {
        markDedupeKeySeen(dedupeKey, maxCacheSize)
        try {
          await captureRequest(input, init, "global", config)
        } catch {
          // Errors in capture should not affect the request
        }
      }

      return originalGlobalFetch!(input, init)
    },
    { preconnect: originalGlobalFetch.preconnect },
  )

  globalThis.fetch = wrappedFetch as typeof fetch

  return {
    uninstall: () => {
      if (originalGlobalFetch) {
        globalThis.fetch = originalGlobalFetch
        originalGlobalFetch = null
      }
    },
  }
}

export function wrapChatParamsFetch(fetchFn: typeof fetch, config: ProbeConfig): typeof fetch {
  const maxCacheSize = config.maxDedupeCacheSize ?? MAX_DEDUPE_CACHE_SIZE

  const wrapped = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (input instanceof Request) {
        if (seenObjects.has(input)) {
          return fetchFn(input, init)
        }
        seenObjects.add(input)
      }

      const dedupeKey = await createDedupeKey(input, init)
      const alreadySeen = isDedupeKeySeen(dedupeKey)

      if (!alreadySeen) {
        markDedupeKeySeen(dedupeKey, maxCacheSize)
        try {
          await captureRequest(input, init, "chat.params", config)
        } catch {
          // Errors in capture should not affect the request
        }
      }

      return fetchFn(input, init)
    },
    { preconnect: fetchFn.preconnect },
  )

  return wrapped as typeof fetch
}

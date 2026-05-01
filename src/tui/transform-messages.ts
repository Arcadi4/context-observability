import type { ApiCallRecord, ContextItem, SessionMessageLike } from "../shared/types"
import { calculateMessageTokens, estimateTextTokens } from "../shared/token-counter"

function extractTextPreview(parts: Array<Record<string, unknown>>): string {
  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string") {
      return part.text.slice(0, 80)
    }
    if (part.type === "file") {
      const path = (part.source as Record<string, unknown> | undefined)?.path as string | undefined
      if (typeof path === "string") return `File: ${path}`
      if (typeof part.filename === "string") return `File: ${part.filename}`
      if (typeof part.url === "string") return `File: ${part.url}`
    }
    if (part.type === "tool") {
      const toolName = typeof part.tool === "string" ? part.tool : "unknown"
      const state = part.state as Record<string, unknown> | undefined
      const input = state?.input as Record<string, unknown> | undefined
      const args = input ? Object.keys(input).join(", ") : ""
      const title = state?.title as string | undefined
      return title ? `Tool: ${title}` : `Tool: ${toolName}(${args})`
    }
  }
  return "(no preview)"
}

function normalizeRole(role: string | undefined): "user" | "assistant" | "system" {
  if (role === "user") return "user"
  if (role === "assistant") return "assistant"
  return "system"
}

function transformMessageToContextItems(message: SessionMessageLike, index: number): ContextItem[] {
  const items: ContextItem[] = []
  const rawRole = message.info?.role ?? "system"
  const role = normalizeRole(rawRole)
  const messageTokens = calculateMessageTokens(message)

  const textPreview = extractTextPreview(message.parts ?? [])

  // Message row shows full token count from API (actual data, not distributed)
  items.push({
    id: message.info?.id ?? `msg-${index}`,
    type: role as ContextItem["type"],
    title: textPreview,
    preview: textPreview,
    tokens: messageTokens,
    timestamp: new Date().toISOString(),
    metadata: { role: rawRole, partCount: message.parts?.length ?? 0 },
  })

  // Tool rows show estimated tokens from serialized input (tools are part of message context)
  if (message.parts) {
    for (const part of message.parts) {
      if (part.type === "tool") {
        const toolName = typeof part.tool === "string" ? part.tool : "unknown"
        const state = part.state as Record<string, unknown> | undefined
        const input = state?.input as Record<string, unknown> | undefined
        const args = input ? JSON.stringify(input).slice(0, 50) : ""
        const stateTitle = state?.title as string | undefined

        const toolInputStr = input ? JSON.stringify(input) : ""
        const toolTokens = estimateTextTokens(`${toolName}${toolInputStr}`)

        items.push({
          id: `${message.info?.id ?? index}-tool-${toolName}`,
          type: "tool",
          title: stateTitle ?? `${toolName}(${args})`,
          preview: `Tool call: ${toolName}`,
          tokens: toolTokens,
          timestamp: new Date().toISOString(),
          metadata: { tool: toolName, input, stateTitle },
        })
      }

      if (part.type === "patch") {
        const files = part.files as string[] | undefined
        if (files) {
          for (const file of files) {
            items.push({
              id: `${message.info?.id ?? index}-patch-${file}`,
              type: "file",
              title: file,
              preview: `Patch: ${file}`,
              tokens: estimateTextTokens(file),
              timestamp: new Date().toISOString(),
              metadata: { patchFile: file },
            })
          }
        }
      }
    }
  }

  return items
}

export function transformMessagesToContextItems(messages: SessionMessageLike[]): ContextItem[] {
  const items: ContextItem[] = []

  for (const msg of messages) {
    const messageItems = transformMessageToContextItems(msg, items.length)
    items.push(...messageItems)
  }

  return items
}

export function transformDiffToContextItems(diff: Array<{ file?: string; added?: number; removed?: number }>): ContextItem[] {
  return diff
    .filter((d): d is { file: string; added: number; removed: number } => Boolean(d.file))
    .map((d, index) => ({
      id: `diff-${index}`,
      type: "file" as const,
      title: d.file,
      preview: `+${d.added} -${d.removed}`,
      tokens: estimateTextTokens(`${d.file}\n${"+".repeat(d.added)}${"-".repeat(d.removed)}`),
      metadata: { added: d.added, removed: d.removed },
    }))
}

function extractHostFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    // If URL parsing fails, try to extract host manually
    const match = url.match(/^https?:\/\/([^\/]+)/)
    return match?.[1] ?? url
  }
}

function truncateHost(host: string, maxLength: number = 30): string {
  if (host.length <= maxLength) return host
  return host.slice(0, maxLength - 3) + "..."
}

export function transformApiCallsToContextItems(apiCalls: ApiCallRecord[]): ContextItem[] {
  return apiCalls.map((apiCall) => {
    const host = extractHostFromUrl(apiCall.url)
    const truncatedHost = truncateHost(host)
    const title = `${apiCall.method.toUpperCase()} ${apiCall.provider} ${truncatedHost}`

    // Bounded preview - first 100 chars of body preview
    const preview = apiCall.bodyPreview.slice(0, 100)

    // Estimate tokens from body preview (actual tokens not available in ApiCallRecord)
    const tokens = estimateTextTokens(apiCall.bodyPreview)

    return {
      id: apiCall.dedupeID ?? apiCall.id,
      type: "api-call" as const,
      title,
      preview,
      tokens,
      timestamp: apiCall.timestamp,
      metadata: {
        bodyShape: apiCall.bodyShape,
        bodyTruncated: apiCall.bodyTruncated,
        originalBodyBytes: apiCall.originalBodyBytes,
        timing: apiCall.timing,
        url: apiCall.url,
        method: apiCall.method,
        provider: apiCall.provider,
      },
    }
  })
}

export function transformSessionToContextItems(
  messages: SessionMessageLike[],
  diff?: Array<{ file?: string; added?: number; removed?: number }>,
  apiCalls?: ApiCallRecord[]
): ContextItem[] {
  const items: ContextItem[] = []

  items.push(...transformMessagesToContextItems(messages))

  if (diff && diff.length > 0) {
    items.push(...transformDiffToContextItems(diff))
  }

  if (apiCalls && apiCalls.length > 0) {
    items.push(...transformApiCallsToContextItems(apiCalls))
  }

  return items
}
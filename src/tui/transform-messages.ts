import type { ContextItem, SessionMessageLike } from "../shared/types"
import { calculateMessageTokens, estimateTextTokens } from "../shared/token-counter"

function extractTextPreview(parts: Array<Record<string, unknown>>): string {
  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string") {
      return part.text.slice(0, 80)
    }
    if (part.type === "file" && typeof part.file === "string") {
      return `File: ${part.file}`
    }
    if (part.type === "tool" && typeof part.tool === "string") {
      const input = part.input as Record<string, unknown> | undefined
      const args = input ? Object.keys(input).join(", ") : ""
      return `Tool: ${part.tool}(${args})`
    }
  }
  return "(no preview)"
}

function transformMessageToContextItems(message: SessionMessageLike, index: number): ContextItem[] {
  const items: ContextItem[] = []
  const role = message.info?.role ?? "unknown"
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
    metadata: { role, partCount: message.parts?.length ?? 0 },
  })

  // Tool rows show estimated tokens from serialized input (tools are part of message context)
  if (message.parts) {
    for (const part of message.parts) {
      if (part.type === "tool") {
        const toolName = typeof part.tool === "string" ? part.tool : "unknown"
        const input = part.input as Record<string, unknown> | undefined
        const args = input ? JSON.stringify(input).slice(0, 50) : ""

        // Estimate tool tokens from serialized input size (4 chars per token)
        const toolInputStr = input ? JSON.stringify(input) : ""
        const toolTokens = estimateTextTokens(`${toolName}${toolInputStr}`)

        items.push({
          id: `${message.info?.id ?? index}-tool-${toolName}`,
          type: "tool",
          title: `${toolName}(${args})`,
          preview: `Tool call: ${toolName}`,
          tokens: toolTokens,
          timestamp: new Date().toISOString(),
          metadata: { tool: toolName, input },
        })
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
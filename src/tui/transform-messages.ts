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
  const isToolMessage = message.parts?.some((p) => p.type === "tool")

  items.push({
    id: message.info?.id ?? `msg-${index}`,
    type: role as ContextItem["type"],
    title: textPreview,
    preview: textPreview,
    tokens: isToolMessage ? Math.floor(messageTokens / 2) : messageTokens,
    timestamp: new Date().toISOString(),
    metadata: { role, partCount: message.parts?.length ?? 0 },
  })

  if (message.parts) {
    for (const part of message.parts) {
      if (part.type === "tool") {
        const toolName = typeof part.tool === "string" ? part.tool : "unknown"
        const input = part.input as Record<string, unknown> | undefined
        const args = input ? JSON.stringify(input).slice(0, 50) : ""

        items.push({
          id: `${message.info?.id ?? index}-tool-${toolName}`,
          type: "tool",
          title: `${toolName}(${args})`,
          preview: `Tool call: ${toolName}`,
          tokens: Math.floor(messageTokens / (message.parts.length * 2)),
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
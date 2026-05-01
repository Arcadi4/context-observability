import type {
  ApiCallRecord,
  ApiProviderFamily,
  SessionDiffLike,
  SessionMessageLike,
  SessionSnapshot,
  SessionSummary,
  SessionTodoLike,
} from "./types"
import { estimateTextTokens } from "./token-counter"

function countToolParts(messages: SessionMessageLike[]): number {
  return messages.reduce((total, message) => {
    const parts = message.parts ?? []
    return (
      total +
      parts.filter((part) => {
        const type = part.type
        return type === "tool"
      }).length
    )
  }, 0)
}

function summarizeTodos(todo: SessionTodoLike[]) {
  return todo.reduce(
    (acc, item) => {
      acc.total += 1
      if (item.status === "completed") {
        acc.completed += 1
      } else if (item.status === "pending" || item.status === "in_progress") {
        acc.pending += 1
      } else {
        acc.other += 1
      }
      return acc
    },
    { total: 0, completed: 0, pending: 0, other: 0 },
  )
}

function summarizeDiff(diff: SessionDiffLike[]) {
  return diff.reduce<{ files: number; added: number; removed: number }>(
    (acc, item) => {
      acc.files += item.file ? 1 : 0
      acc.added += item.added ?? 0
      acc.removed += item.removed ?? 0
      return acc
    },
    { files: 0, added: 0, removed: 0 },
  )
}

function findLastUserText(messages: SessionMessageLike[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.info?.role !== "user") continue
    const part = (message.parts ?? []).find((item) => typeof item.text === "string")
    if (part && typeof part.text === "string") return part.text
  }
  return null
}

function summarizeApiCalls(apiCalls: ApiCallRecord[]): SessionSummary["apiCalls"] {
  if (apiCalls.length === 0) {
    return {
      count: 0,
      providers: {
        anthropic: 0,
        openai: 0,
        gemini: 0,
        bedrock: 0,
        unknown: 0,
      },
      requestBytes: { total: 0, avg: 0, max: 0 },
      timing: { avgDurationMs: 0, totalDurationMs: 0 },
      estimatedInputTokens: 0,
    }
  }

  const providers: Record<ApiProviderFamily, number> = {
    anthropic: 0,
    openai: 0,
    gemini: 0,
    bedrock: 0,
    unknown: 0,
  }

  let totalBytes = 0
  let maxBytes = 0
  let totalDurationMs = 0
  let durationCount = 0
  let estimatedInputTokens = 0

  for (const call of apiCalls) {
    providers[call.provider] = (providers[call.provider] || 0) + 1

    const bytes = call.originalBodyBytes || 0
    totalBytes += bytes
    if (bytes > maxBytes) maxBytes = bytes

    if (call.timing?.durationMs != null) {
      totalDurationMs += call.timing.durationMs
      durationCount += 1
    }

    if (call.bodyPreview) {
      estimatedInputTokens += estimateTextTokens(call.bodyPreview)
    }
  }

  return {
    count: apiCalls.length,
    providers,
    requestBytes: {
      total: totalBytes,
      avg: Math.round(totalBytes / apiCalls.length),
      max: maxBytes,
    },
    timing: {
      avgDurationMs: durationCount > 0 ? Math.round(totalDurationMs / durationCount) : 0,
      totalDurationMs,
    },
    estimatedInputTokens,
  }
}

export function buildSessionSummary(snapshot: SessionSnapshot, fallbackSessionID?: string): SessionSummary {
  const messages = snapshot.messages

  const inputTokens = messages.reduce((sum, msg) => sum + (msg.info?.tokens?.input || 0), 0)
  const outputTokens = messages.reduce((sum, msg) => sum + (msg.info?.tokens?.output || 0), 0)
  const reasoningTokens = messages.reduce((sum, msg) => sum + (msg.info?.tokens?.reasoning || 0), 0)
  const cacheReadTokens = messages.reduce((sum, msg) => sum + (msg.info?.tokens?.cache?.read || 0), 0)
  const cacheWriteTokens = messages.reduce((sum, msg) => sum + (msg.info?.tokens?.cache?.write || 0), 0)
  const totalTokens = inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens

  return {
    sessionID: snapshot.session?.id ?? fallbackSessionID ?? null,
    title: snapshot.session?.title ?? null,
    workspaceID: snapshot.session?.workspaceID ?? null,
    messageCount: messages.length,
    toolCallCount: countToolParts(messages),
    todo: summarizeTodos(snapshot.todo),
    diff: summarizeDiff(snapshot.diff),
    lastUserText: findLastUserText(messages),
    generatedAt: new Date().toISOString(),
    tokens: {
      total: totalTokens,
      input: inputTokens,
      output: outputTokens,
      reasoning: reasoningTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens,
    },
    apiCalls: summarizeApiCalls(snapshot.apiCalls ?? []),
  }
}

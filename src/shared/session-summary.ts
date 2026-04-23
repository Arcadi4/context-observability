import type {
  SessionDiffLike,
  SessionMessageLike,
  SessionSnapshot,
  SessionSummary,
  SessionTodoLike,
} from "./types"

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

export function buildSessionSummary(snapshot: SessionSnapshot): SessionSummary {
  return {
    sessionID: snapshot.session?.id ?? null,
    title: snapshot.session?.title ?? null,
    workspaceID: snapshot.session?.workspaceID ?? null,
    messageCount: snapshot.messages.length,
    toolCallCount: countToolParts(snapshot.messages),
    todo: summarizeTodos(snapshot.todo),
    diff: summarizeDiff(snapshot.diff),
    lastUserText: findLastUserText(snapshot.messages),
    generatedAt: new Date().toISOString(),
  }
}

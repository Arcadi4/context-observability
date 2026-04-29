import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

import { buildSessionSummary } from "../shared/session-summary"
import type { SessionDiffLike, SessionMessageLike, SessionObservationRecord, SessionSnapshot, SessionTodoLike } from "../shared/types"

export function buildTuiFallbackRecord(api: TuiPluginApi, sessionID: string): SessionObservationRecord | null {
  if (!sessionID) return null

  const snapshot: SessionSnapshot = {
    session: {
      id: sessionID,
      title: null,
      workspaceID: null,
    },
    messages: normalizeMessages(api.state.session.messages(sessionID), api),
    todo: normalizeTodos(api.state.session.todo(sessionID)),
    diff: normalizeDiff(api.state.session.diff(sessionID)),
  }

  return {
    summary: buildSessionSummary(snapshot),
    snapshot,
    captureMetadata: {
      status: "degraded",
      source: "unknown",
      capturedAt: new Date().toISOString(),
      partial: true,
      errorMessage: "Showing TUI-synced fallback data because no server-captured observation record is available yet.",
    },
  }
}

function normalizeMessages(input: unknown, api: TuiPluginApi): SessionMessageLike[] {
  if (!Array.isArray(input)) return []
  return input.filter(isRecord).map((message) => {
    const info = normalizeInfo(message)
    return {
      info,
      parts: normalizeParts(readMessageParts(api, info?.id) ?? message.parts),
    }
  })
}

function normalizeInfo(message: Record<string, unknown>): SessionMessageLike["info"] | undefined {
  const source = isRecord(message.info) ? message.info : message
  const info = { ...source } as SessionMessageLike["info"]
  const keys = Object.keys(info ?? {})
  return keys.length > 0 ? info : undefined
}

function readMessageParts(api: TuiPluginApi, messageID: string | undefined): unknown {
  if (!messageID) return undefined
  const stateWithParts = api.state as { part?: (messageID: string) => unknown }
  return stateWithParts.part?.(messageID)
}

function normalizeParts(input: unknown): Array<Record<string, unknown>> {
  return Array.isArray(input) ? input.filter(isRecord) : []
}

function normalizeTodos(input: unknown): SessionTodoLike[] {
  if (!Array.isArray(input)) return []
  return input.filter(isRecord).map((todo) => ({
    id: typeof todo.id === "string" ? todo.id : undefined,
    status: typeof todo.status === "string" ? todo.status : undefined,
    content: typeof todo.content === "string" ? todo.content : undefined,
  }))
}

function normalizeDiff(input: unknown): SessionDiffLike[] {
  if (!Array.isArray(input)) return []
  return input.filter(isRecord).map((diff) => ({
    file: typeof diff.file === "string" ? diff.file : undefined,
    added: typeof diff.added === "number" ? diff.added : undefined,
    removed: typeof diff.removed === "number" ? diff.removed : undefined,
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

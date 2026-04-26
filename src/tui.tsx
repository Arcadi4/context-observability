/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"

import { getObservationBridge } from "./server/bridge"
import { buildSessionSummary } from "./shared/session-summary"
import type { SessionDiffLike, SessionMessageLike, SessionObservationRecord, SessionSnapshot, SessionTodoLike } from "./shared/types"
import { ContextObservabilityDialog } from "./tui/dialog"

const tui: TuiPlugin = async (api, options) => {
  const commandName = typeof options?.commandName === "string" ? options.commandName : "context"
  const bridge = getObservationBridge()

  api.command.register(() => [
    {
      title: "Context Observability",
      value: `${commandName}.overview`,
      category: "Context",
      slash: {
        name: commandName,
      },
      onSelect() {
        const sessionID = readSessionID(api)
        const fallbackRecord = buildTuiFallbackRecord(api, sessionID)
        api.ui.dialog.replace(() => (
          <ContextObservabilityDialog commandName={commandName} sessionID={sessionID} bridge={bridge} fallbackRecord={fallbackRecord} />
        ))
      },
    },
  ])
}

function readSessionID(api: TuiPluginApi): string {
  const current = api.route.current
  if (current.name !== "session") return ""
  return typeof current.params?.sessionID === "string" ? current.params.sessionID : ""
}

function buildTuiFallbackRecord(api: TuiPluginApi, sessionID: string): SessionObservationRecord | null {
  if (!sessionID) return null

  const snapshot: SessionSnapshot = {
    session: {
      id: sessionID,
      title: null,
      workspaceID: null,
    },
    messages: normalizeMessages(api.state.session.messages(sessionID)),
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

function normalizeMessages(input: unknown): SessionMessageLike[] {
  if (!Array.isArray(input)) return []
  return input.filter(isRecord).map((message) => ({
    info: isRecord(message.info)
      ? {
          id: typeof message.info.id === "string" ? message.info.id : undefined,
          role: typeof message.info.role === "string" ? message.info.role : undefined,
        }
      : undefined,
    parts: Array.isArray(message.parts) ? message.parts.filter(isRecord) : [],
  }))
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

const plugin: TuiPluginModule & { id: string } = {
  id: "context-observability",
  tui,
}

export default plugin

/** @jsxImportSource @opentui/solid */
import type { JSX } from "@opentui/solid"

import type { CaptureStatus } from "../shared/types"
import type { ObservationBridge } from "../server/bridge"

type ContextObservabilityDialogProps = {
  commandName: string
  sessionID: string
  bridge: ObservationBridge
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  if (isNaN(then)) return isoString
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return new Date(isoString).toISOString().slice(0, 16).replace("T", " ")
}

function statusLabel(status: CaptureStatus): string {
  switch (status) {
    case "fresh": return "[fresh]"
    case "partial": return "[partial]"
    case "degraded": return "[degraded]"
    case "error": return "[error]"
    case "disabled": return "[disabled]"
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + "…"
}

export function ContextObservabilityDialog(props: ContextObservabilityDialogProps): JSX.Element {
  const record = props.sessionID ? props.bridge.getCurrentRecord(props.sessionID) : null

  if (!record) {
    return (
      <box flexDirection="column" padding={1} gap={1} minWidth={72}>
        <text>Context Observability — /{props.commandName}</text>
        <text>Session: {props.sessionID || "(none)"}</text>
        <text>No observation data yet. Run a command or wait for an event to trigger capture.</text>
      </box>
    )
  }

  const { summary, captureMetadata } = record
  const title = summary.title || props.sessionID || "(unknown)"
  const status = statusLabel(captureMetadata.status)
  const capturedAt = formatRelativeTime(captureMetadata.capturedAt)
  const source = captureMetadata.source

  if (captureMetadata.status === "disabled") {
    return (
      <box flexDirection="column" padding={1} gap={1} minWidth={72}>
        <text>Context Observability — /{props.commandName}</text>
        <text>Session: {title}</text>
        <text>Capture is disabled in plugin configuration.</text>
      </box>
    )
  }

  if (captureMetadata.status === "error") {
    return (
      <box flexDirection="column" padding={1} gap={1} minWidth={72}>
        <text>Context Observability — /{props.commandName}</text>
        <text>Session: {title}</text>
        <text>Capture failed {status}  Source: {source}  At: {capturedAt}</text>
        {captureMetadata.errorMessage
          ? <text>Error: {captureMetadata.errorMessage}</text>
          : <text>Error: capture encountered an unknown failure.</text>}
      </box>
    )
  }

  // Warning banner for partial or degraded
  const warningBanner: JSX.Element | null =
    captureMetadata.status === "partial"
      ? <text>⚠ Partial capture — some data may be missing</text>
      : captureMetadata.status === "degraded"
        ? <text>⚠ Degraded capture — data may be stale or incomplete</text>
        : null

  const msgLine = `Messages: ${summary.messageCount}  Tool calls: ${summary.toolCallCount}`
  const todoLine = `Todos: ${summary.todo.total} total  ${summary.todo.completed} done  ${summary.todo.pending} pending`
  const diffLine = `Diff: ${summary.diff.files} file${summary.diff.files !== 1 ? "s" : ""}  +${summary.diff.added} -${summary.diff.removed}`
  const lastUser = summary.lastUserText ? truncate(summary.lastUserText, 80) : "(none)"

  return (
    <box flexDirection="column" padding={1} gap={1} minWidth={72}>
      <text>Context Observability — /{props.commandName}</text>
      <text>Session: {title}</text>
      {warningBanner}
      <text>Status: {status}  Source: {source}  Captured: {capturedAt}</text>
      {captureMetadata.errorMessage ? <text>Error: {captureMetadata.errorMessage}</text> : null}
      <text>{msgLine}</text>
      <text>{todoLine}</text>
      <text>{diffLine}</text>
      <text>Last user: {lastUser}</text>
    </box>
  )
}

/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js"
import type { JSX } from "@opentui/solid"
import { useKeyboard } from "@opentui/solid"

import type { CaptureStatus, SessionObservationRecord } from "../shared/types"
import type { ObservationBridge } from "../server/bridge"

type View = "overview" | "messages" | "todos" | "diff" | "metadata"

type ContextObservabilityDialogProps = {
  commandName: string
  sessionID: string
  bridge: ObservationBridge
  fallbackRecord?: SessionObservationRecord | null
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

function extractTextFromParts(parts: Array<Record<string, unknown>>): string {
  for (const part of parts) {
    if (typeof part["text"] === "string" && part["text"].length > 0) {
      return part["text"]
    }
  }
  return ""
}

export function ContextObservabilityDialog(props: ContextObservabilityDialogProps): JSX.Element {
  const [view, setView] = createSignal<View>("overview")

  useKeyboard((key) => {
    if (view() === "overview") {
      if (key.name === "m") setView("messages")
      else if (key.name === "t") setView("todos")
      else if (key.name === "d") setView("diff")
      else if (key.name === "i") setView("metadata")
    } else {
      if (key.name === "o") setView("overview")
    }
  })

  const record = props.sessionID ? props.bridge.getCurrentRecord(props.sessionID) ?? props.fallbackRecord ?? null : props.fallbackRecord ?? null

  if (!record) {
    return (
      <box flexDirection="column" padding={1} gap={1} minWidth={72}>
        <text>Context Observability — /{props.commandName}</text>
        <text>Session: {props.sessionID || "(none)"}</text>
        <text>No observation data yet. Run a command or wait for an event to trigger capture.</text>
      </box>
    )
  }

  const { summary, snapshot, captureMetadata } = record
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

  const warningBanner: JSX.Element | null =
    captureMetadata.status === "partial"
      ? <text>⚠ Partial capture — some data may be missing</text>
      : captureMetadata.status === "degraded"
        ? <text>⚠ Degraded capture — data may be stale or incomplete</text>
        : null

  return (
    <box flexDirection="column" padding={1} gap={1} minWidth={72}>
      {() => {
        const currentView = view()

        if (currentView === "overview") {
          const msgLine = `Messages: ${summary.messageCount}  Tool calls: ${summary.toolCallCount}`
          const todoLine = `Todos: ${summary.todo.total} total  ${summary.todo.completed} done  ${summary.todo.pending} pending`
          const diffLine = `Diff: ${summary.diff.files} file${summary.diff.files !== 1 ? "s" : ""}  +${summary.diff.added} -${summary.diff.removed}`
          const lastUser = summary.lastUserText ? truncate(summary.lastUserText, 80) : "(none)"

          return (
            <>
              <text>Context Observability — /{props.commandName}</text>
              <text>Session: {title}</text>
              {warningBanner}
              <text>Status: {status}  Source: {source}  Captured: {capturedAt}</text>
              {captureMetadata.errorMessage ? <text>Error: {captureMetadata.errorMessage}</text> : null}
              <text>{msgLine}</text>
              <text>{todoLine}</text>
              <text>{diffLine}</text>
              <text>Last user: {lastUser}</text>
              <text>[m]essages  [t]odos  [d]iff  [i]nfo</text>
            </>
          )
        }

        if (currentView === "messages") {
          const msgs = snapshot.messages
          return (
            <>
              <text>Messages ({msgs.length})</text>
              {msgs.length === 0
                ? <text>(none)</text>
                : msgs.map((msg) => {
                    const role = msg.info?.role ?? "unknown"
                    const text = msg.parts ? truncate(extractTextFromParts(msg.parts), 72) : ""
                    return <text>{role}: {text || "(no text)"}</text>
                  })
              }
              <text>[o]verview</text>
            </>
          )
        }

        if (currentView === "todos") {
          const todos = snapshot.todo
          return (
            <>
              <text>Todos ({todos.length})</text>
              {todos.length === 0
                ? <text>(none)</text>
                : todos.map((todo) => {
                    const todoStatus = todo.status ?? "?"
                    const content = todo.content ? truncate(todo.content, 68) : "(no content)"
                    return <text>[{todoStatus}] {content}</text>
                  })
              }
              <text>[o]verview</text>
            </>
          )
        }

        if (currentView === "diff") {
          const diffs = snapshot.diff
          return (
            <>
              <text>Changed files ({diffs.length})</text>
              {diffs.length === 0
                ? <text>(none)</text>
                : diffs.map((d) => {
                    const file = d.file ?? "(unknown)"
                    const added = d.added ?? 0
                    const removed = d.removed ?? 0
                    return <text>{truncate(file, 56)}  +{added} -{removed}</text>
                  })
              }
              <text>[o]verview</text>
            </>
          )
        }

        const meta = captureMetadata
        return (
          <>
            <text>Capture Metadata</text>
            <text>Status:     {meta.status}</text>
            <text>Source:     {meta.source}</text>
            <text>Captured:   {meta.capturedAt}</text>
            <text>Partial:    {String(meta.partial)}</text>
            {meta.errorMessage ? <text>Error:      {meta.errorMessage}</text> : null}
            <text>[o]verview</text>
          </>
        )
      }}
    </box>
  )
}

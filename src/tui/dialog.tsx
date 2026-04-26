/** @jsxImportSource @opentui/solid */
import { createSignal, createMemo } from "solid-js"
import type { JSX } from "@opentui/solid"
import { useKeyboard } from "@opentui/solid"

import type { CaptureStatus, SessionObservationRecord, ContextItem } from "../shared/types"
import type { ObservationBridge } from "../server/bridge"
import { formatTokenCount } from "../shared/token-counter"
import { transformMessagesToContextItems, transformDiffToContextItems } from "./transform-messages"
import { ContextItemList } from "./context-item-list"

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
  return text.slice(0, max - 1) + "..."
}

export function ContextObservabilityDialog(props: ContextObservabilityDialogProps): JSX.Element {
  const [selectedSection, setSelectedSection] = createSignal<"all" | "messages" | "files">("all")

  const record = props.sessionID
    ? props.bridge.getCurrentRecord(props.sessionID) ?? props.fallbackRecord ?? null
    : props.fallbackRecord ?? null

  const contextItems = createMemo<ContextItem[]>(() => {
    if (!record) return []

    const items: ContextItem[] = []
    items.push(...transformMessagesToContextItems(record.snapshot.messages))
    items.push(...transformDiffToContextItems(record.snapshot.diff))
    return items
  })

  const filteredItems = createMemo(() => {
    const items = contextItems()
    if (selectedSection() === "all") return items
    if (selectedSection() === "messages") return items.filter((i) => i.type !== "file")
    if (selectedSection() === "files") return items.filter((i) => i.type === "file")
    return items
  })

  const totalTokens = createMemo(() => {
    return contextItems().reduce((sum, item) => sum + item.tokens, 0)
  })

  useKeyboard((key) => {
    if (key.name === "1") setSelectedSection("all")
    else if (key.name === "2") setSelectedSection("messages")
    else if (key.name === "3") setSelectedSection("files")
    else if (key.name === "q" || key.name === "escape") {
    }
  })

  if (!record) {
    return (
      <box flexDirection="column" padding={1} gap={1} minWidth={72}>
        <text>Context Observability</text>
        <text>Session: {props.sessionID || "(none)"}</text>
        <text>No observation data yet.</text>
      </box>
    )
  }

  const { summary, captureMetadata } = record
  const title = summary.title || props.sessionID || "(unknown)"
  const status = statusLabel(captureMetadata.status)
  const capturedAt = formatRelativeTime(captureMetadata.capturedAt)
  const tokens = formatTokenCount(totalTokens())
  const items = summary.messageCount
  const tools = summary.toolCallCount
  const files = summary.diff.files

  return (
    <box flexDirection="column" padding={1} gap={1} minWidth={80} minHeight={24}>
      <box flexDirection="column" borderStyle="single" padding={1}>
        <text>Context Observability /{props.commandName}</text>
        <text>Session: {truncate(title, 50)}</text>
        <text>Status: {status} Captured: {capturedAt}</text>
        <text>Tokens: {tokens} | Items: {items} | Tools: {tools} | Files: {files}</text>
      </box>

      <box flexDirection="row" gap={2}>
        <text>[1] All [2] Messages [3] Files</text>
      </box>

      <box flexGrow={1} borderStyle="single" padding={1}>
        <ContextItemList
          items={filteredItems()}
          onSelect={(item) => {
            console.log("Selected:", item)
          }}
        />
      </box>

      <box flexDirection="row" gap={2}>
        <text>[j/k] Navigate [1/2/3] Filter [Q] Quit</text>
      </box>
    </box>
  )
}
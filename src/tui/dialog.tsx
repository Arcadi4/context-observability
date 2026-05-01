/** @jsxImportSource @opentui/solid */
import { createSignal, createMemo } from "solid-js"
import type { JSX } from "@opentui/solid"
import { useKeyboard } from "@opentui/solid"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

import type { CaptureStatus, SessionObservationRecord, ContextItem } from "../shared/types"
import type { ObservationBridge } from "../server/bridge"
import { formatTokenCount } from "../shared/token-counter"
import { transformMessagesToContextItems, transformDiffToContextItems, transformApiCallsToContextItems } from "./transform-messages"

type ContextObservabilityDialogProps = {
  commandName: string
  sessionID: string
  bridge: ObservationBridge
  fallbackRecord?: SessionObservationRecord | null
  api: TuiPluginApi
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

function getItemIcon(type: ContextItem["type"]): string {
  switch (type) {
    case "user": return "👤"
    case "assistant": return "🤖"
    case "tool": return "🔧"
    case "file": return "📄"
    case "system": return "⚙️"
    case "api-call": return "🌐"
    default: return "•"
  }
}

function itemCategory(type: ContextItem["type"]): string {
  if (type === "file") return "files"
  if (type === "api-call") return "api"
  return "messages"
}

export function ContextObservabilityDialog(props: ContextObservabilityDialogProps): JSX.Element {
  const [selectedSection, setSelectedSection] = createSignal<"all" | "messages" | "files" | "api">("all")
  const [selectedItemID, setSelectedItemID] = createSignal<string | undefined>()

  const record = props.sessionID
    ? props.bridge.getCurrentRecord(props.sessionID) ?? props.fallbackRecord ?? null
    : props.fallbackRecord ?? null

  const contextItems = createMemo<ContextItem[]>(() => {
    if (!record) return []

    const items: ContextItem[] = []
    items.push(...transformMessagesToContextItems(record.snapshot.messages))
    items.push(...transformDiffToContextItems(record.snapshot.diff))
    if (record.snapshot.apiCalls) {
      items.push(...transformApiCallsToContextItems(record.snapshot.apiCalls))
    }
    return items
  })

  const filteredItems = createMemo(() => {
    const items = contextItems()
    if (selectedSection() === "all") return items
    if (selectedSection() === "messages") return items.filter((i) => i.type !== "file" && i.type !== "api-call")
    if (selectedSection() === "files") return items.filter((i) => i.type === "file")
    if (selectedSection() === "api") return items.filter((i) => i.type === "api-call")
    return items
  })

  const totalTokens = createMemo(() => {
    return contextItems().reduce((sum, item) => sum + item.tokens, 0)
  })

  const dialogSelectOptions = createMemo(() =>
    filteredItems().map((item) => ({
      title: `${getItemIcon(item.type)} ${item.type.toUpperCase()} ${truncate(item.title, 40)}`,
      value: item.id,
      description: item.preview,
      footer: formatTokenCount(item.tokens),
      category: itemCategory(item.type),
    }))
  )

  const moveSelectedItem = (direction: number) => {
    const options = dialogSelectOptions()
    if (options.length === 0) return
    const currentIndex = options.findIndex((option) => option.value === selectedItemID())
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + options.length) % options.length
    setSelectedItemID(options[nextIndex]?.value)
  }

  useKeyboard((key) => {
    if (key.name === "1") {
      key.preventDefault()
      key.stopPropagation()
      setSelectedSection("all")
    } else if (key.name === "2") {
      key.preventDefault()
      key.stopPropagation()
      setSelectedSection("messages")
    } else if (key.name === "3") {
      key.preventDefault()
      key.stopPropagation()
      setSelectedSection("files")
    } else if (key.name === "4") {
      key.preventDefault()
      key.stopPropagation()
      setSelectedSection("api")
    } else if (key.name === "j") {
      key.preventDefault()
      key.stopPropagation()
      moveSelectedItem(1)
    } else if (key.name === "k") {
      key.preventDefault()
      key.stopPropagation()
      moveSelectedItem(-1)
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

  const DialogSelect = props.api.ui.DialogSelect

  return (
    <box flexDirection="column" padding={1} gap={1} minWidth={80} minHeight={24}>
      <box flexDirection="column" borderStyle="single" padding={1}>
        <text>Context Observability /{props.commandName}</text>
        <text>Session: {truncate(title, 50)}</text>
        <text>Status: {status} Captured: {capturedAt}</text>
        <text>Tokens: {tokens} | Items: {items} | Tools: {tools} | Files: {files}</text>
      </box>

      <box flexDirection="row" gap={2}>
        <text fg={selectedSection() === "all" ? "cyan" : undefined}>[1] All</text>
        <text fg={selectedSection() === "messages" ? "cyan" : undefined}>[2] Messages</text>
        <text fg={selectedSection() === "files" ? "cyan" : undefined}>[3] Files</text>
        <text fg={selectedSection() === "api" ? "cyan" : undefined}>[4] API</text>
      </box>

      <box flexGrow={1}>
        <DialogSelect
          title="Context Items"
          options={dialogSelectOptions()}
          current={selectedItemID()}
          skipFilter={true}
          onMove={(option) => setSelectedItemID(option.value)}
          onSelect={() => {}}
        />
      </box>

      <box flexDirection="row" gap={2}>
        <text>[↑/↓j/k] Navigate</text>
        <text>[Enter] Select</text>
        <text>[1/2/3/4] Filter</text>
        <text>[esc] Quit</text>
      </box>
    </box>
  )
}

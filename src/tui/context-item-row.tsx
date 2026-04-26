/** @jsxImportSource @opentui/solid */
import type { JSX } from "@opentui/solid"

import type { ContextItem } from "../shared/types"
import { formatTokenCount } from "../shared/token-counter"

type ContextItemRowProps = {
  item: ContextItem
  isSelected?: boolean
}

function getItemIcon(type: ContextItem["type"]): string {
  switch (type) {
    case "user": return "👤"
    case "assistant": return "🤖"
    case "tool": return "🔧"
    case "file": return "📄"
    case "system": return "⚙️"
    default: return "•"
  }
}

function getTypeLabel(type: ContextItem["type"]): string {
  return type.toUpperCase()
}

export function ContextItemRow(props: ContextItemRowProps): JSX.Element {
  const icon = getItemIcon(props.item.type)
  const label = getTypeLabel(props.item.type)
  const tokens = formatTokenCount(props.item.tokens)
  const title = props.item.title.slice(0, 40)
  const selected = props.isSelected ?? false

  return (
    <box
      flexDirection="row"
      gap={1}
      padding={1}
      borderStyle={selected ? "single" : undefined}
      borderColor={selected ? "cyan" : undefined}
    >
      <text fg={selected ? "cyan" : undefined}>{icon}</text>
      <text fg={selected ? "cyan" : undefined}>{label}</text>
      <text fg={selected ? "cyan" : undefined} flexGrow={1}>{title}</text>
      <text fg={selected ? "cyan" : undefined}>{tokens}</text>
    </box>
  )
}
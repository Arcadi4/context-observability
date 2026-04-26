/** @jsxImportSource @opentui/solid */
import { createSignal, For } from "solid-js"
import type { JSX } from "@opentui/solid"
import { useKeyboard } from "@opentui/solid"

import type { ContextItem } from "../shared/types"
import { ContextItemRow } from "./context-item-row"

type ContextItemListProps = {
  items: ContextItem[]
  onSelect?: (item: ContextItem) => void
}

export function ContextItemList(props: ContextItemListProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  useKeyboard((key) => {
    const current = selectedIndex()
    const total = props.items.length

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex(Math.max(0, current - 1))
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex(Math.min(total - 1, current + 1))
    } else if (key.name === "enter" || key.name === "return") {
      const item = props.items[current]
      if (item && props.onSelect) {
        props.onSelect(item)
      }
    } else if (key.name === "home" || (key.ctrl && key.name === "a")) {
      setSelectedIndex(0)
    } else if (key.name === "end" || (key.ctrl && key.name === "e")) {
      setSelectedIndex(total - 1)
    }
  })

  return (
    <box flexDirection="column" flexGrow={1} overflow="hidden">
      <For each={props.items}>
        {(item, index) => (
          <ContextItemRow
            item={item}
            isSelected={index() === selectedIndex()}
          />
        )}
      </For>
    </box>
  )
}
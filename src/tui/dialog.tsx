/** @jsxImportSource @opentui/solid */
import type { JSX } from "@opentui/solid"

type ContextObservabilityDialogProps = {
  commandName: string
}

export function ContextObservabilityDialog(props: ContextObservabilityDialogProps): JSX.Element {
  return (
    <box flexDirection="column" padding={1} gap={1} minWidth={72}>
      <text>Context Observability</text>
      <text>This is the thin TUI shell. The server plugin is responsible for collecting the more truthful session snapshot.</text>
      <text>
        Next step: replace this placeholder with a session overview assembled from server-captured observation records.
      </text>
      <text>
        Command: /{props.commandName}
      </text>
    </box>
  )
}

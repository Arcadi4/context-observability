/** @jsxImportSource @opentui/solid */
import type { JSX } from "@opentui/solid"

import type { ObservationBridge } from "../server/bridge"

type ContextObservabilityDialogProps = {
  commandName: string
  sessionID: string
  bridge: ObservationBridge
}

export function ContextObservabilityDialog(props: ContextObservabilityDialogProps): JSX.Element {
  const currentRecord = props.sessionID ? props.bridge.getCurrentRecord(props.sessionID) : null
  const recentSessions = props.bridge.getRecentSummaries(5)

  return (
    <box flexDirection="column" padding={1} gap={1} minWidth={72}>
      <text>Context Observability</text>
      <text>This is the thin TUI shell. The server plugin is responsible for collecting the more truthful session snapshot.</text>
      <text>
        Next step: replace this placeholder with a session overview assembled from server-captured observation records.
      </text>
      <text>Session: {props.sessionID || "(none)"}</text>
      <text>Bridge current record: {currentRecord ? "available" : "missing"}</text>
      <text>Bridge recent summaries: {recentSessions.length}</text>
      <text>
        Command: /{props.commandName}
      </text>
    </box>
  )
}

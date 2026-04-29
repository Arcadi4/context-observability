/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"

import { getObservationBridge } from "./server/bridge"
import { buildTuiFallbackRecord } from "./tui/fallback-record"
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
          <ContextObservabilityDialog commandName={commandName} sessionID={sessionID} bridge={bridge} fallbackRecord={fallbackRecord} api={api} />
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

const plugin: TuiPluginModule & { id: string } = {
  id: "context-observability",
  tui,
}

export default plugin

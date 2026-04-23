/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"

import { getObservationBridge } from "./server/bridge"
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
        api.ui.dialog.replace(() => <ContextObservabilityDialog commandName={commandName} sessionID={sessionID} bridge={bridge} />)
      },
    },
  ])
}

function readSessionID(api: unknown): string {
  if (!api || typeof api !== "object") return ""

  const candidate = api as {
    sessionID?: unknown
    session?: {
      id?: unknown
      sessionID?: unknown
    }
  }

  if (typeof candidate.sessionID === "string") return candidate.sessionID
  if (typeof candidate.session?.id === "string") return candidate.session.id
  if (typeof candidate.session?.sessionID === "string") return candidate.session.sessionID

  return ""
}

const plugin: TuiPluginModule & { id: string } = {
  id: "context-observability",
  tui,
}

export default plugin

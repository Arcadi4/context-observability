/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"

import { ContextObservabilityDialog } from "./tui/dialog"

const tui: TuiPlugin = async (api, options) => {
  const commandName = typeof options?.commandName === "string" ? options.commandName : "context"

  api.command.register(() => [
    {
      title: "Context Observability",
      value: `${commandName}.overview`,
      category: "Context",
      slash: {
        name: commandName,
      },
      onSelect() {
        api.ui.dialog.replace(() => <ContextObservabilityDialog commandName={commandName} />)
      },
    },
  ])
}

const plugin: TuiPluginModule & { id: string } = {
  id: "context-observability",
  tui,
}

export default plugin

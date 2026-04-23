import type { Config, Hooks, Plugin, PluginModule } from "@opencode-ai/plugin"

import { resolveOptions } from "./server/options"
import { observeSession } from "./server/runtime"
import type { ObservabilityPluginOptions } from "./shared/types"

export const pluginId = "context-observability"

const server: Plugin = async (input, rawOptions) => {
  const options = resolveOptions(rawOptions as ObservabilityPluginOptions | undefined)

  const ensureObservation = async (sessionID: string) => {
    await observeSession({
      client: {
        get: (targetSessionID) => input.client.session.get({ path: { id: targetSessionID } }),
        messages: ({ sessionID: targetSessionID, limit }) => input.client.session.messages({ path: { id: targetSessionID }, query: { limit } }),
        todo: ({ sessionID: targetSessionID }) => input.client.session.todo({ path: { id: targetSessionID } }),
        diff: ({ sessionID: targetSessionID }) => input.client.session.diff({ path: { id: targetSessionID } }),
      },
      sessionID,
      maxMessages: options.maxMessages,
      includeDiff: options.includeDiff,
      includeTodos: options.includeTodos,
    })
  }

  const hooks: Hooks = {
    async config(config: Config) {
      const commandName = options.commandName
      config.command ??= {}
      if (!config.command[commandName]) {
        config.command[commandName] = {
          template: options.commandTemplate,
          description: "Open the context observability overview for the current session.",
        }
      }
    },
    async event({ event }) {
      const sessionID = readSessionID(event)
      if (!sessionID) return
      await ensureObservation(sessionID)
    },
    async "command.execute.before"(command, output) {
      if (command.command !== options.commandName) return
      await ensureObservation(command.sessionID)
    },
    async "experimental.chat.messages.transform"(_input, output) {
      if (!options.capture.experimentalMessagesTransform) return
      const toolParts = output.messages.flatMap((message) => message.parts).filter((part) => part.type === "tool")
      if (toolParts.length === 0) return
    },
    async "experimental.session.compacting"(input, output) {
      if (!options.capture.sessionCompaction) return
      await ensureObservation(input.sessionID)
      output.context.push("Context observability plugin captured a fresh pre-compaction snapshot for this session.")
    },
    async "tool.execute.after"(input) {
      if (!options.capture.toolExecutions) return
      await ensureObservation(input.sessionID)
    },
  }

  return hooks
}

function readSessionID(event: unknown): string | null {
  if (!event || typeof event !== "object") return null
  const candidate = (event as Record<string, unknown>).sessionID
  return typeof candidate === "string" ? candidate : null
}

const plugin: PluginModule & { id: string } = {
  id: pluginId,
  server,
}

export default plugin

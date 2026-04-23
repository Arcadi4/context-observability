import type { Config, Hooks, Plugin, PluginModule } from "@opencode-ai/plugin"

import { resolveOptions } from "./server/options"
import { observeSession } from "./server/runtime"
import type { CaptureSource, ObservabilityPluginOptions } from "./shared/types"

export const pluginId = "context-observability"

const server: Plugin = async (input, rawOptions) => {
  const options = resolveOptions(rawOptions as ObservabilityPluginOptions | undefined)

  const ensureObservation = async (sessionID: string, source: CaptureSource) => {
    await observeSession({
      client: {
        get: (targetSessionID) => input.client.session.get({ path: { id: targetSessionID } }),
        messages: ({ sessionID: targetSessionID, limit }) => input.client.session.messages({ path: { id: targetSessionID }, query: { limit } }),
        todo: ({ sessionID: targetSessionID }) => input.client.session.todo({ path: { id: targetSessionID } }),
        diff: ({ sessionID: targetSessionID }) => input.client.session.diff({ path: { id: targetSessionID } }),
      },
      sessionID,
      maxMessages: options.maxMessages,
      maxRecentSessions: options.maxRecentSessions,
      includeDiff: options.includeDiff,
      includeTodos: options.includeTodos,
      source,
    })
  }

  const logHookFailure = (hook: string, error: unknown, experimental: boolean) => {
    const message = error instanceof Error ? error.message : String(error)
    if (experimental) {
      if (options.capture.onExperimentalFailure === "warn") {
        console.warn(`[${pluginId}] ${hook} capture failed: ${message}`)
      }
      return
    }

    console.warn(`[${pluginId}] ${hook} capture failed: ${message}`)
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
      try {
        const sessionID = readSessionID(event)
        if (!sessionID) return
        await ensureObservation(sessionID, "event")
      } catch (error) {
        logHookFailure("event", error, false)
      }
    },
    async "command.execute.before"(command, output) {
      try {
        if (command.command !== options.commandName) return
        await ensureObservation(command.sessionID, "command")
      } catch (error) {
        logHookFailure("command.execute.before", error, false)
      }
    },
    async "experimental.chat.messages.transform"(_input, output) {
      try {
        if (!options.capture.experimentalMessagesTransform) return
        // Intentionally a no-op for now: tool-part counting exploration started here,
        // but capture should remain centralized in observeSession() until this hook has a clear use.
        void output
      } catch (error) {
        logHookFailure("experimental.chat.messages.transform", error, true)
      }
    },
    async "experimental.session.compacting"(input, output) {
      try {
        if (!options.capture.sessionCompaction) return
        await ensureObservation(input.sessionID, "compaction")
        output.context.push("Context observability plugin captured a fresh pre-compaction snapshot for this session.")
      } catch (error) {
        logHookFailure("experimental.session.compacting", error, true)
      }
    },
    async "tool.execute.after"(input) {
      try {
        if (!options.capture.toolExecutions) return
        await ensureObservation(input.sessionID, "tool")
      } catch (error) {
        logHookFailure("tool.execute.after", error, false)
      }
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

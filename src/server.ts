import type { Hooks, Plugin, PluginModule } from "@opencode-ai/plugin"

import { createApiCallTruthStore, type InternalApiCallRecord } from "./server/api-call-truth-store"
import { resolveOptions } from "./server/options"
import { installGlobalProbe, wrapChatParamsFetch, type ProbeHandle } from "./server/probe"
import { markSessionDisabled, observeSession } from "./server/runtime"
import type { CaptureSource, ObservabilityPluginOptions, CapturedApiCallFact } from "./shared/types"

export const pluginId = "context-observability"

let globalProbeHandle: ProbeHandle | null = null
let globalTruthStore: ReturnType<typeof createApiCallTruthStore> | null = null

const server: Plugin = async (input, rawOptions) => {
  const options = resolveOptions(rawOptions as ObservabilityPluginOptions | undefined)

  const isCaptureDisabled = !options.capture.sessionCompaction &&
    !options.capture.toolExecutions &&
    !options.capture.experimentalMessagesTransform

  if (!globalTruthStore) {
    globalTruthStore = createApiCallTruthStore()
  }

  if (!globalProbeHandle) {
    try {
      globalProbeHandle = installGlobalProbe({
        onCapture: (fact: CapturedApiCallFact) => {
          if (!globalTruthStore) return

          const record: InternalApiCallRecord = {
            timestamp: Date.now(),
            url: fact.url,
            host: new URL(fact.url).hostname,
            method: fact.method,
            provider: fact.provider,
            bodyShape: fact.bodyShape,
            bodyPreview: typeof fact.body === "string" ? fact.body.slice(0, 1024) : null,
            bodyTruncated: false,
            originalBodyBytes: typeof fact.body === "string" ? fact.body.length : null,
            sessionID: fact.sessionID ?? null,
            source: fact.source,
            timing: {
              startTime: new Date(fact.capturedAt).getTime(),
            },
            dedupeID: fact.id,
            sequence: Date.now(),
          }

          try {
            globalTruthStore.capture(record)
          } catch {
            void 0
          }
        },
      })
    } catch {
      void 0
    }
  }

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
    async event({ event }) {
      try {
        const sessionID = readSessionID(event)
        if (!sessionID) return
        if (isCaptureDisabled) {
          markSessionDisabled(sessionID, options.maxRecentSessions)
          return
        }
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
    async "chat.params"(chatInput, output) {
      try {
        const sessionID = chatInput.sessionID

        if (globalProbeHandle && globalTruthStore) {
          const originalFetch = output.options.fetch ?? globalThis.fetch

          output.options.fetch = wrapChatParamsFetch(originalFetch, {
            sessionID,
            onCapture: (fact: CapturedApiCallFact) => {
              if (!globalTruthStore) return

              const record: InternalApiCallRecord = {
                timestamp: Date.now(),
                url: fact.url,
                host: new URL(fact.url).hostname,
                method: fact.method,
                provider: fact.provider,
                bodyShape: fact.bodyShape,
                bodyPreview: typeof fact.body === "string" ? fact.body.slice(0, 1024) : null,
                bodyTruncated: false,
                originalBodyBytes: typeof fact.body === "string" ? fact.body.length : null,
                sessionID: fact.sessionID ?? sessionID ?? null,
                source: fact.source,
                timing: {
                  startTime: new Date(fact.capturedAt).getTime(),
                },
                dedupeID: fact.id,
                sequence: Date.now(),
              }

              try {
                globalTruthStore.capture(record)
              } catch {
                void 0
              }
            },
          })
        }
      } catch (error) {
        logHookFailure("chat.params", error, false)
      }
    },
    async "chat.headers"(chatInput, output) {
      try {
        const sessionID = chatInput.sessionID
        if (sessionID) {
          output.headers["x-opencode-session"] = sessionID
        }
      } catch (error) {
        logHookFailure("chat.headers", error, false)
      }
    },
    async "experimental.chat.messages.transform"(_input, output) {
      try {
        if (!options.capture.experimentalMessagesTransform) return
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
  const eventRecord = event as Record<string, unknown>
  const candidate = eventRecord.sessionID
  if (typeof candidate === "string") return candidate

  const properties = eventRecord.properties
  if (!properties || typeof properties !== "object") return null
  const nestedCandidate = (properties as Record<string, unknown>).sessionID
  return typeof nestedCandidate === "string" ? nestedCandidate : null
}

const plugin: PluginModule & { id: string } = {
  id: pluginId,
  server,
}

export default plugin

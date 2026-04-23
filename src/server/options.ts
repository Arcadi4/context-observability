import type { ObservabilityPluginOptions } from "../shared/types"

const defaultOptions: Required<ObservabilityPluginOptions> = {
  commandName: "context",
  commandTemplate: "/context $ARGUMENTS",
  maxMessages: 100,
  maxRecentSessions: 20,
  includeDiff: true,
  includeTodos: true,
  showDialogByDefault: true,
  capture: {
    experimentalMessagesTransform: true,
    sessionCompaction: true,
    toolExecutions: true,
    onExperimentalFailure: "warn",
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function resolveOptions(options?: ObservabilityPluginOptions): Required<ObservabilityPluginOptions> {
  const raw = {
    ...defaultOptions,
    ...options,
    capture: {
      ...defaultOptions.capture,
      ...options?.capture,
    },
  }

  return {
    ...raw,
    maxMessages: clamp(raw.maxMessages, 1, 500),
    maxRecentSessions: clamp(raw.maxRecentSessions, 1, 100),
  }
}

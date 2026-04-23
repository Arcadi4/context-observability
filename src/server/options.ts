import type { ObservabilityPluginOptions } from "../shared/types"

const defaultOptions: Required<ObservabilityPluginOptions> = {
  commandName: "context",
  commandTemplate: "/context $ARGUMENTS",
  maxMessages: 100,
  includeDiff: true,
  includeTodos: true,
  showDialogByDefault: true,
  capture: {
    experimentalMessagesTransform: true,
    sessionCompaction: true,
    toolExecutions: true,
  },
}

export function resolveOptions(options?: ObservabilityPluginOptions): Required<ObservabilityPluginOptions> {
  return {
    ...defaultOptions,
    ...options,
    capture: {
      ...defaultOptions.capture,
      ...options?.capture,
    },
  }
}

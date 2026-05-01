/**
 * Dual-layer API call probe.
 *
 * Intercepts fetch calls at two levels:
 * 1. globalThis.fetch - catches all outgoing requests
 * 2. chat.params output.options.fetch - catches OpenCode-specific fetch overrides
 *
 * Dedupe prevents double-capture when both layers see the same request.
 * Errors in the probe never break the original fetch call.
 */

import type { ApiCallSource, CapturedApiCallFact } from "../shared/types"

export type TruthStoreCallback = (fact: CapturedApiCallFact) => void | Promise<void>

export type ProbeConfig = {
  sessionID?: string
  onCapture?: TruthStoreCallback
}

export type ProbeHandle = {
  uninstall: () => void
}

/**
 * Install the global fetch probe.
 * Wraps globalThis.fetch to intercept outgoing requests.
 *
 * @returns ProbeHandle with uninstall() to restore original fetch
 */
export function installGlobalProbe(_config: ProbeConfig): ProbeHandle {
  // TODO: Implement global fetch wrapper
  throw new Error("Not implemented")
}

/**
 * Wrap a fetch function for use in chat.params output.options.fetch.
 * Preserves the original fetch behavior while adding capture.
 *
 * @param fetchFn - The original fetch function to wrap
 * @param config - Probe configuration
 * @returns Wrapped fetch function with same signature
 */
export function wrapChatParamsFetch(
  fetchFn: typeof fetch,
  _config: ProbeConfig,
): typeof fetch {
  // TODO: Implement chat.params fetch wrapper
  throw new Error("Not implemented")
}

/**
 * Create a dedupe key for a fetch request.
 * Used to prevent double-capture across probe layers.
 *
 * @param input - fetch RequestInfo (string, URL, or Request)
 * @param init - fetch RequestInit
 * @returns Deterministic dedupe key string
 */
export function createDedupeKey(
  _input: RequestInfo | URL,
  _init?: RequestInit,
): string {
  // TODO: Implement deterministic dedupe key generation
  throw new Error("Not implemented")
}

/**
 * Check if a request targets an AI provider endpoint.
 * Used to filter which requests should be captured.
 *
 * @param url - Request URL
 * @returns true if the request appears to be an AI API call
 */
export function isAiRequest(_url: string | URL | Request): boolean {
  // TODO: Implement AI request detection
  throw new Error("Not implemented")
}

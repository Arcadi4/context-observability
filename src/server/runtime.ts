import { buildSessionSummary } from "../shared/session-summary"
import type { CaptureMetadata, CaptureSource, SessionSnapshot, SessionObservationRecord } from "../shared/types"
import { getSessionObservation, saveSessionObservation } from "./store"

type SessionClient = {
  get: (sessionID: string) => Promise<{ data?: unknown }>
  messages: (input: { sessionID: string; limit?: number }) => Promise<{ data?: unknown }>
  todo?: (input: { sessionID: string }) => Promise<{ data?: unknown }>
  diff?: (input: { sessionID: string }) => Promise<{ data?: unknown }>
}

type FetchInput = {
  client: SessionClient
  sessionID: string
  maxMessages: number
  maxRecentSessions?: number
  includeDiff: boolean
  includeTodos: boolean
}

type ObserveSessionInput = FetchInput & {
  source?: CaptureSource
}

type SettledCallResult =
  | { ok: true; data: unknown }
  | { ok: false; error: Error }

async function settleCall(call: Promise<{ data?: unknown }>): Promise<SettledCallResult> {
  try {
    const result = await call
    return { ok: true, data: result.data }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

function createSuccessfulResult(data: unknown): SettledCallResult {
  return { ok: true, data }
}

async function fetchSessionSnapshotWithMetadata(input: FetchInput): Promise<{
  snapshot: SessionSnapshot
  captureMetadata: Pick<CaptureMetadata, "status" | "partial" | "errorMessage">
}> {
  const [sessionResult, messagesResult, todoResult, diffResult] = await Promise.all([
    settleCall(input.client.get(input.sessionID)),
    settleCall(input.client.messages({ sessionID: input.sessionID, limit: input.maxMessages })),
    input.includeTodos && input.client.todo
      ? settleCall(input.client.todo({ sessionID: input.sessionID }))
      : Promise.resolve(createSuccessfulResult([])),
    input.includeDiff && input.client.diff
      ? settleCall(input.client.diff({ sessionID: input.sessionID }))
      : Promise.resolve(createSuccessfulResult([])),
  ])

  const attemptedCount =
    2 +
    (input.includeTodos && input.client.todo ? 1 : 0) +
    (input.includeDiff && input.client.diff ? 1 : 0)

  const failures = [sessionResult, messagesResult, todoResult, diffResult].filter(
    (result): result is Extract<SettledCallResult, { ok: false }> => !result.ok,
  )

  const errorMessage =
    failures.length > 0
      ? failures
          .map((failure, index) => {
            const message = failure.error.message.trim()
            return message.length > 0 ? message : `Capture request ${index + 1} failed without an error message.`
          })
          .join("; ")
      : undefined

  const captureMetadata: Pick<CaptureMetadata, "status" | "partial" | "errorMessage"> =
    failures.length === 0
      ? { status: "fresh", partial: false }
      : failures.length === attemptedCount
        ? { status: "error", partial: true, errorMessage }
        : { status: "partial", partial: true, errorMessage }

  return {
    snapshot: {
      session: normalizeSession(sessionResult.ok ? sessionResult.data : undefined),
      messages: normalizeArray(messagesResult.ok ? messagesResult.data : undefined),
      todo: normalizeArray(todoResult.ok ? todoResult.data : undefined),
      diff: normalizeArray(diffResult.ok ? diffResult.data : undefined),
    },
    captureMetadata,
  }
}

export async function fetchSessionSnapshot(input: FetchInput): Promise<SessionSnapshot> {
  const { snapshot } = await fetchSessionSnapshotWithMetadata(input)
  return snapshot
}

export async function observeSession(input: ObserveSessionInput): Promise<SessionObservationRecord> {
  const { snapshot, captureMetadata: captureState } = await fetchSessionSnapshotWithMetadata(input)
  const summary = buildSessionSummary(snapshot)
  const captureMetadata: CaptureMetadata = {
    status: captureState.status,
    source: input.source ?? "unknown",
    capturedAt: new Date().toISOString(),
    partial: captureState.partial,
    errorMessage: captureState.errorMessage,
  }
  const record = { snapshot, summary, captureMetadata }
  saveSessionObservation(record, input.maxRecentSessions)
  return record
}

export function markSessionDisabled(sessionID: string, maxRecentSessions?: number): void {
  const emptySnapshot = { messages: [], todo: [], diff: [] }
  const summary = buildSessionSummary(emptySnapshot)
  summary.sessionID = sessionID
  const captureMetadata: CaptureMetadata = {
    status: "disabled",
    source: "unknown",
    capturedAt: new Date().toISOString(),
    partial: false,
  }
  saveSessionObservation({ snapshot: emptySnapshot, summary, captureMetadata }, maxRecentSessions)
}

export function readObservedSession(sessionID: string) {
  return getSessionObservation(sessionID)
}

function normalizeSession(data: unknown) {
  if (!data || typeof data !== "object") return undefined
  const session = data as Record<string, unknown>
  return {
    id: typeof session.id === "string" ? session.id : undefined,
    title: typeof session.title === "string" ? session.title : null,
    workspaceID: typeof session.workspaceID === "string" ? session.workspaceID : null,
  }
}

function normalizeArray(data: unknown) {
  return Array.isArray(data) ? data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : []
}

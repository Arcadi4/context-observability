import { buildSessionSummary } from "../shared/session-summary"
import type { SessionSnapshot, SessionObservationRecord } from "../shared/types"
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
  includeDiff: boolean
  includeTodos: boolean
}

export async function fetchSessionSnapshot(input: FetchInput): Promise<SessionSnapshot> {
  const [sessionResult, messagesResult, todoResult, diffResult] = await Promise.all([
    input.client.get(input.sessionID),
    input.client.messages({ sessionID: input.sessionID, limit: input.maxMessages }),
    input.includeTodos && input.client.todo ? input.client.todo({ sessionID: input.sessionID }) : Promise.resolve({ data: [] }),
    input.includeDiff && input.client.diff ? input.client.diff({ sessionID: input.sessionID }) : Promise.resolve({ data: [] }),
  ])

  return {
    session: normalizeSession(sessionResult.data),
    messages: normalizeArray(messagesResult.data),
    todo: normalizeArray(todoResult.data),
    diff: normalizeArray(diffResult.data),
  }
}

export async function observeSession(input: FetchInput): Promise<SessionObservationRecord> {
  const snapshot = await fetchSessionSnapshot(input)
  const summary = buildSessionSummary(snapshot)
  const record = { snapshot, summary }
  saveSessionObservation(record)
  return record
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

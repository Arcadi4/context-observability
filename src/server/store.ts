import type { SessionObservationRecord } from "../shared/types"

const sessionStore = new Map<string, SessionObservationRecord>()

export function saveSessionObservation(record: SessionObservationRecord) {
  if (!record.summary.sessionID) return
  sessionStore.set(record.summary.sessionID, record)
}

export function getSessionObservation(sessionID: string) {
  return sessionStore.get(sessionID) ?? null
}

export function listObservedSessions() {
  return [...sessionStore.values()].map((item) => item.summary)
}

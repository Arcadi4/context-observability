import type { SessionObservationRecord, SessionSummary } from "../shared/types"

const DEFAULT_MAX_SESSIONS = 20

class BoundedSessionStore {
  private store = new Map<string, SessionObservationRecord>()
  private insertionOrder: string[] = []
  private maxSessions: number

  constructor(maxSessions: number = DEFAULT_MAX_SESSIONS) {
    this.maxSessions = maxSessions
  }

  save(record: SessionObservationRecord, maxSessionsOverride?: number): void {
    if (!record.summary.sessionID) return

    const limit = maxSessionsOverride ?? this.maxSessions
    const sessionID = record.summary.sessionID

    if (this.store.has(sessionID)) {
      this.store.set(sessionID, record)
      const existingIdx = this.insertionOrder.indexOf(sessionID)
      if (existingIdx !== -1) {
        this.insertionOrder.splice(existingIdx, 1)
      }
      this.insertionOrder.push(sessionID)
      return
    }

    while (this.insertionOrder.length >= limit) {
      const oldest = this.insertionOrder.shift()
      if (oldest) {
        this.store.delete(oldest)
      }
    }

    this.store.set(sessionID, record)
    this.insertionOrder.push(sessionID)
  }

  get(sessionID: string): SessionObservationRecord | null {
    return this.store.get(sessionID) ?? null
  }

  listRecent(limit?: number): SessionSummary[] {
    const summaries = [...this.store.values()]
      .map((item) => item.summary)
      .sort((a, b) => {
        const timeA = a.generatedAt ? new Date(a.generatedAt).getTime() : 0
        const timeB = b.generatedAt ? new Date(b.generatedAt).getTime() : 0
        return timeB - timeA
      })

    if (limit !== undefined && limit > 0) {
      return summaries.slice(0, limit)
    }
    return summaries
  }
}

const store = new BoundedSessionStore()

export function saveSessionObservation(record: SessionObservationRecord, maxSessions?: number) {
  store.save(record, maxSessions)
}

export function getSessionObservation(sessionID: string): SessionObservationRecord | null {
  return store.get(sessionID)
}

export function getCurrentSessionObservation(sessionID: string): SessionObservationRecord | null {
  return store.get(sessionID)
}

export function listObservedSessions(limit?: number): SessionSummary[] {
  return store.listRecent(limit)
}

export function listRecentSessions(limit?: number): SessionSummary[] {
  return store.listRecent(limit)
}
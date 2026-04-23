import type { SessionObservationRecord, SessionSummary } from "../shared/types"

import { getCurrentSessionObservation, getSessionObservation, listRecentSessions } from "./store"

export type ObservationBridge = {
  getCurrentRecord: (sessionID: string) => SessionObservationRecord | null
  getRecentSummaries: (limit?: number) => SessionSummary[]
  getSessionDetail: (sessionID: string) => SessionObservationRecord | null
}

export function getObservationBridge(): ObservationBridge {
  return {
    getCurrentRecord: getCurrentSessionObservation,
    getRecentSummaries: listRecentSessions,
    getSessionDetail: getSessionObservation,
  }
}

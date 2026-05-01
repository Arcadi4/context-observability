import type { SessionObservationRecord, SessionSummary, ApiCallRecord } from "../shared/types"

import { getCurrentSessionObservation, getSessionObservation, listRecentSessions } from "./store"
import type { ApiCallTruthStore } from "./api-call-truth-store"
import { toSharedApiCallRecord } from "./api-call-truth-store"

export type ObservationBridge = {
  getCurrentRecord: (sessionID: string) => SessionObservationRecord | null
  getRecentSummaries: (limit?: number) => SessionSummary[]
  getSessionDetail: (sessionID: string) => SessionObservationRecord | null
  getSessionDetailWithApiCalls: (sessionID: string, truthStore: ApiCallTruthStore | null) => SessionObservationRecord | null
  getApiCallsForSession: (sessionID: string, truthStore: ApiCallTruthStore) => ApiCallRecord[]
  getUnknownSessionCalls: (truthStore: ApiCallTruthStore, limit?: number) => ApiCallRecord[]
}

export function getObservationBridge(): ObservationBridge {
  return {
    getCurrentRecord: getCurrentSessionObservation,
    getRecentSummaries: listRecentSessions,
    getSessionDetail: getSessionObservation,
    getSessionDetailWithApiCalls: (sessionID: string, truthStore: ApiCallTruthStore | null): SessionObservationRecord | null => {
      const record = getSessionObservation(sessionID)
      if (!record || !truthStore) {
        return record
      }
      try {
        const internalRecords = truthStore.getAllForSession(sessionID)
        const apiCalls = internalRecords.map(toSharedApiCallRecord)
        return { ...record, apiCalls }
      } catch {
        return record
      }
    },
    getApiCallsForSession: (sessionID: string, truthStore: ApiCallTruthStore): ApiCallRecord[] => {
      try {
        const internalRecords = truthStore.getAllForSession(sessionID)
        return internalRecords.map(toSharedApiCallRecord)
      } catch {
        return []
      }
    },
    getUnknownSessionCalls: (truthStore: ApiCallTruthStore, limit?: number): ApiCallRecord[] => {
      try {
        const internalRecords = truthStore.getUnknownSessionCalls(limit ?? 50)
        return internalRecords.map(toSharedApiCallRecord)
      } catch {
        return []
      }
    },
  }
}

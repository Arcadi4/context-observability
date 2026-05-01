import type { ContextItem, SessionObservationRecord } from "../shared/types"
import { transformMessagesToContextItems, transformDiffToContextItems, transformApiCallsToContextItems } from "./transform-messages"

export function buildContextItems(record: SessionObservationRecord): ContextItem[] {
  const items: ContextItem[] = []
  items.push(...transformMessagesToContextItems(record.snapshot.messages))
  items.push(...transformDiffToContextItems(record.snapshot.diff))
  if (record.snapshot.apiCalls) {
    items.push(...transformApiCallsToContextItems(record.snapshot.apiCalls))
  }
  return items
}

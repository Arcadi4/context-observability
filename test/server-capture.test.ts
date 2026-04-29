import { describe, expect, test } from "bun:test"

import plugin from "../src/server"
import { observeSession, readObservedSession } from "../src/server/runtime"

describe("server session capture", () => {
  test("event capture reads sessionID from event properties", async () => {
    const requestedIDs: string[] = []
    const hooks = await plugin.server({
      client: {
        session: {
          get: async (input: { path: { id: string } }) => {
            requestedIDs.push(input.path.id)
            return { data: { id: input.path.id, title: null, workspaceID: null } }
          },
          messages: async () => ({ data: [] }),
          todo: async () => ({ data: [] }),
          diff: async () => ({ data: [] }),
        },
      },
    } as never, { includeDiff: false, includeTodos: false })

    await hooks.event?.({
      event: {
        type: "session.idle",
        properties: { sessionID: "ses_properties" },
      },
    } as never)

    expect(requestedIDs).toEqual(["ses_properties"])
  })

  test("observeSession saves a partial observation using requested sessionID when metadata fetch fails", async () => {
    const record = await observeSession({
      client: {
        get: async () => {
          throw new Error("session metadata unavailable")
        },
        messages: async () => ({
          data: [
            {
              info: { id: "msg_1", role: "user" },
              parts: [{ type: "text", text: "keep this partial capture" }],
            },
          ],
        }),
      },
      sessionID: "ses_partial_metadata_failure",
      maxMessages: 10,
      maxRecentSessions: 20,
      includeDiff: false,
      includeTodos: false,
      source: "event",
    })

    expect(record.captureMetadata.status).toBe("partial")
    expect(record.summary.sessionID).toBe("ses_partial_metadata_failure")
    expect(record.summary.messageCount).toBe(1)
    expect(readObservedSession("ses_partial_metadata_failure")?.summary.sessionID).toBe("ses_partial_metadata_failure")
  })
})

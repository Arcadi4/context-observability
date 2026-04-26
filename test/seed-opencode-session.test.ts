import { Database } from "bun:sqlite"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

import {
  createSeedRows,
  buildSeedSessionState,
  createRichTestSessionFixture,
  parseSeedSessionArgs,
  seedRichSessionDatabase,
} from "../scripts/seed-opencode-session-lib.ts"

describe("parseSeedSessionArgs", () => {
  test("uses isolated dev profile defaults", () => {
    expect(parseSeedSessionArgs([])).toEqual({
      dbPath: null,
      profileDir: null,
      projectPath: null,
      sessionID: null,
      title: "Context Observability Fixture",
    })
  })

  test("parses explicit seed options", () => {
    expect(
      parseSeedSessionArgs([
        "--db",
        "/tmp/opencode.db",
        "--profile-dir",
        "/tmp/opencode-profile",
        "--project",
        "/repo/project",
        "--session-id",
        "ses_custom",
        "--title",
        "All Context Fixture",
      ]),
    ).toEqual({
      dbPath: "/tmp/opencode.db",
      profileDir: "/tmp/opencode-profile",
      projectPath: "/repo/project",
      sessionID: "ses_custom",
      title: "All Context Fixture",
    })
  })
})

describe("buildSeedSessionState", () => {
  test("targets the isolated test database by default", () => {
    expect(
      buildSeedSessionState({
        args: parseSeedSessionArgs([]),
        rootDir: "/repo/context-observability",
      }),
    ).toMatchObject({
      dataDir: "/repo/context-observability/.opencode-dev/data/opencode",
      dbPath: "/repo/context-observability/.opencode-dev/data/opencode/opencode.db",
      projectPath: "/repo/context-observability",
    })
  })
})

describe("createRichTestSessionFixture", () => {
  test("covers the context categories the observability plugin needs", () => {
    const fixture = createRichTestSessionFixture({
      projectPath: "/repo/context-observability",
      sessionID: "ses_fixture",
      title: "All Context Fixture",
    })

    expect(fixture.session.id).toBe("ses_fixture")
    expect(fixture.session.title).toBe("All Context Fixture")
    expect(fixture.messages.map((message) => message.info.role)).toEqual([
      "user",
      "user",
      "assistant",
      "user",
      "assistant",
    ])

    expect(fixture.messages.flatMap((message) => message.parts).map((part) => part.type)).toEqual(
      expect.arrayContaining([
        "text",
        "tool",
        "file",
        "step-start",
        "step-finish",
        "reasoning",
        "compaction",
      ]),
    )
    expect(fixture.context.systemPrompt).toContain("Context observability fixture")
    expect(fixture.context.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["bash", "grep", "read"]))
    expect(fixture.context.skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining(["systematic-debugging", "test-driven-development"]),
    )
    expect(fixture.context.customCommands.map((command) => command.name)).toContain("context")
    expect(fixture.todo.map((item) => item.status)).toEqual(expect.arrayContaining(["completed", "in_progress", "pending"]))
    expect(fixture.diff.map((item) => item.file)).toEqual(expect.arrayContaining(["src/server.ts", "src/tui/dialog.tsx"]))
  })
})

describe("createSeedRows", () => {
  test("creates SQLite rows for OpenCode project/session/message/part/todo/session_entry tables", () => {
    const fixture = createRichTestSessionFixture({
      projectPath: "/repo/context-observability",
      sessionID: "ses_fixture",
      title: "All Context Fixture",
    })

    const rows = createSeedRows({ fixture, projectPath: "/repo/context-observability" })

    expect(rows.project).toMatchObject({
      id: "project_context-observability",
      worktree: "/repo/context-observability",
      sandboxes: "[]",
    })
    expect(rows.session).toMatchObject({
      id: "ses_fixture",
      project_id: "project_context-observability",
      title: "All Context Fixture",
      workspace_id: null,
    })
    expect(rows.messages).toHaveLength(5)
    expect(rows.parts.length).toBeGreaterThan(8)
    expect(JSON.parse(rows.messages[0]!.data)).toMatchObject({ role: "user", system: expect.any(String) })
    expect(JSON.parse(rows.parts.find((part) => part.id.endsWith("tool-grep"))!.data)).toMatchObject({
      type: "tool",
      tool: "grep",
      state: { status: "completed" },
    })
    expect(rows.todos).toHaveLength(3)
    expect(rows.entries.map((entry) => entry.type)).toEqual(expect.arrayContaining(["user", "assistant", "compaction"]))
  })

  test("uses OpenCode's cached git project id when available", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "opencode-project-id-"))
    try {
      const projectPath = path.join(tempDir, "context-observability")
      const gitDir = path.join(projectPath, ".git")
      mkdirSync(gitDir, { recursive: true })
      writeFileSync(path.join(gitDir, "opencode"), "cached-opencode-project-id\n")

      const fixture = createRichTestSessionFixture({
        projectPath,
        sessionID: "ses_fixture",
        title: "All Context Fixture",
      })

      const rows = createSeedRows({ fixture, projectPath })

      expect(rows.project.id).toBe("cached-opencode-project-id")
      expect(rows.session.project_id).toBe("cached-opencode-project-id")
      expect(rows.session.workspace_id).toBeNull()
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })
})

describe("seedRichSessionDatabase", () => {
  test("creates an isolated SQLite database and inserts the rich fixture idempotently", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "opencode-seed-"))
    try {
      const dbPath = path.join(tempDir, "opencode.db")
      const fixture = createRichTestSessionFixture({
        projectPath: "/repo/context-observability",
        sessionID: "ses_fixture",
        title: "All Context Fixture",
      })

      const first = seedRichSessionDatabase({ dbPath, fixture, projectPath: "/repo/context-observability" })
      const second = seedRichSessionDatabase({ dbPath, fixture, projectPath: "/repo/context-observability" })

      expect(first).toMatchObject({ sessionID: "ses_fixture", messageCount: 5, todoCount: 3 })
      expect(second).toMatchObject({ sessionID: "ses_fixture", messageCount: 5, todoCount: 3 })

      const db = new Database(dbPath, { readonly: true })
      try {
        expect(db.query("select count(*) as count from session where id = ?").get("ses_fixture")).toEqual({ count: 1 })
        expect(db.query("select count(*) as count from message where session_id = ?").get("ses_fixture")).toEqual({ count: 5 })
        expect(db.query("select count(*) as count from todo where session_id = ?").get("ses_fixture")).toEqual({ count: 3 })
        expect(db.query("select type from session_entry where session_id = ? order by time_created").all("ses_fixture")).toEqual(
          expect.arrayContaining([{ type: "user" }, { type: "assistant" }, { type: "compaction" }]),
        )
      } finally {
        db.close()
      }
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })
})

#!/usr/bin/env bun
import path from "node:path"

import {
  buildSeedSessionState,
  createRichTestSessionFixture,
  parseSeedSessionArgs,
  seedRichSessionDatabase,
} from "./seed-opencode-session-lib.ts"

function printUsage() {
  console.log(`Inject a rich synthetic OpenCode session into the isolated test database.

Usage:
  bun ./scripts/seed-opencode-session.ts [options]

Options:
  --db <path>             Explicit OpenCode SQLite database path.
  --profile-dir <path>    Isolated profile directory. Defaults to ./.opencode-dev.
  --project <path>        Project path to attach to the fixture. Defaults to cwd.
  --session-id <id>       Session id. Defaults to a deterministic rich fixture id.
  --title <title>         Session title.
  -h, --help              Show this help.
`)
}

async function main() {
  const rawArgs = process.argv.slice(2)
  if (rawArgs.includes("-h") || rawArgs.includes("--help")) {
    printUsage()
    return
  }

  const args = parseSeedSessionArgs(rawArgs)
  const rootDir = process.cwd()
  const state = buildSeedSessionState({ args, rootDir })
  const fixture = createRichTestSessionFixture({
    projectPath: state.projectPath,
    sessionID: args.sessionID ?? "ses_context_observability_fixture",
    title: args.title,
  })
  const result = seedRichSessionDatabase({ dbPath: state.dbPath, fixture, projectPath: state.projectPath })

  console.log("==> Seeded rich OpenCode fixture")
  console.log(`    session: ${result.sessionID}`)
  console.log(`    title:   ${fixture.session.title}`)
  console.log(`    db:      ${path.relative(rootDir, state.dbPath)}`)
  console.log(`    rows:    ${result.messageCount} messages, ${result.partCount} parts, ${result.todoCount} todos`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})

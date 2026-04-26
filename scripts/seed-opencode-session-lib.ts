import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

export type SeedSessionArgs = {
  dbPath: string | null
  profileDir: string | null
  projectPath: string | null
  sessionID: string | null
  title: string
}

export type SeedSessionState = {
  dataDir: string
  dbPath: string
  profileDir: string
  projectPath: string
  rootDir: string
}

type ToolDefinition = {
  description: string
  name: string
}

type SkillDefinition = {
  description: string
  name: string
}

type CustomCommandDefinition = {
  name: string
  template: string
}

type RichMessageInfo = {
  agent: string
  cost?: number
  finish?: string
  id: string
  mode?: string
  model?: {
    modelID: string
    providerID: string
    variant?: string
  }
  modelID?: string
  parentID?: string
  path?: {
    cwd: string
    root: string
  }
  providerID?: string
  role: "assistant" | "user"
  sessionID: string
  system?: string
  time: {
    completed?: number
    created: number
  }
  tokens?: {
    cache: { read: number; write: number }
    input: number
    output: number
    reasoning: number
  }
  tools?: Record<string, { description: string }>
}

type RichMessage = {
  info: RichMessageInfo
  parts: Array<Record<string, unknown>>
}

export type RichSessionFixture = {
  context: {
    customCommands: CustomCommandDefinition[]
    skills: SkillDefinition[]
    systemPrompt: string
    tools: ToolDefinition[]
  }
  diff: Array<{ added: number; file: string; removed: number }>
  messages: RichMessage[]
  session: {
    id: string
    parentID: string | null
    title: string
    time: {
      created: number
      updated: number
    }
    version: string
  }
  todo: Array<{ content: string; id: string; priority: string; status: string }>
}

export type ProjectSeedRow = {
  commands: string
  icon_color: string | null
  icon_url: string | null
  icon_url_override: string | null
  id: string
  name: string
  sandboxes: string
  time_created: number
  time_initialized: number
  time_updated: number
  vcs: string
  worktree: string
}

export type SessionSeedRow = {
  directory: string
  id: string
  parent_id: string | null
  permission: string
  project_id: string
  revert: string
  share_url: string | null
  slug: string
  summary_additions: number
  summary_deletions: number
  summary_diffs: string
  summary_files: number
  time_archived: number | null
  time_compacting: number | null
  time_created: number
  time_updated: number
  title: string
  version: string
  workspace_id: string | null
}

export type MessageSeedRow = {
  data: string
  id: string
  session_id: string
  time_created: number
  time_updated: number
}

export type PartSeedRow = {
  data: string
  id: string
  message_id: string
  session_id: string
  time_created: number
  time_updated: number
}

export type TodoSeedRow = {
  content: string
  priority: string
  session_id: string
  status: string
  time_created: number
  time_updated: number
  position: number
}

export type SessionEntrySeedRow = {
  data: string
  id: string
  session_id: string
  time_created: number
  time_updated: number
  type: string
}

export type SeedRows = {
  entries: SessionEntrySeedRow[]
  messages: MessageSeedRow[]
  parts: PartSeedRow[]
  project: ProjectSeedRow
  session: SessionSeedRow
  todos: TodoSeedRow[]
}

export type SeedDatabaseResult = {
  dbPath: string
  messageCount: number
  partCount: number
  sessionID: string
  todoCount: number
}

export function parseSeedSessionArgs(argv: string[]): SeedSessionArgs {
  const parsed: SeedSessionArgs = {
    dbPath: null,
    profileDir: null,
    projectPath: null,
    sessionID: null,
    title: "Context Observability Fixture",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    switch (value) {
      case "--db":
        parsed.dbPath = readOptionValue(argv, index, value)
        index += 1
        break
      case "--profile-dir":
        parsed.profileDir = readOptionValue(argv, index, value)
        index += 1
        break
      case "--project":
        parsed.projectPath = readOptionValue(argv, index, value)
        index += 1
        break
      case "--session-id":
        parsed.sessionID = readOptionValue(argv, index, value)
        index += 1
        break
      case "--title":
        parsed.title = readOptionValue(argv, index, value)
        index += 1
        break
      case "-h":
      case "--help":
        break
      default:
        throw new Error(`Unknown option: ${value}`)
    }
  }

  return parsed
}

export function buildSeedSessionState(input: { args: SeedSessionArgs; rootDir: string }): SeedSessionState {
  const profileDir = input.args.profileDir ?? path.join(input.rootDir, ".opencode-dev")
  const dataDir = path.join(profileDir, "data", "opencode")
  return {
    dataDir,
    dbPath: input.args.dbPath ?? path.join(dataDir, "opencode.db"),
    profileDir,
    projectPath: input.args.projectPath ?? input.rootDir,
    rootDir: input.rootDir,
  }
}

export function createRichTestSessionFixture(input: {
  projectPath: string
  sessionID: string
  title: string
}): RichSessionFixture {
  const created = Date.UTC(2026, 3, 26, 12, 0, 0)
  const sessionID = input.sessionID
  const model = { providerID: "fixture", modelID: "context-observability-fixture" }
  const tools = {
    bash: { description: "Execute shell commands in the workspace" },
    grep: { description: "Search file contents" },
    read: { description: "Read files from the workspace" },
  }

  return {
    context: {
      customCommands: [
        { name: "context", template: "/context $ARGUMENTS" },
        { name: "review-context", template: "Summarize current context health" },
      ],
      skills: [
        { name: "systematic-debugging", description: "Trace root causes before fixing symptoms" },
        { name: "test-driven-development", description: "Write failing tests before implementation" },
        { name: "verification-before-completion", description: "Verify behavior before claiming completion" },
      ],
      systemPrompt: [
        "Context observability fixture system prompt.",
        "This synthetic session intentionally includes tools, skills, commands, todos, diffs, reasoning, and compaction markers.",
        `Workspace: ${input.projectPath}`,
      ].join("\n"),
      tools: [
        { name: "bash", description: tools.bash.description },
        { name: "grep", description: tools.grep.description },
        { name: "read", description: tools.read.description },
      ],
    },
    diff: [
      { added: 42, file: "src/server.ts", removed: 8 },
      { added: 35, file: "src/tui/dialog.tsx", removed: 12 },
    ],
    messages: [
      {
        info: {
          agent: "build",
          id: `${sessionID}-msg-system-context`,
          model,
          role: "user",
          sessionID,
          system: [
            "Context observability fixture system prompt.",
            "Enabled skills: systematic-debugging, test-driven-development, verification-before-completion.",
            "Enabled custom commands: /context, /review-context.",
          ].join("\n"),
          time: { created },
          tools,
        },
        parts: [
          {
            text: "Synthetic setup message carrying system prompt, tool registry, skills, and command context.",
            type: "text",
          },
        ],
      },
      {
        info: {
          agent: "build",
          id: `${sessionID}-msg-user-1`,
          model,
          role: "user",
          sessionID,
          time: { created: created + 1_000 },
          tools,
        },
        parts: [
          {
            text: "Create a context observability plugin and inspect all context surfaces.",
            type: "text",
          },
          {
            filename: "AGENTS.md",
            mime: "text/markdown",
            source: { path: path.join(input.projectPath, "AGENTS.md") },
            type: "file",
            url: `file://${path.join(input.projectPath, "AGENTS.md")}`,
          },
        ],
      },
      {
        info: {
          agent: "build",
          cost: 0.0042,
          finish: "stop",
          id: `${sessionID}-msg-assistant-1`,
          mode: "build",
          modelID: model.modelID,
          parentID: `${sessionID}-msg-user-1`,
          path: { cwd: input.projectPath, root: input.projectPath },
          providerID: model.providerID,
          role: "assistant",
          sessionID,
          time: { created: created + 2_000, completed: created + 2_700 },
          tokens: { cache: { read: 128, write: 64 }, input: 1200, output: 450, reasoning: 90 },
        },
        parts: [
          { snapshot: "fixture-snapshot-before-tool", type: "step-start" },
          {
            metadata: { category: "schema-analysis" },
            text: "Need to inspect plugin APIs, command registration, and storage paths.",
            time: { start: created + 2_050, end: created + 2_150 },
            type: "reasoning",
          },
          {
            callID: `${sessionID}-call-grep`,
            state: {
              input: { pattern: "command.register", path: "../opencode" },
              metadata: { source: "fixture" },
              output: "packages/opencode/src/cli/cmd/tui/plugin/api.tsx: command.register",
              status: "completed",
              time: { start: created + 2_150, end: created + 2_300 },
              title: "Search OpenCode TUI plugin command registration",
            },
            tool: "grep",
            type: "tool",
          },
          {
            cost: 0.0042,
            reason: "stop",
            tokens: { cache: { read: 128, write: 64 }, input: 1200, output: 450, reasoning: 90 },
            type: "step-finish",
          },
        ],
      },
      {
        info: {
          agent: "build",
          id: `${sessionID}-msg-user-2`,
          model,
          role: "user",
          sessionID,
          time: { created: created + 3_000 },
          tools,
        },
        parts: [
          {
            text: "Now seed a test database session that contains tools, skills, system prompt, and other context.",
            type: "text",
          },
        ],
      },
      {
        info: {
          agent: "build",
          cost: 0.0021,
          finish: "stop",
          id: `${sessionID}-msg-assistant-2`,
          mode: "build",
          modelID: model.modelID,
          parentID: `${sessionID}-msg-user-2`,
          path: { cwd: input.projectPath, root: input.projectPath },
          providerID: model.providerID,
          role: "assistant",
          sessionID,
          time: { created: created + 4_000, completed: created + 4_600 },
          tokens: { cache: { read: 80, write: 32 }, input: 900, output: 320, reasoning: 70 },
        },
        parts: [
          {
            text: "I will inject a synthetic rich session for observability testing.",
            type: "text",
          },
          {
            callID: `${sessionID}-call-bash`,
            state: {
              input: { command: "bun test test/seed-opencode-session.test.ts" },
              metadata: { source: "fixture" },
              output: "4 pass, 0 fail",
              status: "completed",
              time: { start: created + 4_100, end: created + 4_350 },
              title: "Run seed fixture tests",
            },
            tool: "bash",
            type: "tool",
          },
          {
            cost: 0.0021,
            reason: "stop",
            tokens: { cache: { read: 80, write: 32 }, input: 900, output: 320, reasoning: 70 },
            type: "step-finish",
          },
          {
            messageID: `${sessionID}-msg-assistant-1`,
            summary: "Compacted earlier plugin research, command registration, DB schema notes, and verification evidence.",
            tokens: { before: 12_000, after: 3_200 },
            type: "compaction",
          },
        ],
      },
    ],
    session: {
      id: sessionID,
      parentID: null,
      time: {
        created,
        updated: created + 4_600,
      },
      title: input.title,
      version: "0.0.0-fixture",
    },
    todo: [
      { content: "Inspect OpenCode schema", id: `${sessionID}-todo-1`, priority: "high", status: "completed" },
      { content: "Inject rich fixture", id: `${sessionID}-todo-2`, priority: "high", status: "in_progress" },
      { content: "Open /context dialog", id: `${sessionID}-todo-3`, priority: "medium", status: "pending" },
    ],
  }
}

export function createSeedRows(input: { fixture: RichSessionFixture; projectPath: string }): SeedRows {
  const projectID = createProjectID(input.projectPath)
  const created = input.fixture.session.time.created
  const commands = Object.fromEntries(input.fixture.context.customCommands.map((command) => [command.name, command]))
  const project: ProjectSeedRow = {
    commands: JSON.stringify(commands),
    icon_color: null,
    icon_url: null,
    icon_url_override: null,
    id: projectID,
    name: path.basename(input.projectPath),
    sandboxes: "[]",
    time_created: created,
    time_initialized: created,
    time_updated: input.fixture.session.time.updated,
    vcs: "git",
    worktree: input.projectPath,
  }
  const session: SessionSeedRow = {
    directory: input.projectPath,
    id: input.fixture.session.id,
    parent_id: input.fixture.session.parentID,
    permission: JSON.stringify({}),
    project_id: projectID,
    revert: JSON.stringify({}),
    share_url: null,
    slug: slugify(input.fixture.session.title),
    summary_additions: input.fixture.diff.reduce((total, item) => total + item.added, 0),
    summary_deletions: input.fixture.diff.reduce((total, item) => total + item.removed, 0),
    summary_diffs: JSON.stringify(input.fixture.diff),
    summary_files: input.fixture.diff.length,
    time_archived: null,
    time_compacting: null,
    time_created: created,
    time_updated: input.fixture.session.time.updated,
    title: input.fixture.session.title,
    version: input.fixture.session.version,
    workspace_id: null,
  }
  const messages = input.fixture.messages.map<MessageSeedRow>((message) => ({
    data: JSON.stringify(omitKeys(message.info, ["id", "sessionID"])),
    id: message.info.id,
    session_id: input.fixture.session.id,
    time_created: message.info.time.created,
    time_updated: message.info.time.completed ?? message.info.time.created,
  }))
  const parts = input.fixture.messages.flatMap<PartSeedRow>((message) =>
    message.parts.map((part, index) => {
      const partID = typeof part.callID === "string" ? `${message.info.id}-tool-${part.tool}` : `${message.info.id}-part-${index + 1}`
      const timestamp = message.info.time.created + index
      return {
        data: JSON.stringify(part),
        id: partID,
        message_id: message.info.id,
        session_id: input.fixture.session.id,
        time_created: timestamp,
        time_updated: timestamp,
      }
    }),
  )
  const todos = input.fixture.todo.map<TodoSeedRow>((todo, index) => ({
    content: todo.content,
    priority: todo.priority,
    session_id: input.fixture.session.id,
    status: todo.status,
    time_created: created + index,
    time_updated: input.fixture.session.time.updated,
    position: index,
  }))
  const entries = createSessionEntries(input.fixture)

  return { entries, messages, parts, project, session, todos }
}

export function seedRichSessionDatabase(input: { dbPath: string; fixture: RichSessionFixture; projectPath: string }): SeedDatabaseResult {
  mkdirSync(path.dirname(input.dbPath), { recursive: true })
  const rows = createSeedRows({ fixture: input.fixture, projectPath: input.projectPath })
  const db = new Database(input.dbPath)
  try {
    ensureSchema(db)
    db.transaction(() => {
      deleteExistingFixtureRows(db, rows.session.id, rows.project.id)
      insertProject(db, rows.project)
      insertSession(db, rows.session)
      for (const message of rows.messages) insertMessage(db, message)
      for (const part of rows.parts) insertPart(db, part)
      for (const todo of rows.todos) insertTodo(db, todo)
      for (const entry of rows.entries) insertSessionEntry(db, entry)
    })()
  } finally {
    db.close()
  }

  return {
    dbPath: input.dbPath,
    messageCount: rows.messages.length,
    partCount: rows.parts.length,
    sessionID: rows.session.id,
    todoCount: rows.todos.length,
  }
}

function createSessionEntries(fixture: RichSessionFixture): SessionEntrySeedRow[] {
  return fixture.messages.map<SessionEntrySeedRow>((message, index) => {
    const type = index === fixture.messages.length - 1 ? "compaction" : message.info.role
    const entryData = type === "compaction" ? createCompactionEntryData(message) : createMessageEntryData(message)
    return {
      data: JSON.stringify(entryData),
      id: `${message.info.id}-entry`,
      session_id: fixture.session.id,
      time_created: message.info.time.created,
      time_updated: message.info.time.completed ?? message.info.time.created,
      type,
    }
  })
}

function createMessageEntryData(message: RichMessage) {
  if (message.info.role === "user") {
    return {
      agent: message.info.agent,
      files: message.parts.filter((part) => part.type === "file"),
      metadata: { fixture: true },
      text: message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n"),
      time: message.info.time,
    }
  }
  return {
    agent: message.info.agent,
    content: message.parts,
    cost: message.info.cost ?? 0,
    metadata: { fixture: true },
    time: message.info.time,
    tokens: message.info.tokens ?? { cache: { read: 0, write: 0 }, input: 0, output: 0, reasoning: 0 },
  }
}

function createCompactionEntryData(message: RichMessage) {
  const compaction = message.parts.find((part) => part.type === "compaction")
  return {
    metadata: { fixture: true },
    summary: typeof compaction?.summary === "string" ? compaction.summary : "Fixture compaction entry",
    time: message.info.time,
  }
}

function ensureSchema(db: Database) {
  db.exec(`
    create table if not exists project (
      id text primary key,
      worktree text not null,
      vcs text,
      name text not null,
      icon_url text,
      icon_url_override text,
      icon_color text,
      time_created integer not null,
      time_updated integer not null,
      time_initialized integer not null,
      sandboxes text not null,
      commands text
    );
    create table if not exists session (
      id text primary key,
      project_id text not null,
      workspace_id text,
      parent_id text,
      slug text not null,
      directory text not null,
      title text not null,
      version text not null,
      share_url text,
      summary_additions integer not null default 0,
      summary_deletions integer not null default 0,
      summary_files integer not null default 0,
      summary_diffs text not null default '[]',
      revert text not null default '{}',
      permission text not null default '{}',
      time_created integer not null,
      time_updated integer not null,
      time_compacting integer,
      time_archived integer,
      foreign key(project_id) references project(id) on delete cascade
    );
    create table if not exists message (
      id text primary key,
      session_id text not null,
      time_created integer not null,
      time_updated integer not null,
      data text not null,
      foreign key(session_id) references session(id) on delete cascade
    );
    create table if not exists part (
      id text primary key,
      message_id text not null,
      session_id text not null,
      time_created integer not null,
      time_updated integer not null,
      data text not null,
      foreign key(message_id) references message(id) on delete cascade,
      foreign key(session_id) references session(id) on delete cascade
    );
    create table if not exists todo (
      session_id text not null,
      content text not null,
      status text not null,
      priority text not null,
      position integer not null,
      time_created integer not null,
      time_updated integer not null,
      primary key(session_id, position),
      foreign key(session_id) references session(id) on delete cascade
    );
    create table if not exists session_entry (
      id text primary key,
      session_id text not null,
      type text not null,
      time_created integer not null,
      time_updated integer not null,
      data text not null,
      foreign key(session_id) references session(id) on delete cascade
    );
  `)
}

function deleteExistingFixtureRows(db: Database, sessionID: string, projectID: string) {
  db.query("delete from session_entry where session_id = ?").run(sessionID)
  db.query("delete from todo where session_id = ?").run(sessionID)
  db.query("delete from part where session_id = ?").run(sessionID)
  db.query("delete from message where session_id = ?").run(sessionID)
  db.query("delete from session where id = ?").run(sessionID)
  db.query("delete from project where id = ?").run(projectID)
}

function insertProject(db: Database, row: ProjectSeedRow) {
  db.query(`
    insert into project (id, worktree, vcs, name, icon_url, icon_url_override, icon_color, time_created, time_updated, time_initialized, sandboxes, commands)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.worktree,
    row.vcs,
    row.name,
    row.icon_url,
    row.icon_url_override,
    row.icon_color,
    row.time_created,
    row.time_updated,
    row.time_initialized,
    row.sandboxes,
    row.commands,
  )
}

function insertSession(db: Database, row: SessionSeedRow) {
  db.query(`
    insert into session (id, project_id, workspace_id, parent_id, slug, directory, title, version, share_url, summary_additions, summary_deletions, summary_files, summary_diffs, revert, permission, time_created, time_updated, time_compacting, time_archived)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.project_id,
    row.workspace_id,
    row.parent_id,
    row.slug,
    row.directory,
    row.title,
    row.version,
    row.share_url,
    row.summary_additions,
    row.summary_deletions,
    row.summary_files,
    row.summary_diffs,
    row.revert,
    row.permission,
    row.time_created,
    row.time_updated,
    row.time_compacting,
    row.time_archived,
  )
}

function insertMessage(db: Database, row: MessageSeedRow) {
  db.query("insert into message (id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?)").run(
    row.id,
    row.session_id,
    row.time_created,
    row.time_updated,
    row.data,
  )
}

function insertPart(db: Database, row: PartSeedRow) {
  db.query("insert into part (id, message_id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)").run(
    row.id,
    row.message_id,
    row.session_id,
    row.time_created,
    row.time_updated,
    row.data,
  )
}

function insertTodo(db: Database, row: TodoSeedRow) {
  db.query("insert into todo (session_id, content, status, priority, position, time_created, time_updated) values (?, ?, ?, ?, ?, ?, ?)").run(
    row.session_id,
    row.content,
    row.status,
    row.priority,
    row.position,
    row.time_created,
    row.time_updated,
  )
}

function insertSessionEntry(db: Database, row: SessionEntrySeedRow) {
  db.query("insert into session_entry (id, session_id, type, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)").run(
    row.id,
    row.session_id,
    row.type,
    row.time_created,
    row.time_updated,
    row.data,
  )
}

function createProjectID(projectPath: string) {
  const cachedID = readCachedOpenCodeProjectID(projectPath)
  if (cachedID) return cachedID

  const gitRootCommitID = readGitRootCommitID(projectPath)
  if (gitRootCommitID) return gitRootCommitID

  return `project_${slugify(path.basename(projectPath))}`
}

function readCachedOpenCodeProjectID(projectPath: string) {
  const directGitFile = path.join(projectPath, ".git", "opencode")
  const directValue = readNonEmptyTextFile(directGitFile)
  if (directValue) return directValue

  const gitCommonDir = readGitCommonDir(projectPath)
  const commonValue = gitCommonDir ? readNonEmptyTextFile(path.join(gitCommonDir, "opencode")) : null
  if (commonValue) return commonValue

  return null
}

function readNonEmptyTextFile(filePath: string) {
  if (!existsSync(filePath)) return null
  const value = readFileSync(filePath, "utf8").trim()
  return value || null
}

function spawnGit(projectPath: string, args: string[]) {
  const git = Bun.which("git")
  if (!git) return null

  try {
    return Bun.spawnSync([git, ...args], {
      cwd: projectPath,
      stderr: "ignore",
      stdout: "pipe",
    })
  } catch {
    return null
  }
}

function readGitCommonDir(projectPath: string) {
  const result = spawnGit(projectPath, ["rev-parse", "--git-common-dir"])
  if (!result) return null
  if (result.exitCode !== 0) return null

  const rawPath = new TextDecoder().decode(result.stdout).trim()
  if (!rawPath) return null

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(projectPath, rawPath)
}

function readGitRootCommitID(projectPath: string) {
  const result = spawnGit(projectPath, ["rev-list", "--max-parents=0", "HEAD"])
  if (!result) return null
  if (result.exitCode !== 0) return null

  const roots = new TextDecoder().decode(result.stdout).split("\n").map((value) => value.trim()).filter(Boolean).sort()
  return roots[0] ?? null
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fixture"
}

function omitKeys<T extends Record<string, unknown>, K extends keyof T>(value: T, keys: K[]): Omit<T, K> {
  const entries = Object.entries(value).filter(([key]) => !keys.includes(key as K))
  return Object.fromEntries(entries) as Omit<T, K>
}

function readOptionValue(argv: string[], index: number, option: string) {
  const nextValue = argv[index + 1]
  if (!nextValue) throw new Error(`Missing value for ${option}`)
  return nextValue
}

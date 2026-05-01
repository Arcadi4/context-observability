# Context Observability

Break down your OpenCode context usage.

An OpenCode plugin that surfaces API calls as first-class context items in the GUI. It helps you understand what your session is doing by showing which LLM provider endpoints were called, with what request shape, and how long each call took.

## What This Is

A GUI context breakdown tool. It intercepts LLM API requests during your OpenCode session and displays them alongside messages, files, and tool calls in the Context Observability dialog. The captured data exists only in memory for the current session. It is not a request logger, observability platform, or log export tool.

## Architecture

### Dual-Layer Probe

The plugin intercepts API requests at two levels to maximize coverage:

1. **Global fetch wrapper** (`globalThis.fetch`) — catches all outgoing HTTP requests from the OpenCode process.
2. **chat.params fetch wrapper** — catches OpenCode-specific fetch overrides passed through `output.options.fetch`.

Both layers classify requests by provider family and body shape. A deduplication mechanism (WeakSet for object identity plus a bounded deterministic key cache for equivalent payloads) ensures the same request is never captured twice when both layers see it.

### Request-Only Capture

The probe captures **request metadata only**. It does not read, clone, or inspect response bodies or streams. For each intercepted request, the plugin records:

| Field | Description |
|---|---|
| `id` | Unique record identifier |
| `timestamp` | ISO 8601 timestamp of the request |
| `url` | Full request URL |
| `method` | HTTP method (GET, POST, etc.) |
| `provider` | Provider family: `anthropic`, `openai`, `gemini`, `bedrock`, or `unknown` |
| `bodyShape` | Request body shape: `messages`, `input`, `contents`, or `unknown` |
| `bodyPreview` | Truncated request body preview (bounded by `maxBodyBytes`) |
| `bodyTruncated` | Whether the body was truncated |
| `originalBodyBytes` | Original body size in bytes before truncation |
| `timing` | `startedAt`, `endedAt`, and `durationMs` |
| `sessionID` | OpenCode session ID (from `x-opencode-session` header or `chat.params` context) |
| `source` | Capture source: `global` or `chat.params` |

### Bounded In-Memory Store

Captured records live in a session-scoped, in-memory truth store. There is no file persistence, no log directory, and no export mechanism. The store enforces these bounds:

| Bound | Default | Description |
|---|---|---|
| `maxRecentPerSession` | 50 | Maximum API call records retained per session (oldest evicted first) |
| `maxBodyBytes` | 1024 | Maximum bytes retained for request body preview |

When a body exceeds `maxBodyBytes`, the preview is truncated by byte boundary (not character boundary) and `bodyTruncated` is set to `true` with `originalBodyBytes` recording the full size.

### Hybrid Runtime

The probe is the primary source for API call data. Existing OpenCode hooks remain active for session metadata enrichment (title, workspace, messages, todos, diffs, token counts). When the session API is unavailable, API call records are still retained and displayed.

### Session Summary Metrics

The session summary includes an `apiCalls` section with:

- `count` — total API calls captured
- `providers` — distribution by provider family
- `requestBytes` — total, average, and max request body sizes
- `timing` — average and total duration
- `estimatedInputTokens` — fallback token estimate from request body

## GUI

### Launching the Dialog

The verified launch path uses the command palette:

1. Press `Ctrl+P`
2. Search for `Context`
3. Select `Context Observability`

The dialog renders using OpenCode's `DialogSelect` component. It displays context items (messages, files, tools, and API calls) with filter tabs:

- `[1] All` — all context items
- `[2] Messages` — user and assistant messages
- `[3] Files` — file-related context items
- `[4] API` — API call context items only

When no observation data is available, the dialog shows a fallback message: "No observation data yet."

### API Call Context Items

API calls appear as compact rows with:

- **Title**: HTTP method, provider family, and hostname
- **Preview**: Truncated request body summary
- **Footer**: Timing and token information

## Limitations

- **GUI only**: Captured data is displayed in the dialog. It is not written to files, exported, or available as analytics.
- **No response capture**: Response bodies and streams are not inspected or recorded.
- **No persistence**: Records exist only in memory for the current session. They are lost when the session ends.
- **No export**: There is no mechanism to export, download, or browse captured records outside the GUI.
- **No persistent log browsing**: The plugin does not create or maintain log files.

## Development

### Prerequisites

- [Bun](https://bun.sh/) runtime

### Commands

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Run all checks (typecheck + tests)
bun run check
```

### Project Structure

```
src/
  server/
    probe.ts              # Dual-layer fetch interception
    api-call-truth-store.ts  # Bounded in-memory session store
    request-classifier.ts    # Provider and body shape classification
    runtime.ts               # Session correlation and enrichment
    bridge.ts                # TUI data access abstraction
    store.ts                 # Session observation store
  shared/
    types.ts                 # Shared type definitions
    session-summary.ts       # Summary aggregation
    token-counter.ts         # Token estimation
  tui/
    dialog.tsx               # DialogSelect UI with API filter
    transform-messages.ts    # Context item transforms
    fallback-record.ts       # Fallback rendering
```

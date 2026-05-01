export type ObservabilityPluginOptions = {
  commandName?: string
  commandTemplate?: string
  maxMessages?: number
  maxRecentSessions?: number
  includeDiff?: boolean
  includeTodos?: boolean
  capture?: {
    experimentalMessagesTransform?: boolean
    sessionCompaction?: boolean
    toolExecutions?: boolean
    onExperimentalFailure?: "ignore" | "warn"
  }
}

export type SessionMessageLike = {
  info?: {
    id?: string
    role?: string
    providerID?: string
    modelID?: string
    provider?: string
    model?: string
    cost?: number
    time?: unknown
    tokens?: {
      input?: number
      output?: number
      reasoning?: number
      cache?: {
        read?: number
        write?: number
      }
    }
  }
  parts?: Array<Record<string, unknown>>
}

export type SessionDiffLike = {
  file?: string
  added?: number
  removed?: number
}

export type SessionTodoLike = {
  id?: string
  status?: string
  content?: string
}

export type SessionSnapshot = {
  session?: {
    id?: string
    title?: string | null
    workspaceID?: string | null
  }
  messages: SessionMessageLike[]
  todo: SessionTodoLike[]
  diff: SessionDiffLike[]
  apiCalls?: ApiCallRecord[]
}

export type SessionSummary = {
  sessionID: string | null
  title: string | null
  workspaceID: string | null
  messageCount: number
  toolCallCount: number
  todo: {
    total: number
    completed: number
    pending: number
    other: number
  }
  diff: {
    files: number
    added: number
    removed: number
  }
  lastUserText: string | null
  generatedAt: string
  tokens: {
    total: number
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
  }
  apiCalls: {
    count: number
    providers: Record<ApiProviderFamily, number>
    requestBytes: { total: number; avg: number; max: number }
    timing: { avgDurationMs: number; totalDurationMs: number }
    estimatedInputTokens: number
  }
}

export type CaptureStatus = "fresh" | "partial" | "degraded" | "error" | "disabled"

export type CaptureSource = "command" | "event" | "tool" | "compaction" | "unknown"

export type CaptureMetadata = {
  status: CaptureStatus
  source: CaptureSource
  capturedAt: string
  partial: boolean
  errorMessage?: string
}

export type ApiCallSource = "global" | "chat.params"

export type ApiProviderFamily =
  | "anthropic"
  | "openai"
  | "gemini"
  | "bedrock"
  | "unknown"

export type ApiCallBodyShape = "messages" | "input" | "contents" | "unknown"

export type ApiCallTiming = {
  startedAt: string
  endedAt?: string
  durationMs?: number
}

export type ApiCallRecord = {
  id: string
  timestamp: string
  url: string
  method: string
  provider: ApiProviderFamily
  bodyShape: ApiCallBodyShape
  bodyPreview: string
  bodyTruncated: boolean
  originalBodyBytes: number
  timing: ApiCallTiming
  sessionID: string
  source: ApiCallSource
  dedupeID?: string
}

export type ApiCallBounds = {
  maxRecentPerSession: number
  maxBodyBytes: number
}

export type CapturedApiCallFact = {
  id: string
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
  capturedAt: string
  source: ApiCallSource
  provider: ApiProviderFamily
  bodyShape: ApiCallBodyShape
  sessionID?: string
}

export type SessionObservationRecord = {
  summary: SessionSummary
  snapshot: SessionSnapshot
  captureMetadata: CaptureMetadata
  apiCalls?: ApiCallRecord[]
}

export type ContextItemType = "user" | "assistant" | "tool" | "file" | "system" | "api-call"

export type ContextItem = {
  id: string
  type: ContextItemType
  title: string
  preview: string
  tokens: number
  timestamp?: string
  metadata?: Record<string, unknown>
}

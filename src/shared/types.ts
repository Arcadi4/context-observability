export type ObservabilityPluginOptions = {
  commandName?: string
  commandTemplate?: string
  maxMessages?: number
  includeDiff?: boolean
  includeTodos?: boolean
  showDialogByDefault?: boolean
  capture?: {
    experimentalMessagesTransform?: boolean
    sessionCompaction?: boolean
    toolExecutions?: boolean
  }
}

export type SessionMessageLike = {
  info?: {
    id?: string
    role?: string
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
}

export type SessionObservationRecord = {
  summary: SessionSummary
  snapshot: SessionSnapshot
}
